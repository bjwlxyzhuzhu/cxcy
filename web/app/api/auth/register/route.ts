import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth-local";
import { withTransaction } from "@/lib/db";

export const runtime = "nodejs";

type Registration = { studentNo?: string; password?: string; name?: string; className?: string; major?: string; college?: string };

export async function POST(req: Request) {
  let body: Registration;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const studentNo = (body.studentNo || "").trim();
  const password = body.password || "";
  const name = (body.name || "").trim();
  const className = (body.className || "").trim();
  const major = (body.major || "").trim();
  const college = (body.college || "").trim();
  if (!studentNo || !password || !name || !className || !major || !college) return NextResponse.json({ error: "请完整填写学号、密码、姓名、班级、专业和学院" }, { status: 400 });
  if (studentNo.length > 64) return NextResponse.json({ error: "学号格式过长" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "密码至少 8 位" }, { status: 400 });
  if ([name, className, major, college].some((v) => v.length > 100)) return NextResponse.json({ error: "姓名、班级、专业或学院信息过长" }, { status: 400 });
  try {
    const passwordHash = await hashPassword(password);
    await withTransaction(async (client) => {
      const result = await client.query<{ id: string }>(
        `insert into public.users (student_no, password_hash, name, role)
         values ($1, $2, $3, 'student'::public.user_role) returning id`,
        [studentNo, passwordHash, name],
      );
      await client.query(
        `insert into public.profiles (id, student_no, name, class, major, college, role, credits)
         values ($1, $2, $3, $4, $5, $6, 'student'::public.user_role, 120)`,
        [result.rows[0].id, studentNo, name, className, major, college],
      );
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/duplicate key|unique constraint/i.test(message)) return NextResponse.json({ error: "该学号已注册，请直接登录" }, { status: 409 });
    return NextResponse.json({ error: "注册失败，请稍后重试" }, { status: 500 });
  }
}

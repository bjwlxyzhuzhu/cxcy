import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth-local";
import { grantReward } from "@/lib/rewards";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { studentNo?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const studentNo = (body.studentNo || "").trim();
  const password = body.password || "";
  if (!studentNo || !password) return NextResponse.json({ error: "请输入学号和密码" }, { status: 400 });

  const { rows } = await query<{ id: string; password_hash: string }>(
    "SELECT id, password_hash FROM users WHERE student_no = $1 LIMIT 1", [studentNo]
  );
  if (!rows[0] || !(await verifyPassword(password, rows[0].password_hash))) {
    return NextResponse.json({ error: "学号或密码错误" }, { status: 401 });
  }
  await createSession(rows[0].id);
  await grantReward(rows[0].id, "daily").catch(() => null);
  return NextResponse.json({ ok: true });
}

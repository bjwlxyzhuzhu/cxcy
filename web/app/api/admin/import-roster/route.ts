import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/db-client";
import { hashPassword } from "@/lib/auth-local";
import { query } from "@/lib/db";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
type Row = { student_no?: string; name?: string; class?: string; college?: string; major?: string };

/** 名册批量导入：建/重置学生登录账号（学号@域名 + 统一初始密码）+ 补 profile + upsert rosters。幂等。 */
export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "无管理员权限" }, { status: 403 });

  let body: { rows?: Row[]; password?: string; credits?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const rows = Array.isArray(body?.rows) ? body!.rows! : [];
  const password = (body?.password || "").trim();
  const credits = Number.isFinite(body?.credits) ? Math.max(0, Math.floor(body!.credits!)) : 120;
  if (!rows.length) return NextResponse.json({ error: "没有可导入的行" }, { status: 400 });
  if (password.length < 6) return NextResponse.json({ error: "初始密码至少 6 位" }, { status: 400 });

  const admin = createAdminClient();
  type R = { student_no: string; name: string; status: "created" | "exists" | "failed"; error?: string };
  const results: R[] = [];
  for (const r of rows) {
    const no = (r.student_no || "").toString().trim();
    const name = (r.name || "").toString().trim();
    const klass = (r.class || "").toString().trim();
    if (!no) { results.push({ student_no: "", name, status: "failed", error: "缺学号" }); continue; }
    let id: string | undefined;
    const status: "created" | "exists" = id ? "exists" : "created";
    try {
      const existing = await query<{ id: string }>("SELECT id FROM users WHERE student_no = $1", [no]);
      id = existing.rows[0]?.id;
      if (id) {
        await query("UPDATE users SET password_hash = $1, name = $2 WHERE id = $3", [await hashPassword(password), name || no, id]);
      } else {
        id = randomUUID();
        await query("INSERT INTO users (id, student_no, password_hash, name, role) VALUES ($1, $2, $3, $4, 'student')", [id, no, await hashPassword(password), name || no]);
      }
      await query(
        `INSERT INTO profiles (id, student_no, name, class, college, major, role, credits)
         VALUES ($1, $2, $3, $4, $5, $6, 'student', $7)
         ON CONFLICT (id) DO UPDATE SET student_no = EXCLUDED.student_no,
           name = EXCLUDED.name, class = EXCLUDED.class, college = EXCLUDED.college,
           major = EXCLUDED.major, role = EXCLUDED.role, credits = EXCLUDED.credits`,
        [id, no, name || no, klass || null, r.college || null, r.major || null, credits],
      );
      await admin.from("rosters").upsert(
        { class: klass, student_no: no, name: name || no, college: r.college || null, major: r.major || null },
        { onConflict: "class,student_no" }
      );
      results.push({ student_no: no, name: name || no, status });
    } catch (e) {
      results.push({ student_no: no, name, status: "failed", error: e instanceof Error ? e.message : "未知错误" });
    }
  }

  return NextResponse.json({
    created: results.filter((r) => r.status === "created").length,
    exists: results.filter((r) => r.status === "exists").length,
    failed: results.filter((r) => r.status === "failed").length,
    results, password,
  });
}

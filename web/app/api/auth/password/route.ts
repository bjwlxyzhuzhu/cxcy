import { NextResponse } from "next/server";
import { hashPassword } from "@/lib/auth-local";
import { query } from "@/lib/db";
import { getSessionUser } from "@/lib/auth-local";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  let body: { password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  if (!body.password || body.password.length < 8) return NextResponse.json({ error: "密码至少 8 位" }, { status: 400 });
  await query("UPDATE users SET password_hash = $1 WHERE id = $2", [await hashPassword(body.password), user.id]);
  await query("DELETE FROM sessions WHERE user_id = $1", [user.id]);
  return NextResponse.json({ ok: true });
}

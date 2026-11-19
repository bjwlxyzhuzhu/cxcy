import { NextResponse } from "next/server";
import { getUser, setPassword } from "@/lib/auth";
import { SESSION_COOKIE, signSession, cookieOptions, requestIsHttps } from "@/lib/session";

export const runtime = "nodejs";

/** 修改本人密码：其它设备上的旧会话随即失效，当前设备换发新会话 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  let body: { password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const pwd = String(body.password || "");
  if (pwd.length < 6) return NextResponse.json({ error: "密码至少 6 位" }, { status: 400 });
  if (pwd.length > 128) return NextResponse.json({ error: "密码过长" }, { status: 400 });
  const v = setPassword(user.id, pwd);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await signSession(user.id, v), cookieOptions(requestIsHttps(req)));
  return res;
}

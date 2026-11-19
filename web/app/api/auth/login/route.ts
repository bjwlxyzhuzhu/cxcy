import { NextResponse } from "next/server";
import { checkLogin, loginLocked } from "@/lib/auth";
import { SESSION_COOKIE, signSession, cookieOptions, requestIsHttps } from "@/lib/session";

export const runtime = "nodejs";

/** 登录：账号（学号）+ 密码 → 设置 httpOnly 会话 cookie */
export async function POST(req: Request) {
  let body: { account?: string; password?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const account = String(body.account || "").trim().slice(0, 64);
  const password = String(body.password || "");
  if (!account || !password) return NextResponse.json({ error: "请输入账号和密码" }, { status: 400 });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const key = `${account.toLowerCase()}|${ip}`;
  const wait = loginLocked(key);
  if (wait) return NextResponse.json({ error: `尝试次数过多，请 ${Math.ceil(wait / 60)} 分钟后再试` }, { status: 429 });

  const ok = checkLogin(account, password, key);
  if (!ok) return NextResponse.json({ error: "账号或密码错误" }, { status: 401 });

  let token: string;
  try { token = await signSession(ok.id, ok.version); }
  catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "会话签发失败" }, { status: 500 }); }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions(requestIsHttps(req)));
  return res;
}

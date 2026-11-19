import { NextResponse } from "next/server";
import { SESSION_COOKIE, cookieOptions, requestIsHttps } from "@/lib/session";

export const runtime = "nodejs";

/** 退出登录：清除会话 cookie */
export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", cookieOptions(requestIsHttps(req), 0));
  return res;
}

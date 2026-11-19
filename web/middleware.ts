import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySession, signSession, sessionMaxAge, cookieOptions, requestIsHttps } from "@/lib/session";

/**
 * 会话续期：cookie 签名有效且已过半个有效期时，换发一张新 cookie（滑动过期）。
 * 这里只验签名、不查数据库；账号是否被禁用、密码是否已改，由各接口里的 getUser() 对照 session_version 判断。
 * 不在这里拦截页面：未登录时各页面/接口自行处理（与原 Supabase 版行为一致）。
 */
export async function middleware(request: NextRequest) {
  const res = NextResponse.next({ request });
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return res;
  const p = await verifySession(token);
  if (!p) {
    res.cookies.set(SESSION_COOKIE, "", cookieOptions(requestIsHttps(request), 0)); // 过期或伪造：清掉
    return res;
  }
  const left = p.e - Math.floor(Date.now() / 1000);
  if (left < sessionMaxAge() / 2) {
    res.cookies.set(SESSION_COOKIE, await signSession(p.u, p.v), cookieOptions(requestIsHttps(request)));
  }
  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

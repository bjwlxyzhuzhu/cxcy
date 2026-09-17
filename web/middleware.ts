import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
export function middleware(req: NextRequest) {
  if (req.cookies.get("cxcy_experiment_session")) {
    if (
      req.nextUrl.pathname.startsWith("/apply/") &&
      !(
        ["/apply/cockpit", "/apply/expert", "/apply/defense"].includes(
          req.nextUrl.pathname,
        ) && req.nextUrl.searchParams.get("experiment") === "1"
      )
    )
      return NextResponse.redirect(new URL("/experiment", req.url));
    if (
      req.nextUrl.pathname.startsWith("/api/ai/") &&
      !req.nextUrl.pathname.endsWith("/ask")
    )
      return NextResponse.json(
        { error: "请在实验页面操作；完成后可点击退出实验，记录会保留" },
        { status: 423 },
      );
  }
  return NextResponse.next();
}
export const config = { matcher: ["/api/ai/:path*", "/apply/:path*"] };

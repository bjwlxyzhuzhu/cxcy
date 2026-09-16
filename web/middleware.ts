import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
export function middleware(req:NextRequest){ if(req.nextUrl.pathname.startsWith("/api/ai/") && req.cookies.get("cxcy_experiment_session")) return NextResponse.json({error:"课堂实验进行中，已锁定其它 AI 入口，请在实验页面完成规定流程"},{status:423}); return NextResponse.next(); }
export const config={matcher:["/api/ai/:path*"]};

import { NextResponse } from "next/server";
import { getUser, getProfile } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 当前登录用户与档案（替代前端的 supabase.auth.getSession / getUser + 查 profiles） */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ user: null, profile: null });
  const profile = await getProfile();
  return NextResponse.json({ user, profile });
}

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 管理端：最近 5000 条积分消耗 + 用户显示名（仅教师/管理员） */
export async function GET() {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "无管理员权限" }, { status: 403 });
  const [l, p] = await Promise.all([
    db().from("usage_logs").select("user_id,action,cost,created_at").order("created_at", { ascending: false }).limit(5000),
    db().from("profiles").select("id,name,student_no").limit(2000),
  ]);
  if (l.error || p.error) return NextResponse.json({ error: (l.error || p.error)!.message }, { status: 500 });
  return NextResponse.json({ logs: l.data || [], profiles: p.data || [] });
}

import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { grantReward } from "@/lib/rewards";
export const runtime = "nodejs";
export async function POST() {
  const user = await getUser();
  if (!user) return NextResponse.json({ granted: false }, { status: 401 });
  try { return NextResponse.json(await grantReward(user.id, "daily")); }
  catch { return NextResponse.json({ error: "登录奖励暂未发放，可到积分中心重试" }, { status: 503 }); }
}

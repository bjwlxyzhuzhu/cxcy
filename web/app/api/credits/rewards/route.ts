import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { grantReward } from "@/lib/rewards";
import { reflectionProblem } from "@/lib/reward-policy";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const problem = reflectionProblem(body?.content);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  try {
    return NextResponse.json(
      await grantReward(user.id, "reflection", body.content.trim()),
    );
  } catch {
    return NextResponse.json(
      { error: "反思暂未保存、积分未发放，请稍后重试" },
      { status: 503 },
    );
  }
}

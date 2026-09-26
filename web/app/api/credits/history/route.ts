import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { query } from "@/lib/db";
import { recoverReports } from "@/lib/report-recovery";
export const runtime = "nodejs";
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  try {
    await recoverReports(user.id);
    const { rows } = await query(
      `select action,amount,created_at,content from (
      select kind as action,amount,created_at,content from credit_rewards where user_id=$1
      union all select action,-cost as amount,created_at,'' as content from usage_logs where user_id=$1
    ) t order by created_at desc limit 100`,
      [user.id],
    );
    const p = (
      await query("select credits from profiles where id=$1", [user.id])
    ).rows[0];
    return NextResponse.json({ credits: p?.credits ?? 0, entries: rows });
  } catch {
    return NextResponse.json(
      { error: "积分记录暂时无法读取，请稍后重试" },
      { status: 503 },
    );
  }
}

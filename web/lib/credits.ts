import "server-only";
import { query, withTransaction } from "@/lib/db";

/** 读取用户当前积分（预检用） */
export async function getCredits(userId: string): Promise<number> {
  const { rows } = await query<{ credits: number }>("SELECT credits FROM profiles WHERE id = $1", [userId]);
  if (!rows[0]) throw new Error("用户档案不存在");
  return rows[0].credits ?? 0;
}

/**
 * 原子扣分 + 写 usage_logs（调用数据库 deduct_credits RPC）。
 * 积分不足返回 { ok:false }，不抛错。
 */
export async function deductCredits(
  userId: string,
  action: string,
  cost: number,
  meta: Record<string, unknown> = {}
): Promise<{ ok: boolean; remaining: number }> {
  if (!Number.isSafeInteger(cost) || cost < 0) throw new Error("积分消耗必须为非负整数");
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ credits: number }>(
      "UPDATE profiles SET credits = credits - $1 WHERE id = $2 AND credits >= $1 RETURNING credits",
      [cost, userId]
    );
    if (!rows[0]) return { ok: false, remaining: 0 };
    await client.query("INSERT INTO usage_logs (user_id, action, cost, meta) VALUES ($1, $2, $3, $4)", [userId, action, cost, meta]);
    return { ok: true, remaining: rows[0].credits };
  });
}

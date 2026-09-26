import "server-only";
import { withTransaction } from "@/lib/db";
import { REWARDS } from "@/lib/reward-policy";

export async function grantReward(
  userId: string,
  kind: keyof typeof REWARDS,
  content = "",
) {
  return withTransaction(async (c) => {
    // 锁定余额行，将判重、加分和奖励流水放在同一事务，防并发覆盖扣费。
    const p = (
      await c.query(
        "select credits,last_bonus_at from profiles where id=$1 for update",
        [userId],
      )
    ).rows[0];
    if (!p) throw new Error("用户档案不存在");
    const day = (
      await c.query(
        "select to_char(now() at time zone 'Asia/Shanghai','YYYY-MM-DD') as day",
      )
    ).rows[0].day;
    const legacy =
      kind === "daily" &&
      (
        await c.query(
          "select 1 from profiles where id=$1 and last_bonus_at=$2::date",
          [userId, day],
        )
      ).rowCount;
    if (legacy) return { granted: false, credits: p.credits, added: 0 };
    if (kind === "reflection") {
      const duplicate = await c.query(
        "select 1 from credit_rewards where user_id=$1 and kind='reflection' and content=$2",
        [userId, content],
      );
      if (duplicate.rowCount)
        return {
          granted: false,
          credits: p.credits,
          added: 0,
          message: "这份反思已经提交，请结合新的学习内容再写一份。",
        };
    }
    const reward = await c.query(
      "insert into credit_rewards(user_id,kind,reward_day,amount,content) values($1,$2,$3,$4,$5) on conflict do nothing returning id",
      [userId, kind, day, REWARDS[kind], content],
    );
    if (!reward.rowCount)
      return { granted: false, credits: p.credits, added: 0 };
    const balance = (
      await c.query(
        "update profiles set credits=credits+$2, last_bonus_at=case when $3='daily' then $4::date else last_bonus_at end where id=$1 returning credits",
        [userId, REWARDS[kind], kind, day],
      )
    ).rows[0].credits;
    return { granted: true, credits: balance, added: REWARDS[kind] };
  });
}

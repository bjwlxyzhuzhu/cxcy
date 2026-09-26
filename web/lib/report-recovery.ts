import "server-only";
import { withTransaction } from "@/lib/db";
// 供应商调用90秒超时；进程异常后，10分钟未完成的预扣款在下次访问时退回。
export async function recoverReports(userId: string) {
  await withTransaction(async (c) => {
    await c.query("select id from profiles where id=$1 for update", [userId]);
    const stale = (
      await c.query(
        "update generated_reports set status='refunded',updated_at=now() where user_id=$1 and status='pending' and created_at < now()-interval '10 minutes' returning id,cost",
        [userId],
      )
    ).rows;
    for (const job of stale)
      if (job.cost) {
        await c.query("update profiles set credits=credits+$2 where id=$1", [
          userId,
          job.cost,
        ]);
        await c.query(
          "insert into usage_logs(user_id,action,cost,meta) values($1,'report_refund',$2,$3)",
          [userId, -job.cost, { requestId: job.id, reason: "interrupted" }],
        );
      }
  });
}

import "server-only";
import { randomUUID } from "node:crypto";
import { withTransaction, query } from "@/lib/db";
export const MODULES: Record<string, string> = {
  topic: "选题与赛道",
  expert: "专家打磨",
  defense: "模拟答辩",
  text: "文本生成",
  ppt: "幻灯生成",
  crew: "专家协作",
  cockpit: "驾驶舱",
  learn: "学习问答",
};
export const isUuid = (s: unknown): s is string =>
  typeof s === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
export function moduleFromRequest(req: Request) {
  try {
    const path = new URL(req.headers.get("referer") || req.url).pathname;
    const key = path.split("/")[2];
    return MODULES[key] ? key : "learn";
  } catch {
    return "learn";
  }
}
export async function startRecord(
  userId: string,
  module: string,
  title: string,
  sessionId: unknown,
  requestId: unknown,
  content: string,
  metadata: Record<string, unknown> = {},
) {
  const sid = isUuid(sessionId) ? sessionId : randomUUID();
  const rid = isUuid(requestId) ? requestId : randomUUID();
  return withTransaction(async (c) => {
    await c.query(
      "insert into learning_sessions(id,user_id,module,title) values($1,$2,$3,$4) on conflict(id) do nothing",
      [sid, userId, module, title.slice(0, 200)],
    );
    const session = (
      await c.query(
        "select user_id,module from learning_sessions where id=$1 for update",
        [sid],
      )
    ).rows[0];
    if (session.user_id !== userId || session.module !== module)
      throw new Error("记录归属不匹配，请重新打开自己的历史记录");
    const cached = (
      await c.query(
        "select content from learning_records where session_id=$1 and request_id=$2 and role='assistant'",
        [sid, rid],
      )
    ).rows[0];
    await c.query(
      "insert into learning_records(session_id,request_id,role,content,metadata) values($1,$2,'user',$3,$4) on conflict do nothing",
      [sid, rid, content, metadata],
    );
    await c.query("update learning_sessions set updated_at=now() where id=$1", [
      sid,
    ]);
    return {
      sessionId: sid,
      requestId: rid,
      cached: cached?.content as string | undefined,
    };
  });
}
export async function finishRecord(
  sessionId: string,
  requestId: string,
  content: string,
  metadata: Record<string, unknown>,
) {
  await withTransaction(async (c) => {
    await c.query(
      "insert into learning_records(session_id,request_id,role,content,metadata) values($1,$2,'assistant',$3,$4) on conflict do nothing",
      [sessionId, requestId, content, metadata],
    );
    await c.query("update learning_sessions set updated_at=now() where id=$1", [
      sessionId,
    ]);
  });
}
export async function ownRecords(userId: string, sessionId: string) {
  const session = (
    await query("select * from learning_sessions where id=$1 and user_id=$2", [
      sessionId,
      userId,
    ])
  ).rows[0];
  if (!session) return null;
  const records = (
    await query(
      "select id,role,content,metadata,created_at from learning_records where session_id=$1 order by id",
      [sessionId],
    )
  ).rows;
  return { session, records };
}

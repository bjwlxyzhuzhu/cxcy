import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { getParticipant, nowStage } from "@/lib/experiment";
import { resolveAIClient } from "@/lib/ai/resolve";
import { withTransaction } from "@/lib/db";
import { REPORT_COST } from "@/lib/reward-policy";
import { reportPrompt } from "@/lib/report-prompts";
import { recoverReports } from "@/lib/report-recovery";
export const runtime = "nodejs";
const schema = z.object({
  requestId: z.string().uuid(),
  kind: z.enum(["expert", "defense"]),
  project: z.string().trim().min(30).max(12000),
  track: z.string().max(120).default(""),
});
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const participant = await getParticipant();
  if (
    participant &&
    !["closed", "completed"].includes(nowStage(participant).key)
  )
    return NextResponse.json(
      { error: "课堂实验进行中，请完成指定流程后再生成报告" },
      { status: 423 },
    );
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "请填写30—12000字的项目材料，检查请求编号和赛道" },
      { status: 400 },
    );
  const { requestId, kind, project, track } = parsed.data;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ kind, project, track }))
    .digest("hex");
  let reserved = false;
  try {
    await recoverReports(user.id);
    const { client, model, usingOwnKey } = await resolveAIClient(
      user.id,
      "chat",
    );
    const cost = usingOwnKey ? 0 : REPORT_COST;
    const state = await withTransaction(async (c) => {
      const p = (
        await c.query("select credits from profiles where id=$1 for update", [
          user.id,
        ])
      ).rows[0];
      if (!p) throw new Error("missing profile");
      const previous = (
        await c.query("select * from generated_reports where id=$1", [
          requestId,
        ])
      ).rows[0];
      if (previous) {
        if (
          previous.user_id !== user.id ||
          previous.fingerprint !== fingerprint
        )
          return { status: 409, error: "请求编号已使用，请开始新的一次生成" };
        if (previous.status === "completed")
          return {
            status: 200,
            text: previous.output,
            remaining: p.credits,
            sessionId: requestId,
            cached: true,
          };
        return {
          status: 409,
          error:
            previous.status === "pending"
              ? "这份报告仍在处理中，请稍后重试同一请求"
              : "上次生成失败已退分，请点击新建请求后重试",
        };
      }
      if (p.credits < cost)
        return {
          status: 402,
          error: "积分不足，请到积分中心领取每日登录或学习反思奖励",
        };
      await c.query(
        "insert into generated_reports(id,user_id,kind,fingerprint,input,cost,status) values($1,$2,$3,$4,$5,$6,'pending')",
        [requestId, user.id, kind, fingerprint, project, cost],
      );
      await c.query("update profiles set credits=credits-$2 where id=$1", [
        user.id,
        cost,
      ]);
      if (cost)
        await c.query(
          "insert into usage_logs(user_id,action,cost,meta) values($1,$2,$3,$4)",
          [user.id, kind + "_report", cost, { requestId }],
        );
      return { status: 201 };
    });
    if (state.status !== 201)
      return NextResponse.json(state, { status: state.status });
    reserved = true;
    const response = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: reportPrompt(kind, track) },
          { role: "user", content: project },
        ],
        max_tokens: 4000,
      },
      { timeout: 90000, maxRetries: 0 },
    );
    const text = response.choices[0]?.message?.content?.trim();
    if (!text || response.choices[0]?.finish_reason === "length")
      throw new Error("empty or truncated response");
    const title = kind === "expert" ? "专家打磨完整报告" : "模拟答辩准备稿";
    const remaining = await withTransaction(async (c) => {
      const job = (
        await c.query(
          "select status from generated_reports where id=$1 for update",
          [requestId],
        )
      ).rows[0];
      if (job?.status !== "pending") throw new Error("invalid report state");
      await c.query(
        "insert into learning_sessions(id,user_id,module,title) values($1,$2,$3,$4)",
        [requestId, user.id, kind, title],
      );
      await c.query(
        "insert into learning_records(session_id,request_id,role,content,metadata) values($1,$1,'user',$2,$3),($1,$1,'assistant',$4,$5)",
        [
          requestId,
          project,
          { track },
          text,
          { source: "ai", model, report: true },
        ],
      );
      await c.query(
        "insert into evidence_events(user_id,kind,title,payload) values($1,$2,$3,$4)",
        [
          user.id,
          kind === "expert" ? "expert_review" : "defense_preparation",
          title,
          {
            q: project.slice(0, 300),
            a: text.slice(0, 1500),
            sessionId: requestId,
          },
        ],
      );
      await c.query(
        "update generated_reports set output=$2,status='completed',updated_at=now() where id=$1",
        [requestId, text],
      );
      return (
        await c.query("select credits from profiles where id=$1", [user.id])
      ).rows[0].credits;
    });
    return NextResponse.json({
      text,
      remaining,
      sessionId: requestId,
      ownKey: usingOwnKey,
    });
  } catch (error) {
    const failure = error as { name?: string; code?: string };
    console.error("report_request_failed", {
      name: failure?.name,
      code: failure?.code,
      requestId,
    });
    if (reserved) {
      try {
        await withTransaction(async (c) => {
          // 同一用户统一按 profiles → report 的顺序加锁。
          await c.query("select id from profiles where id=$1 for update", [
            user.id,
          ]);
          const job = (
            await c.query(
              "update generated_reports set status='refunded',updated_at=now() where id=$1 and user_id=$2 and status='pending' returning cost",
              [requestId, user.id],
            )
          ).rows[0];
          if (job?.cost) {
            await c.query(
              "update profiles set credits=credits+$2 where id=$1",
              [user.id, job.cost],
            );
            await c.query(
              "insert into usage_logs(user_id,action,cost,meta) values($1,'report_refund',$2,$3)",
              [user.id, -job.cost, { requestId }],
            );
          }
        });
      } catch {
        return NextResponse.json(
          {
            error: "生成中断，退分状态待核对。请保留请求编号并联系管理员",
            requestId,
          },
          { status: 503 },
        );
      }
    }
    return NextResponse.json(
      {
        error: reserved
          ? "生成失败，预扣积分已退还。请新建请求后重试。"
          : "服务暂不可用，尚未扣分，请稍后重试。",
        requestId,
      },
      { status: 502 },
    );
  }
}

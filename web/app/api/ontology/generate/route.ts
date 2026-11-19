import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { resolveAIClient } from "@/lib/ai/resolve";
import { getCredits, deductCredits } from "@/lib/credits";
import { COST } from "@/lib/ai/models";
import { runAction, ActionError } from "@/lib/ontology";
import { projectRole } from "@/lib/ontology/engine";
import { GEN_STEPS, buildContext, genMessages, precheck, verifyPlan, type GenStep } from "@/lib/ontology/generate";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * AI 起草本步：{ project_id, step: track | brief | v01 | test | v02 }
 * 依据已认证对象起草草稿与关系；按“文本生成”扣积分（用自己的密钥不扣；起草成功后才扣）。
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录，请先登录" }, { status: 401 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const projectId = String(b.project_id || "");
  const step = String(b.step || "") as GenStep;
  if (!GEN_STEPS.includes(step)) return NextResponse.json({ error: "这一步不需要 AI 起草" }, { status: 400 });
  const c = sqlite();
  if (!projectRole(c, user.id, projectId)) return NextResponse.json({ error: "只能操作自己所在项目的内容" }, { status: 403 });
  const pre = precheck(c, projectId, step);
  if (pre) return NextResponse.json({ error: pre }, { status: 400 });

  const { client, model, usingOwnKey } = await resolveAIClient(user.id, "chat");
  if (!usingOwnKey && (await getCredits(user.id).catch(() => 0)) < COST.text) return NextResponse.json({ error: "积分不足，请联系老师" }, { status: 402 });

  const ctx = buildContext(c, projectId, step);
  let raw = "";
  try {
    const r = await client.chat.completions.create({
      model, max_tokens: 2500, temperature: 0.4, messages: genMessages(step, ctx), response_format: { type: "json_object" },
    } as never) as unknown as { choices: { message: { content: string } }[] };
    raw = r.choices?.[0]?.message?.content || "";
  } catch (e) {
    return NextResponse.json({ error: "AI 起草失败：" + (e instanceof Error ? e.message : "未知错误") }, { status: 502 });
  }
  const { plan, warnings } = verifyPlan(step, raw, ctx);
  let created: Record<string, number>;
  try {
    created = runAction<{ created: Record<string, number> }>("draft.generate", { userId: user.id, kind: "ai" }, { project_id: projectId, step, plan }).created;
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ error: e.message, warnings }, { status: e.status });
    throw e;
  }
  let remaining: number | null = null;
  if (!usingOwnKey) {
    const r = await deductCredits(user.id, "ontology_generate", COST.text, { step, model }).catch(() => null);
    remaining = r?.ok ? r.remaining : null;
  }
  return NextResponse.json({ created, warnings, remaining });
}

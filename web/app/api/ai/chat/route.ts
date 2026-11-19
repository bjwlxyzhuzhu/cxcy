import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { resolveAIClient } from "@/lib/ai/resolve";
import { getCredits, deductCredits } from "@/lib/credits";
import { COST } from "@/lib/ai/models";
import { sqlite } from "@/lib/db";
import { ontologyContext, checkCitations } from "@/lib/ontology/context";

export const runtime = "nodejs";

/**
 * 扣积分服务端示例：所有 AI 调用走这里，密钥只在服务端。
 * 流程：鉴权 → 解析客户端(平台 / 用户自带 key) →（用平台才预检/扣分）→ APIMart 流式聚合。
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录，请先登录" }, { status: 401 });

  let body: { messages?: unknown; project_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages 不能为空" }, { status: 400 });
  }

  // 解析：用平台默认还是用户自己绑定的 key
  const { client, model, usingOwnKey } = await resolveAIClient(user.id, "chat");

  // 用平台 key 才需要积分；用户自带 key 用自己的额度，不扣分
  let credits = Infinity;
  if (!usingOwnKey) {
    try {
      credits = await getCredits(user.id);
    } catch (e) {
      return NextResponse.json(
        { error: "读取积分失败：" + (e instanceof Error ? e.message : "") },
        { status: 500 }
      );
    }
    if (credits < COST.chat) {
      return NextResponse.json(
        {
          error: "积分不足。可在右上头像→账户中心绑定你自己的 API Key（用自己的额度，不扣积分）。",
          link: "https://apimart.ai/keys",
          remaining: credits,
        },
        { status: 402 }
      );
    }
  }

  // 统一 AI 上下文层：先查本体（口径 + 已认证对象 + 出处规则）
  const msgs = messages as { role: string; content: unknown }[];
  const lastUser = [...msgs].reverse().find((m) => m.role === "user")?.content;
  const onto = ontologyContext(sqlite(), user.id, typeof body?.project_id === "string" ? body.project_id : null, typeof lastUser === "string" ? lastUser : "");

  // 调用（默认流式 SSE，聚合为完整文本）
  let text = "";
  try {
    const stream = await client.chat.completions.create({
      model,
      messages: [{ role: "system", content: onto.block }, ...msgs] as never,
      stream: true,
    });
    for await (const chunk of stream) {
      text += chunk.choices[0]?.delta?.content ?? "";
    }
  } catch (e) {
    return NextResponse.json(
      { error: "AI 调用失败：" + (e instanceof Error ? e.message : "未知错误") },
      { status: 502 }
    );
  }

  const cc = checkCitations(text, onto.refs);
  text = cc.text;
  const citations = cc.cited;

  // 平台 key 才扣分 + 记账
  if (usingOwnKey) {
    return NextResponse.json({ text, remaining: null, ownKey: true, citations });
  }
  const r = await deductCredits(user.id, "chat", COST.chat, { model });
  return NextResponse.json({ text, remaining: r.ok ? r.remaining : credits, ownKey: false, citations });
}

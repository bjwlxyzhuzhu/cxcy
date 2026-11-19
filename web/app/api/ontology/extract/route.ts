import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { resolveAIClient } from "@/lib/ai/resolve";
import { runAction, ActionError } from "@/lib/ontology";
import { projectRole } from "@/lib/ontology/engine";
import { extractMessages, normalizeDraft, pickJson, verifyDraft } from "@/lib/ontology/extract";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * AI 自动建本体（不扣积分，每人每天限次）：
 *   新资料：{ project_id, name, kind, ref_note, text } → 存资料（人）→ 模型抽取 → 防编造校验 → 草稿入库（AI）
 *   重试：  { project_id, material_id }               → 对已存资料重新抽取
 * 返回新增草稿数量与提醒；所有对象都是草稿，需要学生逐条认证。
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录，请先登录" }, { status: 401 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const projectId = String(b.project_id || "");
  const fail = (e: unknown) => {
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  };

  // ① 资料：新上传或取已存的
  let materialId = String(b.material_id || "");
  let pii: Record<string, number> = {};
  if (!materialId) {
    try {
      const r = runAction<{ id: string; pii: Record<string, number> }>("material.add", { userId: user.id, kind: "human" }, b);
      materialId = r.id; pii = r.pii;
    } catch (e) { return fail(e); }
  } else if (!projectRole(sqlite(), user.id, projectId)) {
    return NextResponse.json({ error: "只能操作自己所在项目的内容" }, { status: 403 });
  }
  const m = sqlite().prepare("select id, project_id, kind, ref_note, text from materials where id = ?").get(materialId) as
    { id: string; project_id: string; kind: string; ref_note: string; text: string } | undefined;
  if (!m || m.project_id !== projectId) return NextResponse.json({ error: "资料不存在" }, { status: 404 });

  // ② 模型抽取（动作外进行，不占用数据库事务）
  let raw = "";
  try {
    const { client, model } = await resolveAIClient(user.id, "chat");
    const r = await client.chat.completions.create({
      model, max_tokens: 3000, temperature: 0.2,
      messages: extractMessages(m),
      response_format: { type: "json_object" },
    } as never) as unknown as { choices: { message: { content: string } }[] };
    raw = r.choices?.[0]?.message?.content || "";
  } catch (e) {
    return NextResponse.json({
      error: "AI 抽取失败：" + (e instanceof Error ? e.message : "未知错误") + "。资料已保存，可稍后重试", material_id: materialId,
    }, { status: 502 });
  }

  // ③ 规范化 + 防编造校验
  const parsed = pickJson(raw);
  if (!parsed) return NextResponse.json({ error: "AI 返回的内容无法解析，资料已保存，可重试", material_id: materialId }, { status: 502 });
  const { draft, warnings } = verifyDraft(m.text, normalizeDraft(parsed));

  // ④ 草稿入库（以 AI 身份执行：只能生成草稿）
  try {
    const r = runAction<{ created: Record<string, number> }>("draft.import", { userId: user.id, kind: "ai" }, {
      project_id: projectId, material_id: materialId, draft,
    });
    return NextResponse.json({ material_id: materialId, created: r.created, warnings, pii });
  } catch (e) { return fail(e); }
}

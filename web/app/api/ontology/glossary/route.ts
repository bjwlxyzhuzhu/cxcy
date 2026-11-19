import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { resolveAIClient } from "@/lib/ai/resolve";
import { runAction, ActionError } from "@/lib/ontology";
import { isTeacherSync, parseJson, projectRole } from "@/lib/ontology/engine";
import { collectSources, glossaryMessages, verifyGlossary } from "@/lib/ontology/glossary";
import { RECOMMENDED_CLASS_TERMS } from "@/lib/ontology/actions/glossary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** 课堂口径列表（登录可读；教师另可看到已停用的与推荐清单） */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const c = sqlite();
  const teacher = isTeacherSync(c, user.id);
  const rows = c.prepare(
    `select id, term, definition, formula, aliases, examples, status, updated_at from glossary_terms
     where project_id is null ${teacher ? "" : "and status = 'confirmed'"} order by status = 'rejected', term`
  ).all();
  return NextResponse.json({
    teacher,
    terms: rows.map((r) => ({ ...r, aliases: parseJson(r.aliases, []), examples: parseJson(r.examples, []) })),
    recommended: teacher ? RECOMMENDED_CLASS_TERMS.map((t) => t.term) : undefined,
  });
}

/** AI 口径检查：{ project_id } → 起草术语、标出“同一个词不同说法”（不扣积分，每人每天限次） */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录，请先登录" }, { status: 401 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const projectId = String(b.project_id || "");
  const c = sqlite();
  if (!projectRole(c, user.id, projectId)) return NextResponse.json({ error: "只能操作自己所在项目的内容" }, { status: 403 });
  const sources = collectSources(c, projectId);
  if (!sources.length) return NextResponse.json({ error: "项目里还没有资料或本体对象，先上传调研资料" }, { status: 400 });
  const existing = c.prepare("select term, definition from glossary_terms where project_id = ? and status <> 'rejected'").all(projectId) as { term: string; definition: string }[];

  let raw = "";
  try {
    const { client, model } = await resolveAIClient(user.id, "chat");
    const r = await client.chat.completions.create({
      model, max_tokens: 2500, temperature: 0.2, messages: glossaryMessages(sources, existing), response_format: { type: "json_object" },
    } as never) as unknown as { choices: { message: { content: string } }[] };
    raw = r.choices?.[0]?.message?.content || "";
  } catch (e) {
    return NextResponse.json({ error: "AI 口径检查失败：" + (e instanceof Error ? e.message : "未知错误") }, { status: 502 });
  }
  const { terms, warnings } = verifyGlossary(raw, sources);
  try {
    const r = runAction<{ created: number; flagged: number }>("draft.glossary_import", { userId: user.id, kind: "ai" }, { project_id: projectId, terms });
    return NextResponse.json({ ...r, warnings, sources: sources.length });
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db, sqlite } from "@/lib/db";
import { opponentBrief } from "@/lib/ontology/context";
import { resolveAIClient } from "@/lib/ai/resolve";
import { getCredits, deductCredits } from "@/lib/credits";
import { COST } from "@/lib/ai/models";
import { memberTeam, personaSystem, parseTags, retrieve, type PersonaRow } from "@/lib/arena";
import { runAction, ActionError } from "@/lib/ontology";

export const runtime = "nodejs";

type Msg = { role: "user" | "assistant"; content: string };


/** 与一个分身/角色交锋一轮：生成回复（动作外）→ 记账与证据计分（动作 arena.record_turn） */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录，请先登录" }, { status: 401 });
  const admin = db();
  let b: { match_id?: string; persona_id?: string; messages?: Msg[] };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const msgs = (Array.isArray(b.messages) ? b.messages : []).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-12);
  const last = [...msgs].reverse().find((m) => m.role === "user")?.content?.trim() || "";
  if (!last) return NextResponse.json({ error: "请输入你的回应" }, { status: 400 });

  const { data: match } = await admin.from("arena_matches").select("id, status, round_no").eq("id", String(b.match_id || "")).maybeSingle();
  if (!match) return NextResponse.json({ error: "对局不存在" }, { status: 404 });
  if (match.status !== "running") return NextResponse.json({ error: match.status === "ended" ? "对局已结束" : "老师还没开始本轮" }, { status: 409 });
  const team = await memberTeam(admin, match.id, user.id);
  if (!team) return NextResponse.json({ error: "请先加入一支队伍" }, { status: 403 });

  const { data: pRow } = await admin.from("personas").select("*").eq("id", String(b.persona_id || "")).maybeSingle();
  const p = pRow as PersonaRow | null;
  if (!p || !p.enabled) return NextResponse.json({ error: "该分身不可用" }, { status: 404 });
  if (p.visibility === "team" && p.team_code !== team.team_code) return NextResponse.json({ error: "该分身仅对其所在队伍可见" }, { status: 403 });

  const { client, model, usingOwnKey } = await resolveAIClient(user.id, "chat");
  let credits = Infinity;
  if (!usingOwnKey) {
    credits = await getCredits(user.id).catch(() => 0);
    if (credits < COST.chat) return NextResponse.json({ error: "积分不足，请联系老师" }, { status: 402 });
  }

  const prevAgent = [...msgs].reverse().find((m) => m.role === "assistant")?.content || "";
  const snippets = p.kind === "twin" ? retrieve(p.source_text || "", last + " " + prevAgent) : [];
  // 统一 AI 上下文层：分身也先查本体（口径 + 对方已认证的依据），据此追问、不替对方编造
  // 依据放在前面，personaSystem 末尾的 TAGS 格式要求保持在最后（影响证据命中与现实检验的识别）
  const system = [opponentBrief(sqlite(), team.project_id), personaSystem(p, { venture: team.venture, teamName: team.name, snippets })].filter(Boolean).join("\n\n");

  let raw = "";
  try {
    const r = await client.chat.completions.create({
      model, max_tokens: 600,
      messages: [{ role: "system", content: system }, ...msgs.map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))],
    } as never) as unknown as { choices: { message: { content: string } }[] };
    raw = r.choices?.[0]?.message?.content || "";
  } catch (e) {
    return NextResponse.json({ error: "AI 调用失败：" + (e instanceof Error ? e.message : "未知错误") }, { status: 502 });
  }
  const { reply, tags } = parseTags(raw);

  // —— 记账：轮级入库 + 证据计分（动作引擎，同一事务，带审计）——
  let points = 0, cited = false;
  try {
    const r = runAction<{ points: number; cited: boolean }>("arena.record_turn", { userId: user.id, kind: "human" }, {
      match_id: match.id, persona_id: p.id, student: last, reply, tags,
    });
    points = r.points; cited = r.cited;
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  let remaining: number | null = null;
  if (!usingOwnKey) {
    const r = await deductCredits(user.id, "arena_turn", COST.chat, { model, persona: p.role_type }).catch(() => null);
    remaining = r?.ok ? r.remaining : credits;
  }
  return NextResponse.json({ reply, tags, points, cited, remaining, snippets: snippets.length });
}

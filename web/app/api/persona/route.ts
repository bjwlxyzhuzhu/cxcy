import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveAIClient } from "@/lib/ai/resolve";
import { getCredits, deductCredits } from "@/lib/credits";
import { COST } from "@/lib/ai/models";
import { isTeacher, myTeamCodes, piiScan, redact, DEFAULT_ROLES } from "@/lib/arena";
import { TYPE_BY_KEY, TWIN_TYPES, ROLE_TYPES, CONSENT_ITEMS, type PersonaCard } from "@/lib/arenaShared";

export const runtime = "nodejs";

const PUBLIC_COLS = "id, owner_id, kind, role_type, label, team_code, card, visibility, enabled, pii_flags, created_at, updated_at";

/** 分身列表：mine=我做的；默认=对局可用（全班可见 + 教师角色） */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const admin = db();
  const scope = new URL(req.url).searchParams.get("scope");
  const teacher = await isTeacher(admin, user.id);
  let q = admin.from("personas").select(PUBLIC_COLS).order("updated_at", { ascending: false }).limit(300);
  if (scope === "mine") q = q.eq("owner_id", user.id);
  else if (scope === "all" && teacher) { /* 教师看全部 */ }
  else q = q.eq("enabled", true).eq("visibility", "class");
  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let list = data || [];
  // 对局可用列表：再补上“仅本队可见”且属于我所在队伍的分身（交锋接口允许本队使用，列表也要能选到）
  if (scope !== "mine" && !(scope === "all" && teacher)) {
    const codes = [...(await myTeamCodes(admin, user.id))];
    if (codes.length) {
      const { data: own } = await admin.from("personas").select(PUBLIC_COLS).eq("enabled", true).eq("visibility", "team").in("team_code", codes).limit(100);
      list = [...list, ...(own || [])];
    }
  }
  return NextResponse.json({ personas: list, teacher });
}

/** 从模型回复里抠出 JSON */
function pickJson(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s); } catch { /* 继续 */ }
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}
const arr = (v: unknown, n: number) => (Array.isArray(v) ? v.map((x) => String(x).slice(0, 200)).filter(Boolean).slice(0, n) : []);
const str = (v: unknown, n = 300) => (typeof v === "string" ? v.slice(0, n) : "");

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录，请先登录" }, { status: 401 });
  const admin = db();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }

  // —— 教师：一键注入默认角色原型 ——
  if (body.action === "seed_roles") {
    if (!(await isTeacher(admin, user.id))) return NextResponse.json({ error: "仅教师可注入角色" }, { status: 403 });
    const { data: have } = await admin.from("personas").select("role_type").eq("owner_id", user.id).eq("kind", "role");
    const exist = new Set((have || []).map((r) => r.role_type));
    const rows = DEFAULT_ROLES.filter((r) => !exist.has(r.role_type)).map((r) => ({
      owner_id: user.id, kind: "role", role_type: r.role_type, label: r.label, card: r.card, visibility: "class",
      consent: { teacher_role: true, at: new Date().toISOString() },
    }));
    if (rows.length) {
      const { error } = await admin.from("personas").insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, added: rows.length });
  }

  // —— 教师：自定义一个角色原型 ——
  if (body.kind === "role") {
    if (!(await isTeacher(admin, user.id))) return NextResponse.json({ error: "仅教师可创建角色原型" }, { status: 403 });
    const rt = String(body.role_type || "");
    if (!ROLE_TYPES.some((t) => t.key === rt)) return NextResponse.json({ error: "角色类型无效" }, { status: 400 });
    const card: PersonaCard = { identity: str(body.identity, 300), focus: str(body.focus, 500) };
    const { data, error } = await admin.from("personas").insert({
      owner_id: user.id, kind: "role", role_type: rt, label: str(body.label, 40) || TYPE_BY_KEY[rt].label,
      card, visibility: "class", consent: { teacher_role: true, at: new Date().toISOString() },
    }).select(PUBLIC_COLS).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ persona: data });
  }

  // —— 学生：调研资料 → 数字分身 ——
  const rt = String(body.role_type || "");
  if (!TWIN_TYPES.some((t) => t.key === rt)) return NextResponse.json({ error: "请选择分身类型" }, { status: 400 });
  const consent = Array.isArray(body.consent) ? body.consent : [];
  if (consent.length !== CONSENT_ITEMS.length || !consent.every((x) => x === true))
    return NextResponse.json({ error: "请逐条确认知情同意与去标识化要求" }, { status: 400 });
  const raw = String(body.text || "").trim();
  if (raw.length < 80) return NextResponse.json({ error: "调研资料太少（至少 80 字）。分身只能说资料里有的话，资料越扎实分身越像真人。" }, { status: 400 });
  const pii = piiScan(raw);
  const clean = redact(raw).slice(0, 12000);
  const label = str(body.label, 40) || TYPE_BY_KEY[rt].label;
  // 归属队伍决定“分身命中”积分记给谁：学生只能归到自己加入过的队伍
  const teamCode = str(body.team_code, 20);
  if (teamCode && !(await isTeacher(admin, user.id)) && !(await myTeamCodes(admin, user.id)).has(teamCode))
    return NextResponse.json({ error: "分身只能归到你所在的队伍" }, { status: 403 });
  const source = { method: str(body.method, 20), date: str(body.date, 20), n: str(body.n, 10) };

  const { client, model, usingOwnKey } = await resolveAIClient(user.id, "chat");
  if (!usingOwnKey) {
    const credits = await getCredits(user.id).catch(() => 0);
    if (credits < COST.chat) return NextResponse.json({ error: "积分不足，请联系老师" }, { status: 402 });
  }

  const sys = `你是创新创业课程的调研整理助手。把学生提供的真实调研资料整理成一张"角色卡"，用于生成可对话的数字分身。
要求：
1. 只能提炼资料里明确出现的信息，资料没有的字段留空字符串或空数组，绝不编造。
2. 角色是"一类人"的原型，不写真实姓名、单位全称或任何可识别个人的信息。
3. quotes 只摘录资料中的原话（≤5 条，每条≤60字）。
只输出 JSON，字段：identity(字符串), context(字符串), pains(数组), goals(数组), budget(字符串), decision_logic(字符串), objections(数组), quotes(数组)。`;
  let card: PersonaCard = {};
  try {
    const r = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `角色类型：${TYPE_BY_KEY[rt].label}（${label}）\n调研方式：${source.method || "未注明"}；时间：${source.date || "未注明"}；样本：${source.n || "未注明"}\n\n调研资料：\n${clean}` },
      ],
      response_format: { type: "json_object" },
    } as never) as unknown as { choices: { message: { content: string } }[] };
    const j = pickJson(r.choices?.[0]?.message?.content || "") || {};
    card = {
      identity: str(j.identity), context: str(j.context), pains: arr(j.pains, 6), goals: arr(j.goals, 6),
      budget: str(j.budget, 200), decision_logic: str(j.decision_logic, 300), objections: arr(j.objections, 6),
      quotes: arr(j.quotes, 5), source,
    };
  } catch (e) {
    return NextResponse.json({ error: "生成角色卡失败：" + (e instanceof Error ? e.message : "未知错误") }, { status: 502 });
  }

  const { data, error } = await admin.from("personas").insert({
    owner_id: user.id, kind: "twin", role_type: rt, label, team_code: teamCode,
    card, source_text: clean, pii_flags: pii, visibility: body.visibility === "team" ? "team" : "class",
    consent: { items: CONSENT_ITEMS, at: new Date().toISOString() },
  }).select(PUBLIC_COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!usingOwnKey) await deductCredits(user.id, "persona_build", COST.chat, { model }).catch(() => null);
  return NextResponse.json({ persona: data, pii });
}

/** 修改角色卡 / 启停 / 可见范围（作者或教师） */
export async function PATCH(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const admin = db();
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const id = String(body.id || "");
  const { data: p } = await admin.from("personas").select("owner_id, card").eq("id", id).maybeSingle();
  if (!p) return NextResponse.json({ error: "分身不存在" }, { status: 404 });
  const teacher = await isTeacher(admin, user.id);
  if (p.owner_id !== user.id && !teacher) return NextResponse.json({ error: "无权修改" }, { status: 403 });
  const patch: Record<string, unknown> = {};
  if (typeof body.label === "string") patch.label = body.label.slice(0, 40);
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (body.visibility === "class" || body.visibility === "team") patch.visibility = body.visibility;
  // 归属队伍决定“分身命中”积分记给谁，只允许教师调整
  if (typeof body.team_code === "string") {
    if (!teacher) return NextResponse.json({ error: "归属队伍只能由教师调整" }, { status: 403 });
    patch.team_code = body.team_code.slice(0, 20);
  }
  if (body.card && typeof body.card === "object") {
    const c = body.card as Record<string, unknown>;
    const old = (p.card || {}) as PersonaCard;
    patch.card = {
      ...old,
      identity: str(c.identity ?? old.identity), context: str(c.context ?? old.context),
      pains: c.pains ? arr(c.pains, 6) : old.pains, goals: c.goals ? arr(c.goals, 6) : old.goals,
      budget: str(c.budget ?? old.budget, 200), decision_logic: str(c.decision_logic ?? old.decision_logic),
      objections: c.objections ? arr(c.objections, 6) : old.objections, quotes: c.quotes ? arr(c.quotes, 5) : old.quotes,
      focus: str(c.focus ?? old.focus, 500),
    };
  }
  const { data, error } = await admin.from("personas").update(patch).eq("id", id).select(PUBLIC_COLS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ persona: data });
}

/** 删除（可撤回原则：删除后不再参与任何对局） */
export async function DELETE(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const admin = db();
  const id = new URL(req.url).searchParams.get("id") || "";
  const { data: p } = await admin.from("personas").select("owner_id").eq("id", id).maybeSingle();
  if (!p) return NextResponse.json({ error: "分身不存在" }, { status: 404 });
  if (p.owner_id !== user.id && !(await isTeacher(admin, user.id))) return NextResponse.json({ error: "无权删除" }, { status: 403 });
  const { error } = await admin.from("personas").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

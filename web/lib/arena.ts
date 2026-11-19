import "server-only";
// 虚实对局 · 服务端工具：鉴权、脱敏、分身提示词、检索注入、积分记账。
import { db } from "@/lib/db";
import { TYPE_BY_KEY, type PersonaCard } from "@/lib/arenaShared";

export type Admin = ReturnType<typeof db>;

/** 教师/管理员判断（profiles.role） */
export async function isTeacher(admin: Admin, userId: string): Promise<boolean> {
  const { data } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  return data?.role === "teacher" || data?.role === "admin";
}

// ---------- 脱敏（移植自演知思政 materials.js） ----------
export function piiScan(text: string): Record<string, number> {
  const flags: Record<string, number> = {};
  const count = (k: string, re: RegExp) => { const m = text.match(re); if (m) flags[k] = m.length; };
  count("身份证号", /(?<!\d)\d{17}[\dXx](?!\d)/g);
  count("手机号", /(?<!\d)1[3-9]\d{9}(?!\d)/g);
  count("邮箱", /[\w.+-]+@[\w-]+\.[\w.]+/g);
  count("疑似学号", /学号[:：\s]*\d{6,}/g);
  count("疑似姓名称呼", /(姓名|名字)[:：]\s*\S{2,4}/g);
  return flags;
}
export function redact(text: string): string {
  return text
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, "[身份证号已隐去]")
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, "[手机号已隐去]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[邮箱已隐去]")
    .replace(/(学号[:：\s]*)\d{6,}/g, "$1[已隐去]")
    .replace(/((?:姓名|名字)[:：]\s*)\S{2,4}/g, "$1[已隐去]");
}

// ---------- 检索注入：按问题从原始调研中取最相关片段 ----------
function bigrams(s: string): Set<string> {
  const t = s.replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}
export function retrieve(source: string, query: string, k = 3, size = 360): string[] {
  if (!source.trim() || !query.trim()) return [];
  const chunks: string[] = [];
  const paras = source.split(/\n{1,}/).map((p) => p.trim()).filter(Boolean);
  let buf = "";
  for (const p of paras) {
    if ((buf + p).length > size && buf) { chunks.push(buf); buf = ""; }
    buf += (buf ? "\n" : "") + p;
  }
  if (buf) chunks.push(buf);
  const q = bigrams(query);
  return chunks
    .map((c) => { const b = bigrams(c); let hit = 0; q.forEach((x) => { if (b.has(x)) hit++; }); return { c, s: hit / Math.sqrt(b.size + 1) }; })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.c);
}

// ---------- 分身系统提示词 ----------
export type PersonaRow = {
  id: string; owner_id: string; kind: string; role_type: string; label: string;
  team_code: string; card: PersonaCard; source_text: string; visibility: string; enabled: boolean;
};

const list = (a?: string[]) => (Array.isArray(a) && a.length ? a.map((x) => `- ${x}`).join("\n") : "（未提供）");

export function personaSystem(p: PersonaRow, ctx: { venture: string; teamName: string; snippets: string[] }): string {
  const t = TYPE_BY_KEY[p.role_type];
  const c = p.card || {};
  const stance = t?.stance === "support"
    ? `你的立场是【协作方】：帮对方把方案改得更扎实。先指出一个最关键的薄弱点，再给出可操作的修正建议，并提醒需要补什么现实证据。`
    : `你的立场是【对抗方】：像真实的${t?.label || "角色"}一样压测对方。每轮只提一个尖锐问题，优先索要证据（数据、访谈原话、实测），对空泛回答要直接指出。`;
  const card = p.kind === "role"
    ? `【角色原型】${p.label}\n关注重点：${c.focus || t?.hint || ""}\n身份说明：${c.identity || ""}`
    : `【角色卡 · 基于真实调研生成的数字分身】${p.label}
身份画像：${c.identity || "（未提供）"}
所处场景：${c.context || "（未提供）"}
痛点：\n${list(c.pains)}
目标/期望：\n${list(c.goals)}
预算/付费意愿：${c.budget || "（未提供）"}
决策逻辑：${c.decision_logic || "（未提供）"}
常见顾虑：\n${list(c.objections)}
访谈原话：\n${list(c.quotes)}
资料来源：${[c.source?.method, c.source?.date, c.source?.n ? `样本 ${c.source.n}` : ""].filter(Boolean).join(" · ") || "（未注明）"}`;
  const snip = ctx.snippets.length ? `\n\n【与本轮问题最相关的原始调研片段】\n${ctx.snippets.map((s, i) => `(${i + 1}) ${s}`).join("\n")}` : "";
  const grounding = p.kind === "twin"
    ? `\n\n【必须遵守】你只能依据上面的角色卡和调研片段发言，用这个角色的口吻说话。资料里没有的事，不要编造，要直接说"我的调研资料里没有这个信息，建议你去现实中问问真实的${t?.label || "受访者"}"——这是让学生回到现实验证的关键。`
    : `\n\n【必须遵守】不编造具体数据或来源；需要数据时要求对方拿出证据。`;
  return `你正在参加《创新创业基础》课堂的"虚实对局"。对面是队伍【${ctx.teamName}】，他们经营的 AI 原生微企业是：${ctx.venture || "（未填写）"}。
${stance}
${card}${snip}${grounding}
回复控制在 150 字以内，口语化。
在回复的【最后单独一行】输出标记（不要解释）：
TAGS: demand_evidence=是否在索要证据(0或1); unknown=是否遇到资料里没有的信息(0或1); hypothesis=如果对方暴露出一个值得去现实验证的假设，用一句话写出，否则留空`;
}

export type Tags = { demandEvidence: boolean; unknown: boolean; hypothesis: string };
export function parseTags(text: string): { reply: string; tags: Tags } {
  const m = text.match(/\n?\s*TAGS[:：]([^\n]*)\s*$/i);
  const tags: Tags = { demandEvidence: false, unknown: false, hypothesis: "" };
  if (!m) return { reply: text.trim(), tags };
  const raw = m[1];
  tags.demandEvidence = /demand_evidence\s*=\s*1/.test(raw);
  tags.unknown = /unknown\s*=\s*1/.test(raw);
  const h = raw.match(/hypothesis\s*=\s*(.*)$/);
  tags.hypothesis = (h?.[1] || "").replace(/^[\s"“]+|[\s"”]+$/g, "").slice(0, 160);
  if (/^(无|空|none|null|-)?$/i.test(tags.hypothesis)) tags.hypothesis = "";
  return { reply: text.slice(0, m.index).trim(), tags };
}

// ---------- 证据判定（决定“带证据回应 +1”）----------
// 只认“已经发生的调研/实测结果”和“转述的真实原话”；计划、预测、假想、团队介绍、自家定价不算证据。
// 正反例见 scripts/test-cites-evidence.mts，改规则前后都要跑。

/** 推测/计划类表述：所在分句不参与证据判定 */
const SPECULATIVE = /(预计|预测|估计|计划|打算|准备做|准备去|将会|有望|目标是|肯定会|一定会|应该会|可能会|如果|假如|要是)/;
/** 调研/实测/单据类关键词 */
const RESEARCH = /(访谈|问卷|调研|调查|实测|测试|测了|走访|回访|拜访|采访|样本|数据显示|统计|报价|订单|合同|试用|聊过|问了|问过)/;
/** 数字：阿拉伯数字，或“汉字数字 + 量词”（避免把“一定”“一下”当成数字） */
const NUMBER = /\d|[一二两三四五六七八九十百千万]+\s*(家|位|个|份|次|人|名|天|周|月|件|台|成|户|所|款)/;
/** 带单位的数字 */
const NUMBER_UNIT = /\d+(\.\d+)?\s*(%|％|元|万|亿|人|家|次|份|吨|台|个|天|小时|件|位|户)/;
/** 结果类表述：带单位的数字必须描述一个结果（变化、比例、意愿、成交），否则可能只是自家定价或无出处的宏观数字 */
const RESULT = /(降到|降至|降低|提升|提高|增长|增加|下降|减少|从.{0,12}到|其中|占比?|愿意|同意|拒绝|购买|买了|付费|付了|成交|复购|签约|签了|退货|漏检|转化|反馈|表示|回复|选择)/;
/** 转述原话的动词 */
const SPEECH = /(说|表示|反馈|原话|告诉|提到|讲)/;
/** 引号内 ≥6 字的原话（中英文双引号、单引号、直角引号） */
const QUOTE = /[“"「『'‘][^”"」』'’]{6,}[”"」』'’]/g;

/** 学生回应是否给出了具体证据（规则代理指标，编码阶段可人工复核） */
export function citesEvidence(s: string): boolean {
  for (const sentence of (s || "").split(/[。！？!?；;\n]+/)) {
    if (!sentence.trim()) continue;
    // ① 转述原话：引号外有“说/表示/反馈…”，且不是“肯定会说”这类假想
    const outside = sentence.replace(QUOTE, "");
    if (outside !== sentence && SPEECH.test(outside) && !SPECULATIVE.test(outside)) return true;
    // 推测/计划从出现的分句起延续到句末（“准备做问卷，样本 200 份”整体是计划）；之前已发生的结果照常计入
    const clauses = outside.split(/[，,、：:]/);
    const cut = clauses.findIndex((c) => SPECULATIVE.test(c));
    // 再去掉序号、团队人数介绍，看剩下的内容
    const rest = (cut < 0 ? clauses : clauses.slice(0, cut))
      .join("，")
      .replace(/第\s*[\d一二三四五六七八九十]+/g, "")
      .replace(/\d+\s*个?人的?(团队|小组)/g, "");
    // ② 调研/实测/单据 + 数字
    if (RESEARCH.test(rest) && NUMBER.test(rest)) return true;
    // ③ 带单位的数字描述了一个结果
    if (NUMBER_UNIT.test(rest) && RESULT.test(rest)) return true;
  }
  return false;
}

/** 写一条对局事件（积分账本）；失败不致命 */
export async function logArena(admin: Admin, ev: {
  matchId: string; teamId?: string | null; userId?: string | null; roundNo?: number;
  kind: string; points?: number; personaId?: string | null; payload?: Record<string, unknown>;
}) {
  try {
    await admin.from("arena_events").insert({
      match_id: ev.matchId, team_id: ev.teamId || null, user_id: ev.userId || null,
      round_no: ev.roundNo || 0, kind: ev.kind, points: ev.points || 0,
      persona_id: ev.personaId || null, payload: ev.payload || {},
    });
  } catch { /* 记账失败不阻塞对局 */ }
}

/** 取用户在某局里的队伍（无则 null） */
export async function memberTeam(admin: Admin, matchId: string, userId: string) {
  const { data } = await admin.from("arena_members").select("team_id").eq("match_id", matchId).eq("user_id", userId).maybeSingle();
  if (!data) return null;
  const { data: team } = await admin.from("arena_teams").select("*").eq("id", data.team_id).maybeSingle();
  return team as { id: string; match_id: string; team_code: string; name: string; venture: string; project_id: string | null } | null;
}

/** 用户加入过的所有队伍编号（分身归属队伍、本队可见分身都以此为准，不信任前端传值） */
export async function myTeamCodes(admin: Admin, userId: string): Promise<Set<string>> {
  const { data: mems } = await admin.from("arena_members").select("team_id").eq("user_id", userId);
  const ids = (mems || []).map((m) => m.team_id);
  if (!ids.length) return new Set();
  const { data: teams } = await admin.from("arena_teams").select("team_code").in("id", ids);
  return new Set((teams || []).map((t) => t.team_code as string));
}

export function joinCode(): string {
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i = 0; i < 5; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

/** 教师一键注入的默认角色原型 */
export const DEFAULT_ROLES: { role_type: string; label: string; card: PersonaCard }[] = [
  { role_type: "judge", label: "大赛评委（高教主赛道）", card: { identity: "资深创新创业大赛评委，看重真问题、真需求、真团队", focus: "教育维度、创新维度、团队维度、商业维度、社会价值维度；要求每个结论都有证据" } },
  { role_type: "investor", label: "天使投资人", card: { identity: "关注早期硬科技与产业数字化的天使投资人", focus: "市场规模是否真实、单位经济（获客成本/客单价/回本周期）、为什么是这个团队、竞争壁垒" } },
  { role_type: "mentor", label: "创业导师", card: { identity: "带过多届学生项目的创业导师", focus: "把被证伪的假设改成更好的方案；拆小步、找最便宜的验证办法" } },
  { role_type: "ethics", label: "伦理审查官", card: { identity: "关注技术伦理与社会责任的思政教师", focus: "数据隐私、算法偏见、技术向善、对社会和产业工人的影响" } },
  { role_type: "business", label: "商业分析师", card: { identity: "经管背景的商业分析师", focus: "商业模式画布、成本结构与收入来源、定价依据、现金流" } },
  { role_type: "legal", label: "合规顾问", card: { identity: "法学背景的合规顾问", focus: "知识产权归属、合同风险、数据合规、资质许可" } },
  { role_type: "industry", label: "钛产业导师", card: { identity: "本地钛产业企业一线管理者视角", focus: "真实工况与生产痛点、谁来买单、企业采购决策链、上线落地的现实阻力" } },
];

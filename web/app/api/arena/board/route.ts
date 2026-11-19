import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db, sqlite } from "@/lib/db";
import { isTeacher } from "@/lib/arena";
import { preReviewVerification } from "@/lib/ontology/guide";
import { computeProgress } from "@/lib/ontology/progress";

export const runtime = "nodejs";

const clamp = (x: number) => Math.max(0, Math.min(100, Math.round(x)));
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
const parse = (s: unknown): Record<string, unknown> => {
  if (typeof s !== "string") return {};
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; }
};

/** 本局交锋会话的 scenario 范围：'arena:<id>:' ≤ scenario < 'arena:<id>;'（';' 紧排在 ':' 之后），可走索引，替代 LIKE 前缀全表扫描 */
const scenarioRange = (id: string) => [`arena:${id}:`, `arena:${id};`] as const;

/**
 * 教师大屏数据：
 *  - 对战看板：排行、各队五维、成员席位与个人证据值、虚实闭环漏斗、动态流、待确认的现实验证
 *  - 焦点对战（focus=队伍 id）：该队最近一场交锋的逐轮内容
 *  - 四层闭环：L1 交锋 / L2 课堂前后测 / L3 假设状态 / L4 分身库沉淀
 * 全部只返回席位与战队，不返回学生姓名。仅教师（本局开局教师或教师/管理员角色）可调用。
 *
 * 统计口径：全部在数据库里按队伍/类型/轮次分组汇总，不设行数上限（原先只取最近 4000 条事件、3000 条对话，
 * 一节课交锋多时会截掉第 1 轮数据，导致交锋数、L1、首轮证据引用率偏差）。
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const admin = db();
  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  const focusId = url.searchParams.get("focus") || "";
  const { data: match } = await admin.from("arena_matches").select("*").eq("id", id).maybeSingle();
  if (!match) return NextResponse.json({ error: "对局不存在" }, { status: 404 });
  const owner = match.teacher_id === user.id || (await isTeacher(admin, user.id));
  // 大屏含各队假设原文与焦点对战内容，只给教师
  if (!owner) return NextResponse.json({ error: "大屏数据仅教师可看" }, { status: 403 });

  const q = sqlite();
  const [lo, hi] = scenarioRange(id);

  const [{ data: teams }, { data: hyps }, { data: mems }] = await Promise.all([
    admin.from("arena_teams").select("id, team_code, name, venture, sort").eq("match_id", id).order("sort"),
    admin.from("hypotheses").select("id, team_id, status, text, evidence, evidence_url, round_no, created_at, updated_at").eq("match_id", id),
    admin.from("arena_members").select("team_id, user_id, seat").eq("match_id", id),
  ]);

  // —— 计分账本：按队伍 × 类型汇总次数与积分；按成员汇总个人积分 ——
  const byTeamKind = q.prepare(
    "select team_id, kind, count(*) n, coalesce(sum(points), 0) pts from arena_events where match_id = ? and team_id is not null group by team_id, kind"
  ).all(id) as { team_id: string; kind: string; n: number; pts: number }[];
  const byUser = q.prepare(
    "select team_id, user_id, coalesce(sum(points), 0) pts from arena_events where match_id = ? and user_id is not null group by team_id, user_id"
  ).all(id) as { team_id: string; user_id: string; pts: number }[];
  // 各队最近一次交锋（大屏上的 VS 对手与“正在发言”的席位）
  const lastTurns = q.prepare(
    "select team_id, user_id, payload from arena_events where id in (select max(id) from arena_events where match_id = ? and kind = 'turn' group by team_id)"
  ).all(id) as { team_id: string; user_id: string | null; payload: string }[];

  const kindOf: Record<string, Record<string, { n: number; pts: number }>> = {};
  for (const r of byTeamKind) (kindOf[r.team_id] ||= {})[r.kind] = { n: Number(r.n), pts: Number(r.pts) };
  const userPts: Record<string, number> = {};
  for (const r of byUser) userPts[`${r.team_id}|${r.user_id}`] = Number(r.pts);
  const lastOf: Record<string, { user_id: string | null; payload: Record<string, unknown> }> = {};
  for (const r of lastTurns) lastOf[r.team_id] = { user_id: r.user_id, payload: parse(r.payload) };

  const name: Record<string, string> = {};
  for (const t of teams || []) name[t.id] = t.name;

  const stat = (tid: string) => {
    const k = kindOf[tid] || {};
    const n = (kind: string) => k[kind]?.n || 0;
    const hs = (hyps || []).filter((h) => h.team_id === tid);
    const hc = (s: string) => hs.filter((h) => h.status === s).length;
    const turns = n("turn"), evid = n("evidence_reply");
    const last = lastOf[tid];
    const lastP = (last?.payload || {}) as { persona?: string; role?: string };
    const members = (mems || []).filter((m) => m.team_id === tid).sort((a, b) => a.seat - b.seat).map((m) => ({
      seat: m.seat,
      points: userPts[`${tid}|${m.user_id}`] || 0,
      active: !!last && last.user_id === m.user_id,
    }));
    return {
      score: Object.values(k).reduce((s, x) => s + x.pts, 0),
      members, turns, evidence: evid, twinHits: n("twin_hit"),
      vs: lastP.persona || "", vsRole: lastP.role || "",
      hyp: { pending: hc("pending"), falsified: hc("falsified"), verifying: hc("verifying"), verified: hc("verified"), total: hs.length },
      dims: [
        { dim: "交锋", score: clamp(turns * 5), max: 100 },
        { dim: "证据", score: clamp(turns ? (evid / turns) * 100 : 0), max: 100 },
        { dim: "检验", score: clamp((hc("falsified") + hc("verified")) * 20), max: 100 },
        { dim: "验证", score: clamp(hc("verified") * 25), max: 100 },
        { dim: "调研", score: clamp(n("twin_hit") * 25), max: 100 },
      ],
    };
  };
  const board = (teams || []).map((t) => ({ ...t, ...stat(t.id) })).sort((a, b) => b.score - a.score);

  // —— 战况播报：最近 30 条非交锋事件 ——
  const LABEL: Record<string, string> = {
    evidence_reply: "拿出证据回应", hypothesis: "提出假设", falsify: "证伪并修正", verify_submit: "提交现实验证",
    verify: "现实验证通过", twin_hit: "分身命中", round: "轮次",
  };
  const recent = q.prepare(
    "select id, team_id, kind, points, payload, created_at from arena_events where match_id = ? and kind <> 'turn' order by id desc limit 30"
  ).all(id) as { id: number; team_id: string | null; kind: string; points: number; payload: string; created_at: string }[];
  const feed = recent.map((e) => ({
    id: Number(e.id), team: e.team_id ? name[e.team_id] || "" : "", kind: e.kind, label: LABEL[e.kind] || e.kind,
    points: Number(e.points), payload: parse(e.payload), at: e.created_at,
  }));

  const all = hyps || [];
  const totals = {
    turns: board.reduce((s, t) => s + t.turns, 0),
    evidence: board.reduce((s, t) => s + t.evidence, 0),
    pending: all.filter((h) => h.status === "pending").length,
    falsified: all.filter((h) => h.status === "falsified").length,
    verifying: all.filter((h) => h.status === "verifying").length,
    verified: all.filter((h) => h.status === "verified").length,
    members: (mems || []).length,
  };
  const verifying = all.filter((h) => h.status === "verifying").map((h) => ({ ...h, team: name[h.team_id] || "", prereview: preReviewVerification(h.evidence) }));
  // MVP 迭代视图：绑定了项目的队伍，显示 8 步进度与已发布版本（只显示队名）
  const mvp = (teams || []).map((t) => {
    const pid = (q.prepare("select project_id from arena_teams where id = ?").get(t.id) as { project_id: string | null } | undefined)?.project_id;
    if (!pid) return { team: t.name, bound: false, steps: [] as string[], done: 0, current: 0, versions: [] as string[] };
    const pr = computeProgress(q, pid);
    const versions = (q.prepare("select label from product_versions where project_id = ? and status in ('certified','confirmed') order by created_at, rowid").all(pid) as { label: string }[]).map((v) => v.label);
    return { team: t.name, bound: true, steps: pr.steps.map((s) => s.status), done: pr.done, current: pr.current, versions };
  });

  // —— 焦点对战：该队最近一次发言所在的会话，取最后 6 句 ——
  let focus: unknown = null;
  const ft = (teams || []).find((t) => t.id === focusId);
  if (ft) {
    const latest = q.prepare(
      `select s.id, s.user_id, s.round_no, s.scenario from dialogue_turns t join challenge_sessions s on s.id = t.session_id
       where s.scenario >= ? and s.scenario < ? and s.team_code = ? order by t.id desc limit 1`
    ).get(lo, hi, ft.team_code) as { id: string; user_id: string; round_no: number; scenario: string } | undefined;
    if (latest) {
      const personaId = latest.scenario.split(":")[2] || "";
      const { data: p } = await admin.from("personas").select("label, role_type, kind").eq("id", personaId).maybeSingle();
      const line = (q.prepare(
        "select id, speaker, content, cites_evidence, demands_evidence from dialogue_turns where session_id = ? order by turn_index desc limit 6"
      ).all(latest.id) as { id: number; speaker: string; content: string; cites_evidence: number; demands_evidence: number }[]).reverse();
      const seat = (mems || []).find((m) => m.user_id === latest.user_id)?.seat ?? 0;
      focus = {
        team: { id: ft.id, name: ft.name, venture: ft.venture },
        persona: p || { label: "对手", role_type: "judge", kind: "role" },
        seat, round: Number(latest.round_no),
        turns: line.map((t) => ({ id: Number(t.id), speaker: t.speaker, content: t.content, cites: !!t.cites_evidence, demands: !!t.demands_evidence })),
      };
    } else {
      focus = { team: { id: ft.id, name: ft.name, venture: ft.venture }, persona: null, seat: 0, round: match.round_no, turns: [] };
    }
  }

  // —— 四层闭环：按轮次 × 发言方汇总本局全部对话 ——
  const dlg = q.prepare(
    `select s.round_no, t.speaker, count(*) n, coalesce(sum(t.cites_evidence), 0) cite, coalesce(sum(t.demands_evidence), 0) demand
     from dialogue_turns t join challenge_sessions s on s.id = t.session_id
     where s.scenario >= ? and s.scenario < ? group by s.round_no, t.speaker`
  ).all(lo, hi) as { round_no: number; speaker: string; n: number; cite: number; demand: number }[];
  const sum = (speaker: string, f: "n" | "cite" | "demand", round?: number) =>
    dlg.filter((r) => r.speaker === speaker && (round === undefined || Number(r.round_no) === round)).reduce((s, r) => s + Number(r[f]), 0);
  const rate = (round: number) => pct(sum("student", "cite", round), sum("student", "n", round));
  const [{ count: personaCount }, { count: skillCount }] = await Promise.all([
    admin.from("personas").select("id", { count: "exact", head: true }).eq("enabled", true),
    admin.from("user_skills").select("id", { count: "exact", head: true }),
  ]);
  const loops = {
    l1: { turns: sum("student", "n"), demand: sum("agent", "demand"), cite: sum("student", "cite") },
    l2: { pre: rate(1), post: match.round_no > 1 ? rate(match.round_no) : null, round: match.round_no },
    l3: { pending: totals.pending, falsified: totals.falsified, verifying: totals.verifying, verified: totals.verified, iterations: totals.falsified + totals.verified },
    l4: { personas: personaCount || 0, skills: skillCount || 0 },
  };

  return NextResponse.json({ match, owner, board, feed, totals, verifying, focus, loops, mvp, now: new Date().toISOString() });
}

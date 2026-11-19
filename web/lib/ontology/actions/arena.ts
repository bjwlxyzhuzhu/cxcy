import "server-only";
import type { Sqlite } from "@/lib/db";
import { defineAction, ActionError, str, type Ctx } from "../engine";
import { POINTS, TYPE_BY_KEY as ROLE_BY_KEY } from "@/lib/arenaShared";
import { citesEvidence, joinCode } from "@/lib/arena";

/**
 * 虚实对局 · 动作（原先分散在各接口里，现统一由动作引擎执行）
 * 计分事件与状态变更在同一事务里完成，天然防止并发重复计分；每次操作都有审计记录。
 * 所有计分动作都是 humanOnly：AI 不能替学生出招、提假设或证伪。
 */

const HYP_CAP_PER_ROUND = 5;
const EVIDENCE_CAP_PER_ROUND = 8; // 每队每轮“带证据回应”最多计分次数，防刷
const DIM: Record<string, string> = {
  customer: "demand", buyer: "demand", judge: "value", investor: "value", business: "value",
  competitor: "feasibility", supplier: "feasibility", expert: "feasibility", industry: "feasibility", legal: "feasibility",
  mentor: "value", ethics: "ethics",
};

type Match = { id: string; teacher_id: string; status: string; round_no: number; rounds: number; round_minutes: number; join_code: string };
type Team = { id: string; match_id: string; team_code: string; name: string; venture: string; project_id: string | null };
type Hyp = { id: string; match_id: string | null; team_id: string | null; project_id: string | null; created_by: string | null; persona_id: string | null; text: string; status: string; evidence: string };

const getMatch = (c: Sqlite, id: string) => (c.prepare("select * from arena_matches where id = ?").get(id) as Match | undefined) ?? null;

function teamOf(c: Sqlite, matchId: string, userId: string): Team | null {
  return (c.prepare(
    "select t.* from arena_members m join arena_teams t on t.id = m.team_id where m.match_id = ? and m.user_id = ?"
  ).get(matchId, userId) as Team | undefined) ?? null;
}

function logEvent(c: Sqlite, e: { matchId: string; teamId?: string | null; userId?: string | null; roundNo: number; kind: string; points?: number; personaId?: string | null; payload?: Record<string, unknown> }) {
  c.prepare(
    "insert into arena_events (match_id, team_id, user_id, round_no, kind, points, persona_id, payload) values (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(e.matchId, e.teamId ?? null, e.userId ?? null, e.roundNo || 0, e.kind, e.points || 0, e.personaId ?? null, JSON.stringify(e.payload || {}));
}

/** 方案过程快照（研究用 plan_versions）：队伍绑定了云端项目才写 */
function snapshot(c: Sqlite, team: { project_id: string | null; team_code: string }, userId: string, state: "A" | "F" | "V", summary: string) {
  if (!team.project_id) return;
  const last = c.prepare("select max(version_no) v from plan_versions where project_id = ?").get(team.project_id) as { v: number | null };
  const proj = c.prepare("select sections from projects where id = ?").get(team.project_id) as { sections: string } | undefined;
  c.prepare(
    "insert into plan_versions (project_id, user_id, team_code, version_no, sections, change_summary, seq_state) values (?, ?, ?, ?, ?, ?, ?)"
  ).run(team.project_id, userId, team.team_code, Number(last?.v || 0) + 1, proj?.sections || "{}", summary.slice(0, 1000), state);
}

function scopeMatch(ctx: Ctx, m: Match) {
  ctx.scope.matchId = m.id;
}

// ───────────────────────── 教师：开局与控场 ─────────────────────────

defineAction({
  key: "arena.create", label: "开局", humanOnly: true,
  parse: (b) => ({
    title: str(b.title, 60) || "虚实对局", scenario: str(b.scenario, 60),
    rounds: Math.min(8, Math.max(1, Number(b.rounds) || 3)), round_minutes: Math.min(60, Math.max(3, Number(b.round_minutes) || 12)),
    team_count: Math.min(12, Math.max(2, Number(b.team_count) || 6)),
    team_names: Array.isArray(b.team_names) ? (b.team_names as unknown[]).map((x) => String(x)) : [],
  }),
  run: (ctx, p) => {
    if (!ctx.isTeacher) throw new ActionError(403, "仅教师可开局");
    const m = ctx.c.prepare(
      "insert into arena_matches (teacher_id, title, scenario, rounds, round_minutes, join_code) values (?, ?, ?, ?, ?, ?) returning *"
    ).get(ctx.actor.userId, p.title, p.scenario, p.rounds, p.round_minutes, joinCode()) as unknown as Match;
    const ins = ctx.c.prepare("insert into arena_teams (match_id, team_code, name, sort) values (?, ?, ?, ?)");
    for (let i = 0; i < p.team_count; i++) ins.run(m.id, `T${i + 1}`, (p.team_names[i] || `第${i + 1}队`).slice(0, 20), i);
    scopeMatch(ctx, m);
    return { match: m };
  },
});

defineAction({
  key: "arena.control", label: "轮次控制", humanOnly: true,
  parse: (b) => {
    const op = str(b.op, 10);
    if (!["start", "next", "end", "reopen"].includes(op)) throw new ActionError(400, "未知操作");
    return { match_id: str(b.match_id, 64), op };
  },
  run: (ctx, p) => {
    const m = getMatch(ctx.c, p.match_id);
    if (!m) throw new ActionError(404, "对局不存在");
    scopeMatch(ctx, m);
    if (m.teacher_id !== ctx.actor.userId && !ctx.isTeacher) throw new ActionError(403, "无权操作");
    const ends = new Date(Date.now() + m.round_minutes * 60000).toISOString();
    const patch =
      p.op === "start" ? { status: "running", round_no: Math.max(1, m.round_no), round_ends_at: ends }
      : p.op === "next" ? { status: "running", round_no: m.round_no + 1, round_ends_at: ends }
      : p.op === "end" ? { status: "ended", round_no: m.round_no, round_ends_at: null }
      : { status: "running", round_no: m.round_no, round_ends_at: ends };
    const data = ctx.c.prepare("update arena_matches set status = ?, round_no = ?, round_ends_at = ? where id = ? returning *")
      .get(patch.status, patch.round_no, patch.round_ends_at, m.id) as unknown as Match;
    logEvent(ctx.c, { matchId: m.id, userId: ctx.actor.userId, roundNo: data.round_no, kind: "round", payload: { action: p.op, round: data.round_no } });
    return { match: data };
  },
});

defineAction({
  key: "arena.rename_team", label: "改队名", humanOnly: true,
  parse: (b) => ({ team_id: str(b.team_id, 64), name: str(b.name, 20) }),
  run: (ctx, p) => {
    if (!ctx.isTeacher) throw new ActionError(403, "仅教师可改队名");
    const t = ctx.c.prepare("select match_id from arena_teams where id = ?").get(p.team_id) as { match_id: string } | undefined;
    if (!t) throw new ActionError(404, "队伍不存在");
    ctx.scope.matchId = t.match_id;
    ctx.c.prepare("update arena_teams set name = ? where id = ?").run(p.name, p.team_id);
    return { ok: true };
  },
});

// ───────────────────────── 学生：入队、填写微企业 ─────────────────────────

defineAction({
  key: "arena.join", label: "入队选席位", humanOnly: true,
  parse: (b) => ({ match_id: str(b.match_id, 64), team_id: str(b.team_id, 64), join_code: str(b.join_code, 10).toUpperCase(), seat: Math.min(4, Math.max(0, Number(b.seat) || 0)) }),
  run: (ctx, p) => {
    const m = getMatch(ctx.c, p.match_id);
    if (!m || m.status === "ended") throw new ActionError(404, "对局不存在或已结束");
    scopeMatch(ctx, m);
    if (m.join_code !== p.join_code) throw new ActionError(400, "对局码不对，请看大屏上的 5 位码");
    const t = ctx.c.prepare("select id from arena_teams where id = ? and match_id = ?").get(p.team_id, m.id);
    if (!t) throw new ActionError(400, "请选择队伍");
    // 同一队的同一席位只能一人（大屏按席位显示头像）
    const taken = ctx.c.prepare("select user_id from arena_members where team_id = ? and seat = ? and user_id <> ?").get(p.team_id, p.seat, ctx.actor.userId);
    if (taken) throw new ActionError(409, "这个席位已有队友，请换一个");
    ctx.c.prepare(
      "insert into arena_members (match_id, team_id, user_id, seat) values (?, ?, ?, ?) on conflict (match_id, user_id) do update set team_id = excluded.team_id, seat = excluded.seat"
    ).run(m.id, p.team_id, ctx.actor.userId, p.seat);
    return { ok: true };
  },
});

defineAction({
  key: "arena.venture", label: "填写本队微企业", humanOnly: true,
  parse: (b) => ({ match_id: str(b.match_id, 64), venture: str(b.venture, 200) }),
  run: (ctx, p) => {
    ctx.scope.matchId = p.match_id;
    const team = teamOf(ctx.c, p.match_id, ctx.actor.userId);
    if (!team) throw new ActionError(403, "你还没加入队伍");
    ctx.c.prepare("update arena_teams set venture = ? where id = ?").run(p.venture, team.id);
    return { ok: true };
  },
});

// ───────────────────────── 交锋记账（模型回复在动作外生成）─────────────────────────

defineAction({
  key: "arena.record_turn", label: "交锋记账", humanOnly: true,
  parse: (b) => {
    const tags = (b.tags || {}) as Record<string, unknown>;
    return {
      match_id: str(b.match_id, 64), persona_id: str(b.persona_id, 64),
      student: str(b.student, 4000), reply: str(b.reply, 4000),
      tags: { demandEvidence: tags.demandEvidence === true, unknown: tags.unknown === true },
    };
  },
  run: (ctx, p) => {
    const m = getMatch(ctx.c, p.match_id);
    if (!m) throw new ActionError(404, "对局不存在");
    scopeMatch(ctx, m);
    if (m.status !== "running") throw new ActionError(409, m.status === "ended" ? "对局已结束" : "老师还没开始本轮");
    const team = teamOf(ctx.c, m.id, ctx.actor.userId);
    if (!team) throw new ActionError(403, "请先加入一支队伍");
    const pr = ctx.c.prepare("select id, label, role_type from personas where id = ?").get(p.persona_id) as { id: string; label: string; role_type: string } | undefined;
    if (!pr) throw new ActionError(404, "该分身不可用");
    ctx.scope.targetType = "persona";
    ctx.scope.targetId = pr.id;

    // 轮级入库：同一学生 × 同一分身 × 同一轮 = 一个质询会话
    const scenario = `arena:${m.id}:${pr.id}`;
    let s = ctx.c.prepare("select id from challenge_sessions where user_id = ? and scenario = ? and round_no = ?").get(ctx.actor.userId, scenario, m.round_no) as { id: string } | undefined;
    if (!s) s = ctx.c.prepare(
      "insert into challenge_sessions (user_id, project_id, team_code, round_no, scenario, dbr_cycle) values (?, ?, ?, ?, ?, 1) returning id"
    ).get(ctx.actor.userId, team.project_id, team.team_code, m.round_no, scenario) as { id: string };
    const n = ctx.c.prepare("select count(*) n from dialogue_turns where session_id = ?").get(s.id) as { n: number };
    const base = Number(n.n) + 1;
    const cited = citesEvidence(p.student);
    const dim = DIM[pr.role_type] || null;
    const insT = ctx.c.prepare(
      "insert into dialogue_turns (session_id, user_id, turn_index, speaker, agent_key, conflict_dim, content, demands_evidence, cites_evidence) values (?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    insT.run(s.id, ctx.actor.userId, base, "student", null, dim, p.student, 0, cited ? 1 : 0);
    insT.run(s.id, ctx.actor.userId, base + 1, "agent", pr.role_type, dim, p.reply, p.tags.demandEvidence ? 1 : 0, 0);

    // 证据计分（每队每轮上限）
    let points = 0;
    if (cited) {
      const c = ctx.c.prepare("select count(*) n from arena_events where team_id = ? and round_no = ? and kind = 'evidence_reply'").get(team.id, m.round_no) as { n: number };
      points = Number(c.n) < EVIDENCE_CAP_PER_ROUND ? POINTS.evidence_reply : 0;
      logEvent(ctx.c, { matchId: m.id, teamId: team.id, userId: ctx.actor.userId, roundNo: m.round_no, kind: "evidence_reply", points, personaId: pr.id, payload: { persona: pr.label, q: p.student.slice(0, 120) } });
    }
    logEvent(ctx.c, {
      matchId: m.id, teamId: team.id, userId: ctx.actor.userId, roundNo: m.round_no, kind: "turn", personaId: pr.id,
      payload: { persona: pr.label, role: pr.role_type, stance: ROLE_BY_KEY[pr.role_type]?.stance, unknown: p.tags.unknown, demand: p.tags.demandEvidence },
    });
    return { points, cited };
  },
});

// ───────────────────────── 假设：提出 → 证伪 / 提交验证 → 教师确认 ─────────────────────────

defineAction({
  key: "hypothesis.create", label: "提出假设", humanOnly: true,
  parse: (b) => ({ match_id: str(b.match_id, 64), text: str(b.text, 300), persona_id: str(b.persona_id, 64) || null }),
  run: (ctx, p) => {
    const m = getMatch(ctx.c, p.match_id);
    if (!m || m.status === "ended") throw new ActionError(409, "对局不可用");
    scopeMatch(ctx, m);
    const team = teamOf(ctx.c, m.id, ctx.actor.userId);
    if (!team) throw new ActionError(403, "请先加入队伍");
    if (p.text.length < 10) throw new ActionError(400, "假设要写成可检验的一句话，例如：\"中小材料加工厂愿意为质检自动化每年付 3 万元以上\"");
    const h = ctx.c.prepare(
      "insert into hypotheses (match_id, team_id, project_id, created_by, round_no, persona_id, text) values (?, ?, ?, ?, ?, ?, ?) returning *"
    ).get(m.id, team.id, team.project_id, ctx.actor.userId, m.round_no || 1, p.persona_id, p.text) as unknown as Hyp;
    ctx.scope.projectId = team.project_id;
    ctx.scope.targetType = "hypothesis";
    ctx.scope.targetId = h.id;
    const c = ctx.c.prepare("select count(*) n from arena_events where team_id = ? and round_no = ? and kind = 'hypothesis'").get(team.id, m.round_no) as { n: number };
    const points = Number(c.n) < HYP_CAP_PER_ROUND ? POINTS.hypothesis : 0;
    logEvent(ctx.c, { matchId: m.id, teamId: team.id, userId: ctx.actor.userId, roundNo: m.round_no, kind: "hypothesis", points, personaId: h.persona_id, payload: { text: h.text.slice(0, 120) } });
    snapshot(ctx.c, team, ctx.actor.userId, "A", `提出假设：${h.text}`);
    return { hypothesis: h, points };
  },
});

/** 取假设与对局，并校验操作者属于该队 */
function ownHyp(ctx: Ctx, id: string) {
  const h = ctx.c.prepare("select * from hypotheses where id = ?").get(id) as unknown as Hyp | undefined;
  if (!h) throw new ActionError(404, "假设不存在");
  ctx.scope.targetType = "hypothesis";
  ctx.scope.targetId = h.id;
  ctx.scope.projectId = h.project_id;
  if (!h.match_id) throw new ActionError(400, "这条假设不属于对局");
  const m = getMatch(ctx.c, h.match_id);
  if (!m) throw new ActionError(404, "对局不存在");
  scopeMatch(ctx, m);
  return { h, m };
}

defineAction({
  key: "hypothesis.falsify", label: "证伪并修正", humanOnly: true,
  parse: (b) => ({ id: str(b.id, 64), reason: str(b.reason, 500), revision: str(b.revision, 500) }),
  run: (ctx, p) => {
    const { h, m } = ownHyp(ctx, p.id);
    const team = teamOf(ctx.c, m.id, ctx.actor.userId);
    if (!team || team.id !== h.team_id) throw new ActionError(403, "只能操作本队的假设");
    if (h.status !== "pending") throw new ActionError(409, "只有待验证的假设可以证伪");
    if (p.reason.length < 8 || p.revision.length < 8) throw new ActionError(400, "请写清楚：为什么不成立？改成什么？");
    const nh = ctx.c.prepare("update hypotheses set status = 'falsified', reason = ?, revision = ? where id = ? and status = 'pending' returning *").get(p.reason, p.revision, h.id);
    if (!nh) throw new ActionError(409, "这条假设已被处理");
    logEvent(ctx.c, { matchId: m.id, teamId: team.id, userId: ctx.actor.userId, roundNo: m.round_no, kind: "falsify", points: POINTS.falsify, personaId: h.persona_id, payload: { text: h.text.slice(0, 120), revision: p.revision.slice(0, 120) } });
    snapshot(ctx.c, team, ctx.actor.userId, "F", `证伪：${h.text}\n理由：${p.reason}\n修正：${p.revision}`);
    // 别队的调研分身让本队证伪了假设 → 奖励做分身的队伍（扎实调研）
    if (h.persona_id) {
      const pr = ctx.c.prepare("select kind, team_code, label from personas where id = ?").get(h.persona_id) as { kind: string; team_code: string; label: string } | undefined;
      if (pr?.kind === "twin" && pr.team_code && pr.team_code !== team.team_code) {
        const author = ctx.c.prepare("select id from arena_teams where match_id = ? and team_code = ?").get(m.id, pr.team_code) as { id: string } | undefined;
        if (author) logEvent(ctx.c, { matchId: m.id, teamId: author.id, roundNo: m.round_no, kind: "twin_hit", points: POINTS.twin_hit, personaId: h.persona_id, payload: { persona: pr.label, against: team.name } });
      }
    }
    return { hypothesis: nh, points: POINTS.falsify };
  },
});

defineAction({
  key: "hypothesis.verify_submit", label: "提交现实验证", humanOnly: true,
  parse: (b) => ({ id: str(b.id, 64), evidence: str(b.evidence, 1000), evidence_url: str(b.evidence_url, 300) }),
  run: (ctx, p) => {
    const { h, m } = ownHyp(ctx, p.id);
    const team = teamOf(ctx.c, m.id, ctx.actor.userId);
    if (!team || team.id !== h.team_id) throw new ActionError(403, "只能操作本队的假设");
    if (h.status !== "pending") throw new ActionError(409, "只有待验证的假设可以提交验证");
    if (p.evidence.length < 20) throw new ActionError(400, "请写清现实验证的过程与结果（谁、怎么验证、结果如何），至少 20 字");
    const nh = ctx.c.prepare("update hypotheses set status = 'verifying', evidence = ?, evidence_url = ? where id = ? and status = 'pending' returning *").get(p.evidence, p.evidence_url, h.id);
    if (!nh) throw new ActionError(409, "这条假设已被处理");
    logEvent(ctx.c, { matchId: m.id, teamId: team.id, userId: ctx.actor.userId, roundNo: m.round_no, kind: "verify_submit", personaId: h.persona_id, payload: { text: h.text.slice(0, 120) } });
    return { hypothesis: nh };
  },
});

defineAction({
  key: "hypothesis.review", label: "教师确认现实验证", humanOnly: true,
  parse: (b) => ({ id: str(b.id, 64), ok: b.ok === true, note: str(b.note, 300) }),
  run: (ctx, p) => {
    const { h, m } = ownHyp(ctx, p.id);
    if (m.teacher_id !== ctx.actor.userId && !ctx.isTeacher) throw new ActionError(403, "仅教师可确认");
    if (h.status !== "verifying") throw new ActionError(409, "这条假设不在待确认状态");
    const nh = ctx.c.prepare("update hypotheses set status = ?, reviewed_by = ?, review_note = ? where id = ? and status = 'verifying' returning *")
      .get(p.ok ? "verified" : "pending", ctx.actor.userId, p.note, h.id);
    if (!nh) throw new ActionError(409, "这条假设已被处理");
    if (p.ok) {
      logEvent(ctx.c, { matchId: m.id, teamId: h.team_id, userId: h.created_by, roundNo: m.round_no, kind: "verify", points: POINTS.verify, personaId: h.persona_id, payload: { text: h.text.slice(0, 120) } });
      const team = ctx.c.prepare("select project_id, team_code from arena_teams where id = ?").get(h.team_id) as { project_id: string | null; team_code: string } | undefined;
      if (team) snapshot(ctx.c, team, h.created_by || ctx.actor.userId, "V", `现实验证通过：${h.text}\n证据：${h.evidence}`);
    }
    return { hypothesis: nh };
  },
});

// ───────────────────────── 学生：把对局队伍绑定到本队项目 ─────────────────────────

defineAction({
  key: "arena.bind_project", label: "对局队伍绑定项目", humanOnly: true,
  parse: (b) => ({ match_id: str(b.match_id, 64), project_id: str(b.project_id, 64) }),
  run: (ctx, p) => {
    ctx.scope.matchId = p.match_id;
    const team = teamOf(ctx.c, p.match_id, ctx.actor.userId);
    if (!team) throw new ActionError(403, "你还没加入队伍");
    if (p.project_id) {
      const m = ctx.c.prepare("select 1 from project_members where project_id = ? and user_id = ?").get(p.project_id, ctx.actor.userId);
      if (!m) throw new ActionError(403, "只能绑定你参与的项目");
      ctx.scope.projectId = p.project_id;
    }
    ctx.c.prepare("update arena_teams set project_id = ? where id = ?").run(p.project_id || null, team.id);
    // 本局里本队已有的假设一并归到该项目，方便在项目本体里看到
    if (p.project_id) ctx.c.prepare("update hypotheses set project_id = ? where team_id = ? and project_id is null").run(p.project_id, team.id);
    return { ok: true };
  },
});

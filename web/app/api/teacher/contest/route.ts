import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { isTeacherSync, parseJson } from "@/lib/ontology/engine";
import { computeProgress } from "@/lib/ontology/progress";
import { computeAbilities } from "@/lib/ontology/abilities";
import { classScope } from "@/lib/classes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

/**
 * 参赛材料（人工智能+ 赛道）的数据证据：只做统计，全部来自数据库真实记录，不生成任何结论文字。
 * 范围 = 本教师认领的班级（管理员或未认领班级的教师 = 全部）。不返回任何学生个人信息。
 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const c = sqlite();
  if (!isTeacherSync(c, user.id)) return NextResponse.json({ error: "仅教师可用" }, { status: 403 });
  const scope = classScope(c, user.id);
  const stu = (scope.all
    ? c.prepare("select id from profiles where role = 'student'").all()
    : c.prepare(`select id from profiles where role = 'student' and class in (${scope.classes.map(() => "?").join(",")})`).all(...scope.classes)) as { id: string }[];
  const ids = stu.map((s) => s.id);
  const IN = ids.length ? ids.map(() => "?").join(",") : "''";
  const one = (sql: string, ...p: unknown[]) => Number((c.prepare(sql).get(...p) as { n: number } | undefined)?.n || 0);
  const projects = (ids.length ? c.prepare(`select distinct project_id id from project_members where user_id in (${IN})`).all(...ids) : []) as { id: string }[];
  const pids = projects.map((p) => p.id);
  const PIN = pids.length ? pids.map(() => "?").join(",") : "''";
  const ok = "status in ('certified','confirmed')";

  const progress = pids.map((id) => computeProgress(c, id));
  const stepReach = Array.from({ length: 8 }, (_, i) => progress.filter((p) => p.steps[i]?.status === "done").length);
  const abil: Record<string, { label: string; total: number }> = {};
  for (const id of pids) for (const a of computeAbilities(c, id)) (abil[a.key] ||= { label: a.label, total: 0 }).total += a.count;

  // 人判断 / AI 执行：本体动作按执行方统计；AI 原话核验后被驳回、被清空的条数
  const audits = (pids.length ? c.prepare(`select actor_kind k, count(*) n from onto_audit where ok = 1 and project_id in (${PIN}) group by actor_kind`).all(...pids) : []) as { k: string; n: number }[];
  const byKind = Object.fromEntries(audits.map((a) => [a.k, Number(a.n)]));
  const certifies = pids.length ? one(`select count(*) n from onto_audit where ok = 1 and action = 'object.certify' and project_id in (${PIN})`, ...pids) : 0;
  const rejects = pids.length ? one(`select count(*) n from onto_audit where ok = 1 and action = 'object.reject' and project_id in (${PIN})`, ...pids) : 0;

  // 证据意识：学生在对局交锋中引用证据的比例，第 1 轮 vs 最后一轮（L2 前后测口径）
  const rounds = (ids.length ? c.prepare(
    `select s.round_no r, count(*) n, coalesce(sum(t.cites_evidence),0) cite from dialogue_turns t join challenge_sessions s on s.id = t.session_id
     where t.speaker = 'student' and t.user_id in (${IN}) group by s.round_no order by s.round_no`).all(...ids) : []) as { r: number; n: number; cite: number }[];
  const first = rounds[0], last = rounds.length > 1 ? rounds[rounds.length - 1] : undefined;

  const lessons = (c.prepare("select id, class, unit_no, marks, started_at, ended_at from lesson_sessions where teacher_id = ? order by started_at desc limit 30").all(user.id) as Record<string, unknown>[])
    .map((l) => ({ id: String(l.id), class: String(l.class), unit_no: Number(l.unit_no), started_at: String(l.started_at), ended_at: (l.ended_at as string) || null, marks: parseJson<{ key: string; label: string; at: string }[]>(l.marks, []) }));

  const usage = ids.length ? one(`select count(*) n from usage_logs where user_id in (${IN})`, ...ids) : 0;
  const cardsSent = ids.length ? one(`select count(*) n from intervention_cards where user_id in (${IN})`, ...ids) : 0;
  const cardsAnswered = ids.length ? one(`select count(*) n from intervention_cards where user_id in (${IN}) and status <> 'open'`, ...ids) : 0;

  return NextResponse.json({
    scope: scope.all ? "全部班级" : scope.classes.join("、"),
    stats: {
      students: ids.length, projects: pids.length,
      evidence: pids.length ? one(`select count(*) n from evidence_items where project_id in (${PIN}) and ${ok}`, ...pids) : 0,
      quotes: pids.length ? one(`select count(*) n from evidence_items where project_id in (${PIN}) and ${ok} and trim(quote) <> ''`, ...pids) : 0,
      decisions: pids.length ? one(`select count(*) n from decisions where project_id in (${PIN}) and ${ok}`, ...pids) : 0,
      versions2: pids.length ? one(`select count(*) n from product_versions where project_id in (${PIN}) and ${ok} and label like 'V0.2%'`, ...pids) : 0,
      verified: ids.length ? one(`select count(distinct h.id) n from hypotheses h join arena_members m on m.match_id = h.match_id and m.team_id = h.team_id where h.status = 'verified' and m.user_id in (${IN})`, ...ids) : 0,
      falsified: ids.length ? one(`select count(distinct h.id) n from hypotheses h join arena_members m on m.match_id = h.match_id and m.team_id = h.team_id where h.status = 'falsified' and m.user_id in (${IN})`, ...ids) : 0,
      aiUses: usage, aiActions: byKind.ai || 0, humanActions: byKind.human || 0, certifies, rejects,
      cardsSent, cardsAnswered, cardRate: pct(cardsAnswered, cardsSent),
      citeFirst: first ? pct(Number(first.cite), Number(first.n)) : null, citeLast: last ? pct(Number(last.cite), Number(last.n)) : null,
      roundFirst: first ? Number(first.r) : null, roundLast: last ? Number(last.r) : null,
    },
    stepReach,
    abilities: Object.entries(abil).map(([key, v]) => ({ key, label: v.label, avg: pids.length ? Math.round((v.total / pids.length) * 10) / 10 : 0 })),
    lessons,
    at: new Date().toISOString(),
  });
}

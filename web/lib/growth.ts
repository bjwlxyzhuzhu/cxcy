import "server-only";
import type { Sqlite } from "@/lib/db";
import { computeAbilities } from "@/lib/ontology/abilities";
import { computeProgress } from "@/lib/ontology/progress";
import { STEP_GUIDE } from "@/lib/ontology/pipeline";

/**
 * 学生成长报告：三类评价全部由数据库真实记录计算，AI 不打分。
 *   过程性评价：按周统计学习行为（留下的学习证据、AI 使用、项目里新认证的对象、对局中带证据的回应）与 8 步里程碑日期
 *   增值性评价：基线（开课第 2 周末）与现在的对比——五力条数、已完成步数、对局中引用证据的比例（首轮 vs 末轮）
 *   终结性评价：学期结束（或今天）时的最终结果——8 步完成情况、五力、教师确认的现实验证、路演页与项目档案、教师评语
 * 项目为团队共有：五力与 8 步按学生所在的第一个项目计算，报告里会注明项目与成员数。
 */

export type Term = { id: string; name: string; start_date: string; end_date: string };
export type Course = { id: string; term_id: string; name: string; term: string; start_date: string; end_date: string; classes: string[] };

const DAY = 86400_000;
/** YYYY-MM-DD（北京时间）→ 当天 0 点的 ISO 时间 */
export const cnDate = (d: string) => new Date(Date.parse(`${d}T00:00:00+08:00`)).toISOString();

export function listCourses(c: Sqlite): Course[] {
  const rows = c.prepare(
    `select co.id, co.term_id, co.name, t.name term, t.start_date, t.end_date from courses co join terms t on t.id = co.term_id
     order by t.start_date desc, co.name`
  ).all() as Omit<Course, "classes">[];
  const cls = c.prepare("select class from course_classes where course_id = ? order by class");
  return rows.map((r) => ({ ...r, classes: (cls.all(r.id) as { class: string }[]).map((x) => x.class) }));
}

/** 学生所在的课程（按班级匹配，取开课最晚的那门） */
export function courseOfStudent(c: Sqlite, userId: string): Course | null {
  const klass = (c.prepare("select class from profiles where id = ?").get(userId) as { class: string | null } | undefined)?.class;
  if (!klass) return null;
  return listCourses(c).find((co) => co.classes.includes(klass)) || null;
}

type Week = { week: number; from: string; evidence: number; ai: number; certified: number; arena: number };
type Milestone = { step: number; label: string; at: string | null };

export function growthReport(c: Sqlite, userId: string, course: Course | null) {
  const now = Date.now();
  const start = course ? Date.parse(cnDate(course.start_date)) : now - 16 * 7 * DAY;
  const end = course ? Date.parse(cnDate(course.end_date)) + DAY - 1 : now;
  const endAt = Math.min(end, now);
  const baseline = Math.min(start + 14 * DAY, endAt);
  const iso = (t: number) => new Date(t).toISOString();

  const prof = c.prepare("select u.account, p.name, p.class from users u join profiles p on p.id = u.id where u.id = ?").get(userId) as { account: string; name: string; class: string | null } | undefined;
  const pm = c.prepare("select p.id, p.name, (select count(*) from project_members m where m.project_id = p.id) members from project_members m join projects p on p.id = m.project_id where m.user_id = ? order by m.joined_at limit 1").get(userId) as { id: string; name: string; members: number } | undefined;

  // —— 过程性评价：按周 ——
  const weeks: Week[] = [];
  const nWeeks = Math.max(1, Math.ceil((endAt - start) / (7 * DAY)));
  const one = (sql: string, ...p: unknown[]) => Number((c.prepare(sql).get(...p) as { n: number } | undefined)?.n || 0);
  const certTables = ["track_profiles", "hmw_questions", "task_briefs", "product_versions", "evidence_items", "test_reports", "decisions"];
  for (let w = 0; w < Math.min(nWeeks, 30); w++) {
    const a = iso(start + w * 7 * DAY), b = iso(Math.min(start + (w + 1) * 7 * DAY, endAt + 1));
    weeks.push({
      week: w + 1, from: a.slice(0, 10),
      evidence: one("select count(*) n from evidence_events where user_id = ? and created_at >= ? and created_at < ?", userId, a, b),
      ai: one("select count(*) n from usage_logs where user_id = ? and created_at >= ? and created_at < ?", userId, a, b),
      certified: pm ? certTables.reduce((s, t) => s + one(`select count(*) n from ${t} where project_id = ? and status in ('certified','confirmed') and certified_at >= ? and certified_at < ?`, pm.id, a, b), 0) : 0,
      arena: one("select count(*) n from arena_events where user_id = ? and kind = 'evidence_reply' and created_at >= ? and created_at < ?", userId, a, b),
    });
  }
  const activeDays = one(`select count(distinct substr(datetime(created_at, '+8 hours'), 1, 10)) n from evidence_events where user_id = ? and created_at >= ? and created_at <= ?`, userId, iso(start), iso(endAt));

  // 8 步里程碑：每一步第一次达到完成条件的时间
  const firstCert = (t: string, offset = 0) => pm ? ((c.prepare(`select certified_at at from ${t} where project_id = ? and status in ('certified','confirmed') and certified_at is not null order by certified_at limit 1 offset ${offset}`).get(pm.id) as { at: string } | undefined)?.at || null) : null;
  const artifactAt = (kind: string) => pm ? ((c.prepare("select created_at at from project_artifacts where project_id = ? and kind = ? and status = 'certified' order by created_at limit 1").get(pm.id, kind) as { at: string } | undefined)?.at || null) : null;
  const later = (a: string | null, b: string | null) => (a && b ? (a > b ? a : b) : null);
  const stepAt = [firstCert("track_profiles"), firstCert("hmw_questions"), firstCert("task_briefs"), firstCert("product_versions"),
    later(firstCert("test_reports"), firstCert("evidence_items")), firstCert("product_versions", 1), artifactAt("pitch"), artifactAt("archive")];
  const milestones: Milestone[] = STEP_GUIDE.map((g, i) => ({ step: g.step, label: g.label, at: stepAt[i] }));
  const doneBy = (t: number) => milestones.filter((m) => m.at && Date.parse(m.at) <= t).length;

  // —— 增值性评价：基线 vs 现在 ——
  const abNow = pm ? computeAbilities(c, pm.id, iso(endAt)) : [];
  const abBase = pm ? computeAbilities(c, pm.id, iso(baseline)) : [];
  const abilities = abNow.map((a, i) => ({ key: a.key, label: a.label, base: abBase[i]?.count || 0, now: a.count, gain: a.count - (abBase[i]?.count || 0), basis: a.basis }));
  const rounds = c.prepare(
    `select s.round_no r, count(*) n, coalesce(sum(t.cites_evidence),0) cite from dialogue_turns t join challenge_sessions s on s.id = t.session_id
     where t.user_id = ? and t.speaker = 'student' and t.created_at >= ? and t.created_at <= ? group by s.round_no order by s.round_no`
  ).all(userId, iso(start), iso(endAt)) as { r: number; n: number; cite: number }[];
  const rate = (x?: { n: number; cite: number }) => (x && Number(x.n) ? Math.round((Number(x.cite) / Number(x.n)) * 1000) / 10 : null);
  const citeFirst = rate(rounds[0]), citeLast = rounds.length > 1 ? rate(rounds[rounds.length - 1]) : null;

  // —— 终结性评价 ——
  const prog = pm ? computeProgress(c, pm.id) : null;
  const verified = one("select count(distinct h.id) n from hypotheses h join arena_members m on m.match_id = h.match_id and m.team_id = h.team_id where m.user_id = ? and h.status = 'verified'", userId);
  const comment = course ? (c.prepare("select comment, updated_at from student_comments where user_id = ? and course_id = ?").get(userId, course.id) as { comment: string; updated_at: string } | undefined) || null : null;

  return {
    student: { id: userId, account: prof?.account || "", name: prof?.name || "", class: prof?.class || "" },
    course: course ? { id: course.id, name: course.name, term: course.term, start: course.start_date, end: course.end_date } : null,
    window: { start: iso(start), end: iso(endAt), baseline: iso(baseline), finished: end <= now },
    project: pm ? { id: pm.id, name: pm.name, members: Number(pm.members) } : null,
    process: { weeks, activeDays, milestones, totals: weeks.reduce((s, w) => ({ evidence: s.evidence + w.evidence, ai: s.ai + w.ai, certified: s.certified + w.certified, arena: s.arena + w.arena }), { evidence: 0, ai: 0, certified: 0, arena: 0 }) },
    valueAdded: { stepsBase: doneBy(baseline), stepsNow: doneBy(endAt), abilities, citeFirst, citeLast, rounds: rounds.length },
    summative: {
      stepsDone: prog?.done || 0, steps: prog?.steps.map((s) => ({ step: s.step, label: s.label, status: s.status })) || [],
      verified, pitch: !!stepAt[6], archive: !!stepAt[7], abilities: abNow.map((a) => ({ key: a.key, label: a.label, count: a.count, score: a.score })),
      comment: comment?.comment || "", commentAt: comment?.updated_at || null,
    },
  };
}

/** 列表用的简要指标（不含逐周明细） */
export function growthSummary(c: Sqlite, userId: string, course: Course | null) {
  const r = growthReport(c, userId, course);
  return {
    id: userId, account: r.student.account, name: r.student.name, class: r.student.class,
    project: r.project?.name || "", activeDays: r.process.activeDays, evidence: r.process.totals.evidence,
    stepsBase: r.valueAdded.stepsBase, stepsNow: r.valueAdded.stepsNow,
    gain: r.valueAdded.abilities.reduce((s, a) => s + a.gain, 0), abilities: r.summative.abilities.reduce((s, a) => s + a.count, 0),
    citeFirst: r.valueAdded.citeFirst, citeLast: r.valueAdded.citeLast, hasComment: !!r.summative.comment,
  };
}

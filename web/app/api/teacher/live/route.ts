import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { isTeacherSync, parseJson } from "@/lib/ontology/engine";
import { computeProgress } from "@/lib/ontology/progress";
import { computeAbilities } from "@/lib/ontology/abilities";
import { cnDayStartIso } from "@/lib/ontology/actions/draft";
import { classScope, scopeClassOptions } from "@/lib/classes";
import { LESSON_MARKS } from "@/lib/course";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mark = { key: string; label: string; at: string };

/**
 * 授课工作台（上课投屏用）：所选班级的席位、今日在线、项目进度分布、五力班级均值、本节课打点、进行中的对局。
 * 只返回席位号与虚拟头像序号，不返回学生姓名或学号。全部统计来自数据库真实记录。
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const c = sqlite();
  if (!isTeacherSync(c, user.id)) return NextResponse.json({ error: "仅教师可用" }, { status: 403 });
  const scope = classScope(c, user.id);
  const options = scopeClassOptions(c, scope);
  const url = new URL(req.url);
  const pick = url.searchParams.get("class") || options[0] || "";
  if (pick && !scope.all && !scope.classes.includes(pick)) return NextResponse.json({ error: "这不是你的班级" }, { status: 403 });

  const today = cnDayStartIso();
  const students = (pick
    ? c.prepare("select u.id, u.last_login_at from users u join profiles p on p.id = u.id where p.role = 'student' and p.class = ? and u.disabled = 0 order by u.account").all(pick)
    : []) as { id: string; last_login_at: string | null }[];
  const ids = students.map((s) => s.id);
  const inList = ids.map(() => "?").join(",");
  const countBy = (sql: string, ...extra: unknown[]): Record<string, number> => {
    if (!ids.length) return {};
    const rows = c.prepare(sql.replace("$IN", inList)).all(...ids, ...extra) as { user_id: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.user_id, Number(r.n)]));
  };
  const evToday = countBy("select user_id, count(*) n from evidence_events where user_id in ($IN) and created_at >= ? group by user_id", today);
  const askToday = countBy("select user_id, count(*) n from usage_logs where user_id in ($IN) and created_at >= ? group by user_id", today);
  const openCards = countBy("select user_id, count(*) n from intervention_cards where user_id in ($IN) and status = 'open' group by user_id");
  const inArena = countBy("select m.user_id, count(*) n from arena_members m join arena_matches a on a.id = m.match_id where m.user_id in ($IN) and a.status <> 'ended' group by m.user_id");
  // 每名学生所在的第一个项目（加入最早的那个）
  const projOf: Record<string, string> = {};
  if (ids.length) for (const r of c.prepare(`select user_id, project_id from project_members where user_id in (${inList}) order by rowid`).all(...ids) as { user_id: string; project_id: string }[]) projOf[r.user_id] ||= r.project_id;
  const progressCache: Record<string, { done: number; current: number; steps: string[]; blockers: number }> = {};
  const prog = (pid?: string) => {
    if (!pid) return { done: 0, current: 0, steps: [] as string[], blockers: 0 };
    if (!progressCache[pid]) { const p = computeProgress(c, pid); progressCache[pid] = { done: p.done, current: p.current, steps: p.steps.map((s) => s.status), blockers: p.blockers.length }; }
    return progressCache[pid];
  };

  const seats = students.map((s, i) => {
    const p = prog(projOf[s.id]);
    return {
      seat: i + 1, avatar: i % 20,
      online: !!s.last_login_at && s.last_login_at >= today,
      hasProject: !!projOf[s.id], done: p.done, current: p.current,
      evidenceToday: evToday[s.id] || 0, aiToday: askToday[s.id] || 0, openCards: openCards[s.id] || 0, inArena: !!inArena[s.id],
    };
  });

  const projectIds = [...new Set(Object.values(projOf))];
  // 园区视图：每个项目团队一块平台（只给项目名与席位号，不给学生姓名）
  const pname = (id: string) => (c.prepare("select name from projects where id = ?").get(id) as { name: string } | undefined)?.name || "未命名项目";
  const teams = projectIds.map((pid) => {
    const mem = seats.filter((s, i) => projOf[students[i].id] === pid);
    const p = prog(pid);
    return {
      id: pid, name: pname(pid), seats: mem.map((m) => m.seat), avatars: mem.map((m) => m.avatar),
      done: p.done, current: p.current, steps: p.steps, blockers: p.blockers,
      active: mem.some((m) => m.evidenceToday > 0 || m.aiToday > 0 || m.inArena), online: mem.filter((m) => m.online).length,
    };
  });
  const loners = seats.filter((s) => !s.hasProject).map((s) => s.seat);
  const stepDist = Array.from({ length: 9 }, (_, k) => projectIds.filter((pid) => prog(pid).done === k).length);
  const abilitySum: Record<string, { label: string; total: number }> = {};
  for (const pid of projectIds) for (const a of computeAbilities(c, pid)) (abilitySum[a.key] ||= { label: a.label, total: 0 }).total += a.count;
  const abilities = Object.entries(abilitySum).map(([key, v]) => ({ key, label: v.label, avg: projectIds.length ? Math.round((v.total / projectIds.length) * 10) / 10 : 0 }));

  const lessonRow = c.prepare("select * from lesson_sessions where teacher_id = ? and ended_at is null order by started_at desc limit 1").get(user.id) as Record<string, unknown> | undefined;
  const lesson = lessonRow ? { id: String(lessonRow.id), class: String(lessonRow.class), unit_no: Number(lessonRow.unit_no), started_at: String(lessonRow.started_at), match_id: (lessonRow.match_id as string) || null, marks: parseJson<Mark[]>(lessonRow.marks, []) } : null;
  const match = c.prepare("select id, title, status, round_no, rounds, join_code from arena_matches where teacher_id = ? and status <> 'ended' order by created_at desc limit 1").get(user.id) as Record<string, unknown> | undefined;
  const arena = match ? {
    id: String(match.id), title: String(match.title), status: String(match.status), round: Number(match.round_no), rounds: Number(match.rounds), code: String(match.join_code),
    turns: Number((c.prepare("select count(*) n from arena_events where match_id = ? and kind = 'turn'").get(match.id) as { n: number }).n),
    evidence: Number((c.prepare("select count(*) n from arena_events where match_id = ? and kind = 'evidence_reply'").get(match.id) as { n: number }).n),
    verifying: Number((c.prepare("select count(*) n from hypotheses where match_id = ? and status = 'verifying'").get(match.id) as { n: number }).n),
  } : null;

  return NextResponse.json({
    classes: options, pick, seats, teams, loners, lesson, arena, stepDist, abilities,
    summary: {
      size: seats.length, online: seats.filter((s) => s.online).length, withProject: seats.filter((s) => s.hasProject).length,
      projects: projectIds.length, evidenceToday: seats.reduce((n, s) => n + s.evidenceToday, 0), aiToday: seats.reduce((n, s) => n + s.aiToday, 0),
      openCards: seats.reduce((n, s) => n + s.openCards, 0),
    },
    now: new Date().toISOString(),
  });
}

/** 上课 / 打点 / 下课 / 绑定对局 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const c = sqlite();
  if (!isTeacherSync(c, user.id)) return NextResponse.json({ error: "仅教师可用" }, { status: 403 });
  let b: { action?: string; id?: string; class?: string; unit_no?: number; key?: string; match_id?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const own = (id?: string) => c.prepare("select * from lesson_sessions where id = ? and teacher_id = ?").get(id || "", user.id) as Record<string, unknown> | undefined;

  if (b.action === "start") {
    const scope = classScope(c, user.id);
    const klass = String(b.class || "").slice(0, 60);
    if (klass && !scope.all && !scope.classes.includes(klass)) return NextResponse.json({ error: "这不是你的班级" }, { status: 403 });
    const unit = Math.min(8, Math.max(1, Math.round(Number(b.unit_no) || 1)));
    c.prepare("update lesson_sessions set ended_at = ? where teacher_id = ? and ended_at is null").run(new Date().toISOString(), user.id);
    const first: Mark[] = [{ key: "intro", label: "课程导入", at: new Date().toISOString() }];
    const r = c.prepare("insert into lesson_sessions (teacher_id, class, unit_no, marks) values (?, ?, ?, ?) returning id").get(user.id, klass, unit, JSON.stringify(first)) as { id: string };
    return NextResponse.json({ ok: true, id: r.id });
  }
  const row = own(b.id);
  if (!row) return NextResponse.json({ error: "授课记录不存在" }, { status: 404 });
  if (row.ended_at && b.action !== "export") return NextResponse.json({ error: "这节课已结束" }, { status: 409 });
  if (b.action === "mark") {
    const m = LESSON_MARKS.find((x) => x.key === b.key);
    if (!m) return NextResponse.json({ error: "未知的教学环节" }, { status: 400 });
    const marks = parseJson<Mark[]>(row.marks, []);
    if (marks.length >= 60) return NextResponse.json({ error: "打点过多" }, { status: 400 });
    marks.push({ key: m.key, label: m.label, at: new Date().toISOString() });
    c.prepare("update lesson_sessions set marks = ? where id = ?").run(JSON.stringify(marks), row.id);
    return NextResponse.json({ ok: true, marks });
  }
  if (b.action === "bind_match") {
    const m = c.prepare("select 1 from arena_matches where id = ? and teacher_id = ?").get(b.match_id || "", user.id);
    if (!m) return NextResponse.json({ error: "对局不存在" }, { status: 404 });
    c.prepare("update lesson_sessions set match_id = ? where id = ?").run(b.match_id, row.id);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "end") {
    c.prepare("update lesson_sessions set ended_at = ? where id = ?").run(new Date().toISOString(), row.id);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}

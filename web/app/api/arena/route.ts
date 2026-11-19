import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db, sqlite } from "@/lib/db";
import { isTeacher, memberTeam } from "@/lib/arena";
import { actionResponse } from "@/lib/ontology/http";

export const runtime = "nodejs";

type Match = { id: string; teacher_id: string; title: string; scenario: string; status: string; round_no: number; rounds: number; round_minutes: number; round_ends_at: string | null; join_code: string; created_at: string };

/** 学生端不下发对局码（入队必须看大屏） */
const hideCode = (m: Match): Omit<Match, "join_code"> => { const c = { ...m } as Partial<Match>; delete c.join_code; return c as Omit<Match, "join_code">; };

/** 各队总分：在数据库里分组求和（学生端每 10 秒轮询一次，不再拉取全场事件明细） */
function teamScores(matchId: string) {
  const rows = sqlite()
    .prepare("select team_id, coalesce(sum(points), 0) pts from arena_events where match_id = ? and team_id is not null group by team_id")
    .all(matchId) as { team_id: string; pts: number }[];
  const m: Record<string, number> = {};
  for (const r of rows) m[r.team_id] = Number(r.pts);
  return m;
}

/** 对局状态：教师看自己开的局；学生看可加入的局与自己所在的队 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const admin = db();
  const teacher = await isTeacher(admin, user.id);
  const id = new URL(req.url).searchParams.get("id");

  let matches: Match[] = [];
  if (teacher) {
    const { data } = await admin.from("arena_matches").select("*").eq("teacher_id", user.id).order("created_at", { ascending: false }).limit(20);
    matches = (data || []) as Match[];
  } else {
    const { data } = await admin.from("arena_matches").select("*").in("status", ["lobby", "running"]).order("created_at", { ascending: false }).limit(20);
    matches = (data || []) as Match[];
  }

  // 学生：自动定位到自己已加入的局
  let matchId = id;
  if (!matchId && !teacher) {
    const { data: mem } = await admin.from("arena_members").select("match_id, joined_at").eq("user_id", user.id).order("joined_at", { ascending: false }).limit(5);
    const live = new Set(matches.map((m) => m.id));
    matchId = (mem || []).find((x) => live.has(x.match_id))?.match_id || null;
  }
  if (!matchId) return NextResponse.json({ teacher, matches: matches.map(({ join_code, ...m }) => (teacher ? { ...m, join_code } : m)) });

  const { data: match } = await admin.from("arena_matches").select("*").eq("id", matchId).maybeSingle();
  if (!match) return NextResponse.json({ error: "对局不存在" }, { status: 404 });
  const { data: teams } = await admin.from("arena_teams").select("id, team_code, name, venture, sort").eq("match_id", matchId).order("sort");
  const { data: mems } = await admin.from("arena_members").select("team_id, user_id, seat").eq("match_id", matchId);
  const counts: Record<string, number> = {};
  for (const r of mems || []) counts[r.team_id] = (counts[r.team_id] || 0) + 1;
  const scores = teamScores(matchId);
  const myTeam = await memberTeam(admin, matchId, user.id);
  const mySeat = (mems || []).find((m) => m.user_id === user.id)?.seat ?? 0;

  let hypotheses: unknown[] = [];
  if (myTeam) {
    const { data } = await admin.from("hypotheses").select("*").eq("team_id", myTeam.id).order("created_at", { ascending: false });
    hypotheses = data || [];
  }
  const out = { ...(match as Match) } as Partial<Match>;
  if (!(teacher && match.teacher_id === user.id)) delete out.join_code;
  return NextResponse.json({
    teacher, matches: teacher ? matches : matches.map(hideCode),
    match: out,
    teams: (teams || []).map((t) => ({ ...t, members: counts[t.id] || 0, score: scores[t.id] || 0 })),
    myTeam, mySeat, hypotheses,
  });
}

/** 对局操作：开局 / 轮次控制 / 改队名（教师）；入队 / 填写微企业 / 绑定本队项目（学生）。规则见 lib/ontology/actions/arena.ts */
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const action = String(b.action || "");
  if (action === "create") return actionResponse("arena.create", b);
  if (["start", "next", "end", "reopen"].includes(action)) return actionResponse("arena.control", { ...b, op: action });
  if (action === "rename_team") return actionResponse("arena.rename_team", b);
  if (action === "join") return actionResponse("arena.join", b);
  if (action === "venture") return actionResponse("arena.venture", b);
  if (action === "bind_project") return actionResponse("arena.bind_project", b);
  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}

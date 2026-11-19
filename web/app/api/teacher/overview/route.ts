import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { isTeacherSync } from "@/lib/ontology/engine";
import { computeProgress } from "@/lib/ontology/progress";
import { computeAbilities } from "@/lib/ontology/abilities";
import { STEP_GUIDE } from "@/lib/ontology/pipeline";
import { classScope, projectClassFilter, scopeClassOptions } from "@/lib/classes";
import { draftCardFromBlocker, draftCardForStep, preReviewVerification } from "@/lib/ontology/guide";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 教师工作台总览：全部项目的 8 步进度与卡点、待确认的现实验证数量。
 * 只返回项目名、对局队名与人数，不返回学生姓名或账号。
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const c = sqlite();
  if (!isTeacherSync(c, user.id)) return NextResponse.json({ error: "仅教师可看" }, { status: 403 });
  const scope = classScope(c, user.id);
  const pick = new URL(req.url).searchParams.get("class") || "";
  const [cf, cp] = projectClassFilter(scope, pick);
  const projects = c.prepare(
    `select p.id, p.name, p.updated_at, (select count(*) from project_members m where m.project_id = p.id) members,
            (select group_concat(t.name, '、') from arena_teams t join arena_matches a on a.id = t.match_id
              where t.project_id = p.id and a.status <> 'ended') teams
     from projects p where exists (select 1 from project_members m where m.project_id = p.id) and ${cf}
     order by p.updated_at desc limit 200`
  ).all(...cp) as { id: string; name: string; updated_at: string; members: number; teams: string | null }[];
  const items = projects.map((p) => {
    const pr = computeProgress(c, p.id);
    const g = STEP_GUIDE[pr.current - 1];
    // 干预卡草稿：有卡点按卡点起草；没有卡点但未完成，按当前步骤起草
    const drafts = pr.blockers.length
      ? pr.blockers.filter((b) => b.key !== "verifying").map((b) => draftCardFromBlocker(b, p.name))
      : pr.done < 8 ? [draftCardForStep(pr.current, g.label, g.doneWhen, p.name)] : [];
    return {
      id: p.id, name: p.name, members: Number(p.members), teams: p.teams || "", updated_at: p.updated_at,
      steps: pr.steps.map((s) => s.status), current: pr.current, done: pr.done, blockers: pr.blockers,
      abilities: computeAbilities(c, p.id).map((a) => ({ key: a.key, label: a.label, score: a.score, count: a.count })),
      drafts,
    };
  });
  // 待确认的现实验证（本人开的局）+ 自动预审（规则判断，最终由教师确认）
  const pending = c.prepare(
    `select h.id, h.text, h.evidence, h.evidence_url, h.created_at, t.name team from hypotheses h
     join arena_matches a on a.id = h.match_id left join arena_teams t on t.id = h.team_id
     where h.status = 'verifying' and a.teacher_id = ? order by h.updated_at desc limit 50`
  ).all(user.id) as { id: string; text: string; evidence: string; evidence_url: string; created_at: string; team: string | null }[];
  const verifyingItems = pending.map((h) => ({ ...h, team: h.team || "", prereview: preReviewVerification(h.evidence) }));
  return NextResponse.json({ items, verifying: verifyingItems.length, verifyingItems, classes: scopeClassOptions(c, scope), scopedToOwn: !scope.all, pick });
}

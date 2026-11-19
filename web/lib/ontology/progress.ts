import "server-only";
import type { Sqlite } from "@/lib/db";
import { STEP_GUIDE, type StepStatus } from "./pipeline";

/**
 * 产品线 8 步进度：完全由本体里的真实记录自动判定，不能手动勾选。
 *   done  = 达到完成条件（已认证对象）
 *   doing = 已有草稿或部分对象，但未达到完成条件
 *   todo  = 还没有任何相关对象
 *   soon  = 功能即将上线（目前没有）
 * 卡点：提醒学生和教师当前卡在哪里（全部来自数据库记录）。
 */

export type StepState = { step: number; key: string; label: string; status: StepStatus; certified: number; draft: number };
export type Artifact = { id: string; kind: string; title: string; status: string; created_at: string };
export type Progress = { steps: StepState[]; current: number; done: number; blockers: { key: string; text: string; n: number }[]; artifacts: Artifact[] };

const ok = "status in ('certified','confirmed')";
const live = "status <> 'rejected'";

function n(c: Sqlite, sql: string, ...p: unknown[]): number {
  return Number((c.prepare(sql).get(...p) as { n: number } | undefined)?.n || 0);
}

export function computeProgress(c: Sqlite, projectId: string): Progress {
  const cnt = (table: string, cond: string) => n(c, `select count(*) n from ${table} where project_id = ? and ${cond}`, projectId);
  const pair = (table: string) => ({ certified: cnt(table, ok), draft: cnt(table, "status = 'draft'") });
  const any = (table: string) => cnt(table, live);

  const track = pair("track_profiles"), hmw = pair("hmw_questions"), brief = pair("task_briefs");
  const versions = pair("product_versions"), report = pair("test_reports"), ev = pair("evidence_items"), dec = pair("decisions");
  const st = (done: boolean, started: boolean): StepStatus => (done ? "done" : started ? "doing" : "todo");

  const states: Omit<StepState, "key" | "label">[] = [
    { step: 1, status: st(track.certified >= 1, any("track_profiles") > 0), ...track },
    { step: 2, status: st(hmw.certified >= 1, any("hmw_questions") > 0), ...hmw },
    { step: 3, status: st(brief.certified >= 1, any("task_briefs") > 0), ...brief },
    { step: 4, status: st(versions.certified >= 1, any("product_versions") > 0), certified: Math.min(versions.certified, 1), draft: versions.certified ? 0 : versions.draft },
    {
      step: 5, status: st(report.certified >= 1 && ev.certified >= 1, any("test_reports") + any("evidence_items") > 0),
      certified: report.certified + ev.certified, draft: report.draft + ev.draft,
    },
    {
      step: 6, status: st(versions.certified >= 2, dec.certified + dec.draft > 0 || (versions.certified >= 1 && versions.draft > 0)),
      certified: dec.certified + Math.max(0, versions.certified - 1), draft: dec.draft + (versions.certified >= 1 ? versions.draft : 0),
    },
    {
      step: 7, status: st(cnt("project_artifacts", "kind = 'pitch' and status = 'certified'") >= 1, cnt("project_artifacts", "kind = 'pitch' and status = 'draft'") > 0),
      certified: cnt("project_artifacts", "kind = 'pitch' and status = 'certified'"), draft: cnt("project_artifacts", "kind = 'pitch' and status = 'draft'"),
    },
    {
      step: 8, status: st(cnt("project_artifacts", "kind = 'archive' and status = 'certified'") >= 1, false),
      certified: cnt("project_artifacts", "kind = 'archive' and status = 'certified'"), draft: 0,
    },
  ];
  const steps: StepState[] = states.map((s) => {
    const g = STEP_GUIDE[s.step - 1];
    return { ...s, key: g.key, label: g.label };
  });
  const firstOpen = steps.find((s) => s.status !== "done" && s.status !== "soon");
  // 全部完成时停在第 8 步（不会越界到不存在的第 9 步）
  const current = firstOpen ? firstOpen.step : Math.min(steps.length, steps.filter((s) => s.status === "done").length + 1);

  // —— 卡点 ——
  const blockers: Progress["blockers"] = [];
  const push = (key: string, k: number, text: string) => { if (k > 0) blockers.push({ key, n: k, text }); };
  push("verifying", n(c, "select count(*) n from hypotheses where project_id = ? and status = 'verifying'", projectId), "条现实验证等待教师确认");
  push("decision_no_evidence", n(c,
    `select count(*) n from decisions d where d.project_id = ? and d.status = 'draft'
     and not exists (select 1 from onto_links l where l.link_type = 'cites' and l.src_type = 'decision' and l.src_id = d.id)`, projectId), "条决策还没挂证据，无法认证");
  push("glossary_conflict", n(c, "select count(*) n from glossary_terms where project_id = ? and conflicts <> '[]' and status <> 'rejected'", projectId), "个术语口径不一致");
  const old = new Date(Date.now() - 3 * 86400_000).toISOString();
  let stale = 0;
  for (const t of ["track_profiles", "hmw_questions", "task_briefs", "product_versions", "evidence_items", "test_reports", "decisions"]) {
    stale += n(c, `select count(*) n from ${t} where project_id = ? and status = 'draft' and created_at < ?`, projectId, old);
  }
  push("stale_drafts", stale, "条草稿超过 3 天未认证");
  push("quote_missing", n(c, "select count(*) n from evidence_items where project_id = ? and status = 'draft' and json_extract(source, '$.quote_removed') = 1", projectId), "条 AI 草稿的原话在资料中找不到，需要核实");

  const artifacts = c.prepare("select id, kind, title, status, created_at from project_artifacts where project_id = ? and status <> 'rejected' order by created_at desc limit 10").all(projectId) as Artifact[];
  return { steps, current, done: steps.filter((s) => s.status === "done").length, blockers, artifacts };
}

/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/db-client";

export const runtime = "nodejs";

type ExportRow = Record<string, unknown>;

// 匿名导出论文所需的过程数据；未同意科研使用者不进入 research_* 数据集。
export async function GET() {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "无管理员权限" }, { status: 403 });
  const admin = createAdminClient();
  const safe = async (table: string, columns = "*") => {
    try {
      const { data, error } = await admin.from(table).select(columns).limit(20000);
      return error ? [] : (data || []) as unknown as ExportRow[];
    } catch { return []; }
  };
  const profiles = await safe("profiles", "id,student_no,name,class,role,country,native_lang,hsk_level,research_consent,research_pid,created_at");
  const eligible = profiles.filter((p) => p.role === "student" && p.research_consent === true);
  const pid = new Map(eligible.map((p, i: number) => [p.id, p.research_pid || `S${String(i + 1).padStart(3, "0")}`]));
  const anonymize = (rows: ExportRow[]) => rows.map((r) => {
    const { user_id, from_user_id, ratee_user_id, ...rest } = r;
    const id = user_id || from_user_id || ratee_user_id;
    return { ...rest, research_pid: pid.get(id) || null };
  }).filter((r) => r.research_pid);
  const [sessions, turns, plans, ratings, peer, usage, evidence, projects, experimentRuns, experimentParticipants, experimentEvents] = await Promise.all([
    safe("challenge_sessions"), safe("dialogue_turns"), safe("plan_versions"), safe("ct_ratings"),
    safe("peer_feedback"), safe("usage_logs"), safe("evidence_events"), safe("projects"),
    safe("experiment_runs"), safe("experiment_participants"), safe("experiment_events"),
  ]);
  const students = eligible.map((p) => ({ research_pid: pid.get(p.id), class: p.class || "", country: p.country || "", native_lang: p.native_lang || "", hsk_level: p.hsk_level ?? null, created_at: p.created_at }));
  return NextResponse.json({
    exported_at: new Date().toISOString(),
    schema_version: "research-export-1",
    students,
    challenge_sessions: anonymize(sessions),
    dialogue_turns: anonymize(turns),
    plan_versions: anonymize(plans),
    ct_ratings: anonymize(ratings),
    peer_feedback: anonymize(peer),
    usage_logs: anonymize(usage),
    evidence_events: anonymize(evidence),
    projects: anonymize(projects),
    experiment_runs: experimentRuns.map(({ created_by, ...r }) => r),
    experiment_participants: experimentParticipants.filter((r) => r.consent === true).map((r, i) => ({ experiment_pid: `E${String(i + 1).padStart(3, "0")}`, run_id: r.run_id, cohort: r.cohort, consent: true, stage: r.stage, created_at: r.created_at })),
    experiment_events: experimentEvents.filter((e) => experimentParticipants.some((p) => p.id === e.participant_id && p.consent === true)).map(({ id, participant_id, ...r }) => ({ ...r, experiment_pid: `E${String((experimentParticipants.findIndex((p) => p.id === participant_id)) + 1).padStart(3, "0")}` })),
  });
}

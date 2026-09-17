import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { query } from "@/lib/db";
import { reportResponse, flatten } from "@/lib/report-export";
import { createHash } from "node:crypto";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
const stable = (id: unknown) =>
  "S-" +
  createHash("sha256")
    .update("cxcy-research-v2:" + String(id))
    .digest("hex")
    .slice(0, 20);
export async function GET(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "无管理员权限" }, { status: 403 });
  try {
    const safe = async (table: string, columns = "*") =>
      (await query("select " + columns + " from " + table)).rows as Row[];
    const profiles = await safe(
      "profiles",
      "id,role,class,country,native_lang,hsk_level,research_consent,research_pid,created_at",
    );
    const eligible = profiles.filter(
      (p) => p.role === "student" && p.research_consent === true,
    );
    const pid = new Map(eligible.map((p) => [p.id, stable(p.id)]));
    const anonymize = (rows: Row[]) =>
      rows
        .map((r) => {
          const { user_id, from_user_id, ratee_user_id, ...rest } = r;
          const id = user_id || from_user_id || ratee_user_id;
          return { ...rest, research_pid: pid.get(id) || null };
        })
        .filter((r) => r.research_pid);
    const [
      sessions,
      turns,
      plans,
      ratings,
      peer,
      usage,
      evidence,
      projects,
      runs,
      participants,
      events,
      learningSessions,
      learningRecords,
    ] = await Promise.all([
      safe("challenge_sessions"),
      safe("dialogue_turns"),
      safe("plan_versions"),
      safe("ct_ratings"),
      safe("peer_feedback"),
      safe("usage_logs"),
      safe("evidence_events"),
      safe("projects"),
      safe("experiment_runs"),
      safe("experiment_participants"),
      safe("experiment_events"),
      safe("learning_sessions"),
      safe("learning_records"),
    ]);
    const exp = new Map(
      participants
        .filter((p) => p.consent === true)
        .map((p) => [p.id, p.participant_code]),
    );
    const ls = new Map(
      learningSessions
        .filter((s) => pid.has(s.user_id))
        .map((s) => [s.id, { pid: pid.get(s.user_id), module: s.module }]),
    );
    const data: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      schema_version: "research-export-2",
      note: "结构化身份字段已去除；自由文本中学生自行输入的个人信息需发布前人工复核。历史问卷不能按序号或IP自动配对；未完成不计0分。",
      students: eligible.map((p) => ({
        research_pid: pid.get(p.id),
        class: p.class,
        country: p.country,
        native_lang: p.native_lang,
        hsk_level: p.hsk_level,
        created_at: p.created_at,
      })),
      challenge_sessions: anonymize(sessions),
      dialogue_turns: anonymize(turns),
      plan_versions: anonymize(plans),
      ct_ratings: anonymize(ratings),
      peer_feedback: anonymize(peer),
      usage_logs: anonymize(usage),
      evidence_events: anonymize(evidence),
      projects: anonymize(projects),
      experiment_runs: runs.map((r) => ({
        id: r.id,
        title: r.title,
        protocol_version: r.protocol_version,
        status: r.status,
        starts_at: r.starts_at,
      })),
      experiment_participants: participants
        .filter((p) => exp.has(p.id))
        .map((p) => ({
          experiment_pid: exp.get(p.id),
          run_id: p.run_id,
          cohort: p.cohort,
          stage: p.stage,
          consent: true,
          created_at: p.created_at,
        })),
      experiment_events: events
        .filter((e) => exp.has(e.participant_id))
        .map((e) => ({
          id: e.id,
          experiment_pid: exp.get(e.participant_id),
          run_id: e.run_id,
          stage: e.stage,
          event_type: e.event_type,
          payload: e.payload,
          created_at: e.created_at,
        })),
      learning_sessions: learningSessions
        .filter((s) => ls.has(s.id))
        .map((s) => ({
          id: s.id,
          research_pid: ls.get(s.id)?.pid,
          module: s.module,
          title: s.title,
          created_at: s.created_at,
          updated_at: s.updated_at,
        })),
      learning_records: learningRecords
        .filter((r) => ls.has(r.session_id))
        .map((r) => ({
          ...r,
          research_pid: ls.get(r.session_id)?.pid,
          module: ls.get(r.session_id)?.module,
        })),
    };
    const format = new URL(req.url).searchParams.get("format");
    if (format) {
      const rows = Object.entries(data)
        .filter(([, v]) => Array.isArray(v))
        .flatMap(([table, rows]) =>
          (rows as Row[]).map((row) => ({ table, ...flatten(row) })),
        );
      return await reportResponse(
        {
          title: "双创研究数据",
          metadata: {
            schema_version: data.schema_version,
            exported_at: data.exported_at,
            note: data.note,
          },
          rows,
        },
        format,
      );
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "Research export failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      {
        error:
          "研究数据读取或导出失败，请确认数据库迁移及中文字体。不会将缺失数据伪装为空表。",
      },
      { status: 503 },
    );
  }
}

import { requireAdmin } from "@/lib/admin";
import { query } from "@/lib/db";
import { reportResponse } from "@/lib/report-export";
import { summarize, type ExpEvent } from "@/lib/experiment-protocol";
import { scenarioFor } from "@/lib/experiment-scenarios";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const u = await requireAdmin();
  if (!u)
    return Response.json({ error: "需要教师或管理员权限" }, { status: 403 });
  const url = new URL(req.url);
  const runId = url.searchParams.get("runId");
  const format = url.searchParams.get("format");
  const sessionId = url.searchParams.get("sessionId");
  try {
    if (sessionId) {
      const s = (
        await query(
          "select s.*,u.student_no from learning_sessions s join users u on u.id=s.user_id where s.id=$1",
          [sessionId],
        )
      ).rows[0];
      if (!s) return Response.json({ error: "记录不存在" }, { status: 404 });
      const rows = (
        await query(
          "select id,role,content,metadata,created_at from learning_records where session_id=$1 order by id",
          [sessionId],
        )
      ).rows;
      return format
        ? await reportResponse(
            {
              title: s.title,
              metadata: {
                session_id: s.id,
                module: s.module,
                student_no: s.student_no,
                exported_at: new Date().toISOString(),
              },
              rows,
            },
            format,
          )
        : Response.json({ session: s, records: rows });
    }
    if (runId) {
      const run = (
        await query(
          "select * from experiment_runs where id=$1 and (created_by=$2 or $3='admin')",
          [runId, u.id, u.role],
        )
      ).rows[0];
      if (!run)
        return Response.json(
          { error: "实验不存在或无管理权限" },
          { status: 404 },
        );
      const participants = (
        await query<{
          id: string;
          participant_code: string;
          student_no: string | null;
          cohort: string;
          stage: string;
          consent: boolean;
          created_at: string;
        }>(
          "select p.id,p.participant_code,u.student_no,p.cohort,p.stage,p.consent,p.created_at from experiment_participants p left join users u on u.id=p.user_id where p.run_id=$1 order by p.created_at,p.id",
          [runId],
        )
      ).rows;
      const events = (
        await query<ExpEvent & { participant_id: string }>(
          "select id,participant_id,event_type,stage,payload,created_at from experiment_events where run_id=$1 order by id",
          [runId],
        )
      ).rows;
      const summaries = participants.map((p) => ({
        ...p,
        ...summarize(events.filter((e) => e.participant_id === p.id)),
      }));
      if (format) {
        const stage = url.searchParams.get("stage");
        const participantId = url.searchParams.get("participantId");
        const byId = new Map(
          participants
            .filter(
              (p) => p.consent && (!participantId || p.id === participantId),
            )
            .map((p) => [p.id, p]),
        );
        const rows = events
          .filter(
            (e) => byId.has(e.participant_id) && (!stage || e.stage === stage),
          )
          .map(({ participant_id, ...e }) => ({
            ...e,
            participant_code: byId.get(participant_id)?.participant_code,
            cohort: byId.get(participant_id)?.cohort,
          }));
        const drafts = (
          await query(
            "select participant_id,stage,payload,updated_at from experiment_drafts where participant_id in (select id from experiment_participants where run_id=$1 and consent=true)",
            [runId],
          )
        ).rows
          .filter(
            (d) => byId.has(d.participant_id) && (!stage || d.stage === stage),
          )
          .map(({ participant_id, ...d }) => ({
            ...d,
            event_type: "draft",
            participant_code: byId.get(participant_id)?.participant_code,
          }));
        return await reportResponse(
          {
            title: run.title,
            metadata: {
              run_id: runId,
              protocol: run.protocol_version,
              scenario: scenarioFor(run.scenario),
              exported_at: new Date().toISOString(),
              note: "稳定编号配对；未完成不记0分；完成率不代表能力提升；正文可能含学生自行输入的个人信息",
            },
            rows: [
              ...summaries
                .filter((p) => byId.has(p.id))
                .map((p) => ({
                  participant_code: p.participant_code,
                  cohort: p.cohort,
                  stage: p.stage,
                  paired: p.paired,
                  completed: p.completed,
                  answers: p.answers,
                  skipped: p.skipped,
                  help: p.help,
                  abilityScore: null,
                  record_type: "participant_summary",
                })),
              ...rows,
              ...drafts,
            ],
          },
          format,
        );
      }
      return Response.json({ run, participants: summaries, events });
    }
    const userId = url.searchParams.get("userId") || null;
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const runs = (
      await query(
        "select r.*, (select count(*)::int from experiment_participants p where p.run_id=r.id) as participants from experiment_runs r where (created_by=$1 or $2='admin') and ($3::uuid is null or exists(select 1 from experiment_participants ep where ep.run_id=r.id and ep.user_id=$3)) order by created_at desc",
        [u.id, u.role, userId],
      )
    ).rows;
    const sessions = (
      await query(
        "select s.*,u.student_no from learning_sessions s join users u on u.id=s.user_id where ($2::uuid is null or s.user_id=$2) order by s.updated_at desc,s.id limit 101 offset $1",
        [offset, userId],
      )
    ).rows;
    return Response.json({
      runs,
      sessions: sessions.slice(0, 100),
      hasMore: sessions.length > 100,
    });
  } catch (e) {
    return Response.json(
      {
        error:
          format && e instanceof Error ? e.message : "后台记录读取失败，请重试",
      },
      { status: 503 },
    );
  }
}

import { requireAdmin } from "@/lib/admin";
import { query } from "@/lib/db";
import { reportResponse } from "@/lib/report-export";
import { summarize, type ExpEvent } from "@/lib/experiment-protocol";
import {
  learningReport,
  experimentReport,
  type ExportRun,
  type ExportEvent,
} from "@/lib/experiment-report";
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
        ? await reportResponse(learningReport(s, rows, s.student_no), format)
        : Response.json({ session: s, records: rows });
    }
    if (runId) {
      const run = (
        await query<ExportRun>(
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
        const participantId = url.searchParams.get("participantId");
        const cohort = url.searchParams.get("cohort");
        if (cohort && !["single", "panel"].includes(cohort))
          return Response.json({ error: "无效分组" }, { status: 400 });
        const drafts = (
          await query<ExportEvent>(
            "select participant_id,stage,payload,updated_at as created_at,'draft' as event_type from experiment_drafts where participant_id in (select id from experiment_participants where run_id=$1)",
            [runId],
          )
        ).rows;
        return await reportResponse(
          experimentReport({
            audience: "teaching",
            title: run.title,
            runs: [run],
            participants: participants
              .filter((p) => !participantId || p.id === participantId)
              .map((p) => ({ ...p, run_id: runId })),
            events,
            drafts,
            cohort,
            stage: url.searchParams.get("stage"),
          }),
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

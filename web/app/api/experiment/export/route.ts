import { getParticipant } from "@/lib/experiment";
import { query } from "@/lib/db";
import { reportResponse } from "@/lib/report-export";
import { experimentReport, type ExportEvent } from "@/lib/experiment-report";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const p = await getParticipant();
  if (!p) return Response.json({ error: "请先恢复实验记录" }, { status: 401 });
  const url = new URL(req.url);
  const stage = url.searchParams.get("stage");
  try {
    const events = (
      await query<ExportEvent>(
        "select id,event_type,stage,payload,created_at from experiment_events where participant_id=$1 order by id",
        [p.id],
      )
    ).rows;
    const drafts = (
      await query<ExportEvent>(
        "select 'draft' as event_type,stage,payload,updated_at as created_at from experiment_drafts where participant_id=$1",
        [p.id],
      )
    ).rows;
    return await reportResponse(
      experimentReport({
        audience: "self",
        title: p.run_title + "_" + p.participant_code,
        runs: [
          {
            id: p.run_id,
            title: p.run_title,
            protocol_version: p.protocol_version,
            scenario: p.scenario,
            starts_at: p.starts_at,
          },
        ],
        participants: [p],
        events: events.map((e) => ({ ...e, participant_id: p.id })),
        drafts: drafts.map((e) => ({ ...e, participant_id: p.id })),
        stage,
      }),
      url.searchParams.get("format") || "docx",
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "导出失败" },
      { status: 503 },
    );
  }
}

import { getParticipant } from "@/lib/experiment";
import { query } from "@/lib/db";
import { reportResponse } from "@/lib/report-export";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const p = await getParticipant();
  if (!p) return Response.json({ error: "请先恢复实验记录" }, { status: 401 });
  const url = new URL(req.url);
  const stage = url.searchParams.get("stage");
  try {
    const events = (
      await query(
        "select id,event_type,stage,payload,created_at from experiment_events where participant_id=$1 and ($2::text is null or stage=$2) order by id",
        [p.id, stage],
      )
    ).rows;
    const drafts = (
      await query(
        "select 'draft' as event_type,stage,payload,updated_at as created_at from experiment_drafts where participant_id=$1 and ($2::text is null or stage=$2)",
        [p.id, stage],
      )
    ).rows;
    return await reportResponse(
      {
        title:
          p.run_title + "_" + p.participant_code + (stage ? "_" + stage : ""),
        metadata: {
          participant_code: p.participant_code,
          run_id: p.run_id,
          cohort: p.cohort,
          protocol: p.protocol_version,
          stage: p.stage,
          exported_at: new Date().toISOString(),
          note: "draft为未提交草稿；跳过/未完成不等于0分；AI帮助与学生作答分开记录",
        },
        rows: [...events, ...drafts],
      },
      url.searchParams.get("format") || "docx",
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "导出失败" },
      { status: 503 },
    );
  }
}

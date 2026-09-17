import { getSessionUser } from "@/lib/auth-local";
import { ownRecords, isUuid } from "@/lib/learning-records";
import { reportResponse } from "@/lib/report-export";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u) return Response.json({ error: "请先登录" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("sessionId");
  if (!isUuid(id))
    return Response.json({ error: "记录编号无效" }, { status: 400 });
  try {
    const data = await ownRecords(u.id, id);
    if (!data)
      return Response.json({ error: "无权访问此记录" }, { status: 404 });
    return await reportResponse(
      {
        title: data.session.title,
        metadata: {
          session_id: id,
          module: data.session.module,
          created_at: data.session.created_at,
          exported_at: new Date().toISOString(),
          note: "学生原话和AI内容按role区分；未评分为NA",
        },
        rows: data.records,
      },
      url.searchParams.get("format") || "docx",
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "导出失败，请重试" },
      { status: 503 },
    );
  }
}

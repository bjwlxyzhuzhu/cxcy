import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-local";
import { query } from "@/lib/db";
import { isUuid, ownRecords } from "@/lib/learning-records";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const u = await getSessionUser();
  if (!u)
    return NextResponse.json(
      { error: "请登录后查看历史记录" },
      { status: 401 },
    );
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("sessionId");
    if (id) {
      if (!isUuid(id))
        return NextResponse.json({ error: "记录编号无效" }, { status: 400 });
      const data = await ownRecords(u.id, id);
      return data
        ? NextResponse.json(data)
        : NextResponse.json({ error: "记录不存在或无权访问" }, { status: 404 });
    }
    const moduleKey = url.searchParams.get("module");
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const rows = (
      await query(
        "select id,module,title,created_at,updated_at from learning_sessions where user_id=$1 and ($2::text is null or module=$2) order by updated_at desc,id limit 101 offset $3",
        [u.id, moduleKey, offset],
      )
    ).rows;
    return NextResponse.json({
      sessions: rows.slice(0, 100),
      hasMore: rows.length > 100,
    });
  } catch {
    return NextResponse.json(
      { error: "历史记录暂时读取失败，请重试" },
      { status: 503 },
    );
  }
}

import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { isTeacherSync, projectRole, parseJson } from "@/lib/ontology/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 项目的动作审计记录（最近 200 条）：哪一步是人做的、哪一步是 AI 起草的，一目了然 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const c = sqlite();
  const id = new URL(req.url).searchParams.get("project_id") || "";
  if (!projectRole(c, user.id, id) && !isTeacherSync(c, user.id)) return NextResponse.json({ error: "无权查看" }, { status: 403 });
  const rows = c.prepare(
    `select id, action, actor_kind, target_type, target_id, result, ok, error, created_at,
            case when actor_id = ? then 1 else 0 end mine
     from onto_audit where project_id = ? order by id desc limit 200`
  ).all(user.id, id);
  return NextResponse.json({ items: rows.map((r) => ({ ...r, ok: !!r.ok, mine: !!r.mine, result: parseJson(r.result, {}) })) });
}

import { requireAdmin } from "@/lib/admin";
import { query } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await requireAdmin()))
    return Response.json({ error: "无管理权限" }, { status: 403 });
  try {
    const rows = (
      await query(`select u.id,u.student_no,coalesce(p.name,u.name) as name,
 coalesce(s.online,false) as online,coalesce(s.logged_in,false) as logged_in,greatest(s.last_seen_at,u.last_seen_at) as last_seen_at,
 (select count(*)::int from learning_sessions l where l.user_id=u.id) as record_count,
 (select count(*)::int from experiment_participants e where e.user_id=u.id) as experiment_count
 from users u left join profiles p on p.id=u.id
 left join lateral (select bool_or(expires_at>now() and last_seen_at>now()-interval '2 minutes') as online,
 bool_or(expires_at>now()) as logged_in,max(last_seen_at) as last_seen_at from sessions where user_id=u.id) s on true
 order by u.student_no`)
    ).rows;
    return Response.json(
      {
        students: rows,
        onlineWindowSeconds: 120,
        updated_at: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "在线状态暂不可用，请重试" },
      { status: 503 },
    );
  }
}

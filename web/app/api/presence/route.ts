import { cookies } from "next/headers";
import { hashSessionToken } from "@/lib/auth-local";
import { query } from "@/lib/db";
export const runtime = "nodejs";
export async function POST(req: Request) {
  const token = cookies().get("cxcy_session")?.value;
  if (!token) return new Response(null, { status: 204 });
  try {
    const b = await req.json();
    const path =
      typeof b.path === "string" && /^\/[\w/-]*$/.test(b.path)
        ? b.path.slice(0, 160)
        : null;
    await query(
      "with active as (update sessions set last_seen_at=now(),last_path=$1 where token_hash=$2 and expires_at>now() returning user_id) update users set last_seen_at=now() where id in (select user_id from active)",
      [path, hashSessionToken(token)],
    );
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: "在线状态更新失败" }, { status: 503 });
  }
}

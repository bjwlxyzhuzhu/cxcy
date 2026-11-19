import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db, sqlite } from "@/lib/db";
import { projectRole } from "@/lib/ontology/engine";

export const runtime = "nodejs";

// 云端项目（跨设备 / 队友共享）。读写限定为项目成员（project_members）；删除只限负责人。
type Row = { id: string; name: string; draft: string; sections: unknown; team: unknown; updated_at: string };

function missingTable(e: { code?: string; message?: string } | null): boolean {
  return !!e && (e.code === "42P01" || /relation .*projects.* does not exist|could not find the table/i.test(e.message || ""));
}

export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  const store = db();
  if (id && !projectRole(sqlite(), user.id, id)) return NextResponse.json({ error: "无权查看该项目" }, { status: 403 });
  if (id) {
    const { data, error } = await store.from("projects").select("id,name,draft,sections,team,updated_at").eq("id", id).maybeSingle();
    if (error) { if (missingTable(error)) return NextResponse.json({ needMigration: true, project: null }); return NextResponse.json({ error: error.message }, { status: 500 }); }
    return NextResponse.json({ project: data || null });
  }
  const mine = sqlite().prepare("select project_id from project_members where user_id = ?").all(user.id).map((r) => String(r.project_id));
  const { data, error } = await store.from("projects").select("id,name,updated_at").in("id", mine).order("updated_at", { ascending: false }).limit(50);
  if (error) { if (missingTable(error)) return NextResponse.json({ needMigration: true, items: [] }); return NextResponse.json({ error: error.message }, { status: 500 }); }
  return NextResponse.json({ items: (data || []) as Pick<Row, "id" | "name" | "updated_at">[] });
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  let body: { id?: string; name?: string; draft?: string; sections?: unknown; team?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const payload = {
    name: (body.name || "我的项目").toString().slice(0, 120),
    draft: (body.draft || "").toString().slice(0, 200000),
    sections: body.sections && typeof body.sections === "object" ? body.sections : {},
    team: Array.isArray(body.team) ? body.team : [],
  };
  const store = db();
  if (body.id && !projectRole(sqlite(), user.id, body.id)) return NextResponse.json({ error: "项目不存在或无权修改" }, { status: 404 });
  if (body.id) {
    const { data, error } = await store.from("projects").update(payload).eq("id", body.id).select("id").maybeSingle();
    if (error) { if (missingTable(error)) return NextResponse.json({ error: "云端存储未启用：请先执行数据库迁移", needMigration: true }, { status: 400 }); return NextResponse.json({ error: error.message }, { status: 500 }); }
    if (!data) return NextResponse.json({ error: "项目不存在或无权修改" }, { status: 404 });
    return NextResponse.json({ id: data.id });
  }
  const { data, error } = await store.from("projects").insert({ ...payload, user_id: user.id }).select("id").maybeSingle();
  // 项目本体：创建者即项目负责人
  if (data?.id) await store.from("project_members").upsert({ project_id: data.id, user_id: user.id, role: "owner" }, { onConflict: "project_id,user_id" });
  if (error) { if (missingTable(error)) return NextResponse.json({ error: "云端存储未启用：请先执行数据库迁移", needMigration: true }, { status: 400 }); return NextResponse.json({ error: error.message }, { status: 500 }); }
  return NextResponse.json({ id: data?.id });
}

export async function DELETE(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 });
  const store = db();
  if (projectRole(sqlite(), user.id, id) !== "owner") return NextResponse.json({ error: "只有项目负责人可以删除项目" }, { status: 403 });
  const { error } = await store.from("projects").delete().eq("id", id);
  if (error) { if (missingTable(error)) return NextResponse.json({ error: "云端存储未启用", needMigration: true }, { status: 400 }); return NextResponse.json({ error: error.message }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}

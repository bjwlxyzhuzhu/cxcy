import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 管理端：案例与模板列表（仅教师/管理员） */
export async function GET() {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "无管理员权限" }, { status: 403 });
  const [c, t] = await Promise.all([
    db().from("cases").select("id,code,title,region,industry").order("code").limit(500),
    db().from("templates").select("id,name,category,ext,size_kb,file").order("sort").limit(500),
  ]);
  if (c.error || t.error) return NextResponse.json({ error: (c.error || t.error)!.message }, { status: 500 });
  return NextResponse.json({ cases: c.data || [], templates: t.data || [] });
}

/** 管理端：删案例 / 删模板 / 新增模板 */
export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "无管理员权限" }, { status: 403 });
  let b: { op?: string; id?: number; name?: string; category?: string; ext?: string; file?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  if (b.op === "delete-case" || b.op === "delete-template") {
    const id = Number(b.id);
    if (!Number.isInteger(id)) return NextResponse.json({ error: "缺 id" }, { status: 400 });
    const { error } = await db().from(b.op === "delete-case" ? "cases" : "templates").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }
  if (b.op === "add-template") {
    const name = String(b.name || "").trim().slice(0, 200);
    if (!name) return NextResponse.json({ error: "模板名必填" }, { status: 400 });
    const { data, error } = await db().from("templates")
      .insert({ name, category: String(b.category || "").slice(0, 40) || null, ext: String(b.ext || "").slice(0, 10) || null, file: String(b.file || "").slice(0, 300) || null })
      .select("id,name,category,ext,size_kb,file").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, template: data });
  }
  return NextResponse.json({ error: "未知操作" }, { status: 400 });
}

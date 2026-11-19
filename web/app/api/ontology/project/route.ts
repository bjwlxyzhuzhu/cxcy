import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { isTeacherSync, projectRole, parseJson } from "@/lib/ontology/engine";
import { OBJECT_TYPES } from "@/lib/ontology/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 不带 id：我参与的项目列表（含各类对象的数量与认证进度）
 * 带 id：该项目的全部本体对象与关系（项目成员或教师可看）
 * 不返回成员姓名，只返回人数与我的角色。
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const c = sqlite();
  const id = new URL(req.url).searchParams.get("id");

  if (!id) {
    const rows = c.prepare(
      `select p.id, p.name, p.updated_at, m.role,
              (select count(*) from project_members x where x.project_id = p.id) members
       from project_members m join projects p on p.id = m.project_id where m.user_id = ? order by p.updated_at desc`
    ).all(user.id);
    return NextResponse.json({ items: rows.map((r) => ({ ...r, members: Number(r.members) })) });
  }

  const role = projectRole(c, user.id, id);
  const teacher = isTeacherSync(c, user.id);
  if (!role && !teacher) return NextResponse.json({ error: "无权查看该项目" }, { status: 403 });
  const project = c.prepare("select id, name, updated_at from projects where id = ?").get(id);
  if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

  const objects: Record<string, unknown[]> = {};
  for (const t of OBJECT_TYPES) {
    if (!t.certifiable && t.key !== "hypothesis") continue;
    const rows = c.prepare(`select * from ${t.table} where project_id = ? order by created_at, rowid`).all(id);
    objects[t.key] = rows.map((r) => {
      const o: Record<string, unknown> = { ...r };
      for (const f of t.fields) if (f.kind === "list" || f.kind === "json") o[f.key] = parseJson(o[f.key], []);
      if ("source" in o) o.source = parseJson(o.source, {});
      if ("conflicts" in o) o.conflicts = parseJson(o.conflicts, []);
      return o;
    });
  }
  const links = c.prepare("select id, link_type, src_type, src_id, dst_type, dst_id, origin, created_at from onto_links where project_id = ? order by id").all(id);
  const members = c.prepare("select count(*) n from project_members where project_id = ?").get(id) as { n: number };
  const materials = c.prepare(
    "select id, name, kind, ref_note, chars, pii_flags, created_at, text from materials where project_id = ? order by created_at desc"
  ).all(id).map((r) => ({ ...r, pii_flags: parseJson(r.pii_flags, {}) }));
  const artifacts = c.prepare(
    "select id, kind, title, status, origin, created_at, certified_at from project_artifacts where project_id = ? order by created_at desc"
  ).all(id);
  return NextResponse.json({ project, role, teacher, members: Number(members.n), objects, links, materials, artifacts });
}

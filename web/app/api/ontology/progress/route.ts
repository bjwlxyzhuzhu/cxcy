import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";
import { isTeacherSync, projectRole } from "@/lib/ontology/engine";
import { computeProgress } from "@/lib/ontology/progress";
import { computeAbilities } from "@/lib/ontology/abilities";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 项目 8 步进度与卡点（项目成员或教师可看；全部由本体记录自动判定） */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const c = sqlite();
  const id = new URL(req.url).searchParams.get("project_id") || "";
  if (!projectRole(c, user.id, id) && !isTeacherSync(c, user.id)) return NextResponse.json({ error: "无权查看该项目" }, { status: 403 });
  const p = c.prepare("select id, name from projects where id = ?").get(id);
  if (!p) return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  return NextResponse.json({ project: p, ...computeProgress(c, id), abilities: computeAbilities(c, id) });
}

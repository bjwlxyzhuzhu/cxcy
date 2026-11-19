import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { sqlite } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 我的班级：班级名、本班已关联的授课教师人数（不返回教师姓名）、角色 */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const c = sqlite();
  const p = c.prepare("select role, class from profiles where id = ?").get(user.id) as { role: string; class: string | null } | undefined;
  const klass = p?.class || "";
  const teachers = klass ? Number((c.prepare("select count(*) n from class_teachers where class = ?").get(klass) as { n: number }).n) : 0;
  const myClasses = p?.role === "student" ? [] : (c.prepare("select class from class_teachers where teacher_id = ? order by class").all(user.id) as { class: string }[]).map((r) => r.class);
  return NextResponse.json({ role: p?.role || "student", class: klass, teachers, myClasses });
}

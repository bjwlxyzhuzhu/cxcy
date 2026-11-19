import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { sqlite } from "@/lib/db";
import { classScope } from "@/lib/classes";
import { listCourses, growthReport, growthSummary, courseOfStudent } from "@/lib/growth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 学生成长报告（管理端，可显示真实姓名）：
 *   GET ?course=&class=      → 学生列表与简要指标
 *   GET ?user=&course=       → 单个学生的完整报告（过程性 / 增值性 / 终结性评价）
 *   POST { user_id, course_id, comment } → 保存终结性评语（只存文字）
 * 教师只能看、只能评自己班级的学生；管理员看全部。
 */
export async function GET(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const c = sqlite();
  const scope = classScope(c, me.id);
  const url = new URL(req.url);
  const courses = listCourses(c);
  const course = courses.find((x) => x.id === url.searchParams.get("course")) || null;
  const user = url.searchParams.get("user");

  if (user) {
    const klass = (c.prepare("select class from profiles where id = ? and role = 'student'").get(user) as { class: string | null } | undefined);
    if (!klass) return NextResponse.json({ error: "学生不存在" }, { status: 404 });
    if (!scope.all && !scope.classes.includes(klass.class || "")) return NextResponse.json({ error: "这不是你班级的学生" }, { status: 403 });
    return NextResponse.json(growthReport(c, user, course || courseOfStudent(c, user)));
  }

  let classes = course ? course.classes : [];
  const pick = url.searchParams.get("class");
  if (pick) classes = [pick];
  if (!scope.all) classes = (classes.length ? classes : scope.classes).filter((k) => scope.classes.includes(k));
  const students = (classes.length
    ? c.prepare(`select id from profiles where role = 'student' and class in (${classes.map(() => "?").join(",")}) order by class, student_no limit 400`).all(...classes)
    : !scope.all ? [] : c.prepare("select id from profiles where role = 'student' order by class, student_no limit 400").all()) as { id: string }[];
  return NextResponse.json({ courses, course, items: students.map((s) => growthSummary(c, s.id, course || courseOfStudent(c, s.id))) });
}

export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "无权限" }, { status: 403 });
  let b: { user_id?: string; course_id?: string; comment?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const c = sqlite();
  const klass = c.prepare("select class from profiles where id = ? and role = 'student'").get(b.user_id || "") as { class: string | null } | undefined;
  if (!klass) return NextResponse.json({ error: "学生不存在" }, { status: 404 });
  const scope = classScope(c, me.id);
  if (!scope.all && !scope.classes.includes(klass.class || "")) return NextResponse.json({ error: "这不是你班级的学生" }, { status: 403 });
  if (!c.prepare("select 1 from courses where id = ?").get(b.course_id || "")) return NextResponse.json({ error: "请先在“学期与课程”里设置这门课" }, { status: 400 });
  const text = String(b.comment || "").trim().slice(0, 2000);
  c.prepare(`insert into student_comments (user_id, course_id, comment, author_id, updated_at) values (?, ?, ?, ?, ?)
             on conflict(user_id, course_id) do update set comment = excluded.comment, author_id = excluded.author_id, updated_at = excluded.updated_at`)
    .run(b.user_id, b.course_id, text, me.id, new Date().toISOString());
  return NextResponse.json({ ok: true });
}

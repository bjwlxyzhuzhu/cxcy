import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { sqlite } from "@/lib/db";
import { listCourses } from "@/lib/growth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

/** 学期与课程：教师 / 管理员可看；只有管理员可新建、修改、删除 */
export async function GET() {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const c = sqlite();
  const terms = c.prepare("select id, name, start_date, end_date from terms order by start_date desc").all();
  const classes = (c.prepare("select class, count(*) n from profiles where role = 'student' and class is not null and class <> '' group by class order by class").all() as { class: string; n: number }[])
    .map((r) => ({ class: r.class, students: Number(r.n) }));
  return NextResponse.json({ terms, courses: listCourses(c), classes, canEdit: (me as { role?: string }).role === "admin" });
}

export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me || (me as { role?: string }).role !== "admin") return NextResponse.json({ error: "只有管理员可以设置学期与课程" }, { status: 403 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const c = sqlite();
  try {
    switch (b.action) {
      case "term.save": {
        const name = str(b.name, 60), s = str(b.start_date, 10), e = str(b.end_date, 10);
        if (!name || !DATE.test(s) || !DATE.test(e)) return NextResponse.json({ error: "请填写学期名称与起止日期（YYYY-MM-DD）" }, { status: 400 });
        if (e <= s) return NextResponse.json({ error: "结束日期要晚于开始日期" }, { status: 400 });
        if (b.id) c.prepare("update terms set name = ?, start_date = ?, end_date = ? where id = ?").run(name, s, e, str(b.id, 40));
        else c.prepare("insert into terms (name, start_date, end_date) values (?, ?, ?)").run(name, s, e);
        break;
      }
      case "term.delete":
        c.prepare("delete from terms where id = ?").run(str(b.id, 40));
        break;
      case "course.save": {
        const name = str(b.name, 60), term = str(b.term_id, 40);
        if (!name || !c.prepare("select 1 from terms where id = ?").get(term)) return NextResponse.json({ error: "请选择学期并填写课程名称" }, { status: 400 });
        const classes = (Array.isArray(b.classes) ? b.classes : []).map((x) => str(x, 60)).filter(Boolean).slice(0, 100);
        c.exec("begin");
        try {
          let id = str(b.id, 40);
          if (id) c.prepare("update courses set name = ?, term_id = ? where id = ?").run(name, term, id);
          else id = (c.prepare("insert into courses (term_id, name) values (?, ?) returning id").get(term, name) as { id: string }).id;
          c.prepare("delete from course_classes where course_id = ?").run(id);
          const ins = c.prepare("insert or ignore into course_classes (course_id, class) values (?, ?)");
          for (const k of classes) ins.run(id, k);
          c.exec("commit");
        } catch (e) { c.exec("rollback"); throw e; }
        break;
      }
      case "course.delete":
        c.prepare("delete from courses where id = ?").run(str(b.id, 40));
        break;
      default:
        return NextResponse.json({ error: "未知操作" }, { status: 400 });
    }
  } catch (e) {
    const msg = (e as Error).message || "";
    return NextResponse.json({ error: /UNIQUE/.test(msg) ? "名称重复了" : msg }, { status: 400 });
  }
  return NextResponse.json({ ok: true, courses: listCourses(c) });
}

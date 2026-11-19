import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { db, sqlite } from "@/lib/db";
import { createUser, setPassword, findUserIdByAccount } from "@/lib/auth";
import { makeTempPassword } from "../../../../db/password.mjs";

export const runtime = "nodejs";

type Role = "student" | "teacher" | "admin";
type Row = { student_no?: string; name?: string; class?: string; college?: string; major?: string; role?: string; teacher?: string; classes?: string };

const ROLE_OF: Record<string, Role> = { student: "student", 学生: "student", teacher: "teacher", 教师: "teacher", 老师: "teacher", admin: "admin", 管理员: "admin" };
const splitClasses = (s: string) => s.split(/[、,，;；/|\s]+/).map((x) => x.trim()).filter(Boolean);

/**
 * 名单批量导入（学生 / 教师 / 管理员）：账号 = 学号或工号，统一或随机初始密码；补 profile；学生写入 rosters。
 * 关联：教师行的“授课班级”认领这些班级；学生行的“任课教师”（填教师工号）把该生所在班级关联给这位教师。
 * 幂等；已有账号会重置为新初始密码（不会重置正在操作的管理员本人）。
 */
export async function POST(req: Request) {
  const me = await requireAdmin();
  if (!me) return NextResponse.json({ error: "无管理员权限" }, { status: 403 });

  let body: { rows?: Row[]; password?: string; credits?: number; randomPasswords?: boolean; defaultRole?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const rows = Array.isArray(body?.rows) ? body!.rows! : [];
  const password = (body?.password || "").trim();
  const randomPasswords = body?.randomPasswords === true;
  const credits = Number.isFinite(body?.credits) ? Math.max(0, Math.floor(body!.credits!)) : 120;
  const defaultRole: Role = ROLE_OF[(body?.defaultRole || "").trim()] || "student";
  if (!rows.length) return NextResponse.json({ error: "没有可导入的行" }, { status: 400 });
  if (!randomPasswords && password.length < 6) return NextResponse.json({ error: "初始密码至少 6 位" }, { status: 400 });

  const admin = db();
  const c = sqlite();
  const link = c.prepare("insert or ignore into class_teachers (class, teacher_id) values (?, ?)");

  type R = { student_no: string; name: string; role: Role; status: "created" | "exists" | "failed"; password?: string; error?: string };
  const results: R[] = [];
  const isTeacherOp = (me as { role?: string }).role !== "admin";
  const pendingLinks: { klass: string; teacher: string }[] = []; // 学生行指定的任课教师，教师行全部建好后再关联
  for (const r of rows) {
    const no = (r.student_no || "").toString().trim();
    const name = (r.name || "").toString().trim();
    const klass = (r.class || "").toString().trim();
    const role: Role = ROLE_OF[(r.role || "").toString().trim().toLowerCase()] || ROLE_OF[(r.role || "").toString().trim()] || defaultRole;
    if (!no) { results.push({ student_no: "", name, role, status: "failed", error: "缺学号 / 工号" }); continue; }
    if (isTeacherOp && role !== "student") { results.push({ student_no: no, name, role, status: "failed", error: "教师只能导入学生名单，教师 / 管理员账号请由管理员导入" }); continue; }
    const tempPassword = randomPasswords ? makeTempPassword() : password;
    let id = findUserIdByAccount(no);
    const status: "created" | "exists" = id ? "exists" : "created";
    try {
      if (id === me.id) { results.push({ student_no: no, name, role, status: "failed", error: "这是你本人的账号，已跳过" }); continue; }
      if (id) setPassword(id, tempPassword); // 已有账号：重置为新的初始密码（旧会话随之失效）
      else id = createUser({ account: no, password: tempPassword, name: name || no, student_no: role === "student" ? no : null, role, credits });
      const { error: pe } = await admin.from("profiles").update({
        student_no: role === "student" ? no : null, name: name || no, class: role === "student" ? klass || null : null,
        college: r.college || null, major: r.major || null, role, credits,
      }).eq("id", id);
      if (pe) { results.push({ student_no: no, name, role, status: "failed", error: "档案更新失败：" + pe.message }); continue; }
      if (role === "student") {
        await admin.from("rosters").upsert(
          { class: klass, student_no: no, name: name || no, college: r.college || null, major: r.major || null },
          { onConflict: "class,student_no" }
        );
        const t = (r.teacher || "").toString().trim();
        if (t && klass) pendingLinks.push({ klass, teacher: t });
        if (isTeacherOp && klass) link.run(klass, me.id); // 教师导入自己班的名单：班级自动关联到本人
      } else if (role === "teacher") {
        for (const k of splitClasses((r.classes || r.class || "").toString())) link.run(k, id);
      }
      results.push({ student_no: no, name: name || no, role, status, password: tempPassword });
    } catch (e) {
      results.push({ student_no: no, name, role, status: "failed", error: e instanceof Error ? e.message : "未知错误" });
    }
  }
  let linked = 0;
  if (isTeacherOp) pendingLinks.length = 0; // 教师不能把学生关联给其他教师
  const missingTeachers = new Set<string>();
  for (const p of pendingLinks) {
    const tid = findUserIdByAccount(p.teacher);
    const ok = tid && (c.prepare("select 1 from profiles where id = ? and role in ('teacher','admin')").get(tid));
    if (!ok) { missingTeachers.add(p.teacher); continue; }
    linked += Number(link.run(p.klass, tid).changes || 0);
  }

  return NextResponse.json({
    created: results.filter((r) => r.status === "created").length,
    exists: results.filter((r) => r.status === "exists").length,
    failed: results.filter((r) => r.status === "failed").length,
    results, password: randomPasswords ? undefined : password, randomPasswords,
    linked, missingTeachers: [...missingTeachers],
  });
}

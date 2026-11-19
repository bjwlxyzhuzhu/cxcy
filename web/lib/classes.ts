import "server-only";
import type { Sqlite } from "@/lib/db";

/**
 * 班级归属：学生按 profiles.class 归班，教师按 class_teachers 认领班级（名单导入时建立）。
 * 管理员看全部；教师若还没认领任何班级，也看全部（兼容未导入关联的旧数据）。
 */
export type ClassScope = { all: boolean; classes: string[] };

export function classScope(c: Sqlite, userId: string): ClassScope {
  const role = (c.prepare("select role from profiles where id = ?").get(userId) as { role?: string } | undefined)?.role;
  const classes = (c.prepare("select class from class_teachers where teacher_id = ? order by class").all(userId) as { class: string }[]).map((r) => r.class);
  return { all: role === "admin" || classes.length === 0, classes };
}

/** 班级下拉可选项：管理员 / 未认领的教师看到全部有学生的班级，否则只看到自己的班级 */
export function scopeClassOptions(c: Sqlite, s: ClassScope): string[] {
  if (!s.all) return s.classes;
  return (c.prepare("select distinct class from profiles where role = 'student' and class is not null and class <> '' order by class").all() as { class: string }[]).map((r) => r.class);
}

/**
 * 项目可见性 SQL 片段（用于 where 子句，项目表别名 p）：项目里至少有一名成员属于给定班级。
 * pick 为空表示按 scope 全部班级；返回 [sql, params]。
 */
export function projectClassFilter(s: ClassScope, pick?: string): [string, string[]] {
  const list = pick ? (s.all || s.classes.includes(pick) ? [pick] : ["\u0000无权限"]) : s.all ? [] : s.classes;
  if (!list.length) return ["1 = 1", []];
  return [
    `exists (select 1 from project_members m join profiles pf on pf.id = m.user_id where m.project_id = p.id and pf.class in (${list.map(() => "?").join(",")}))`,
    list,
  ];
}

/** 某班学生人数（授课大屏的出勤分母） */
export function classSize(c: Sqlite, klass: string[]): number {
  if (!klass.length) return Number((c.prepare("select count(*) n from profiles where role = 'student'").get() as { n: number }).n);
  return Number((c.prepare(`select count(*) n from profiles where role = 'student' and class in (${klass.map(() => "?").join(",")})`).get(...klass) as { n: number }).n);
}

import "server-only";
import { cookies } from "next/headers";
import { db, sqlite, tx } from "@/lib/db";
import { SESSION_COOKIE, verifySession } from "@/lib/session";
import { hashPassword, verifyPassword } from "../db/password.mjs";

/**
 * 自建认证（替代 Supabase Auth）：
 *   users 表存账号与 scrypt 密码哈希；登录后签发 httpOnly 签名 cookie（lib/session.ts）。
 *   每次取当前用户都会对照 users.session_version，改密码/禁用账号后旧会话立即失效。
 */

export type AuthUser = { id: string; account: string };
export type Role = "student" | "teacher" | "admin";

/** 取当前登录用户（无则 null）。返回对象只保证有 id / account 两个字段 */
export async function getUser(): Promise<AuthUser | null> {
  const p = await verifySession(cookies().get(SESSION_COOKIE)?.value);
  if (!p) return null;
  const row = sqlite()
    .prepare("select id, account, session_version, disabled from users where id = ?")
    .get(p.u) as { id: string; account: string; session_version: number; disabled: number } | undefined;
  if (!row || row.disabled || Number(row.session_version) !== p.v) return null;
  return { id: row.id, account: row.account };
}

/** 取当前用户档案（含积分/角色）；未登录返回 null */
export async function getProfile() {
  const user = await getUser();
  if (!user) return null;
  const { data } = await db()
    .from("profiles")
    .select("id, name, student_no, role, credits")
    .eq("id", user.id)
    .maybeSingle();
  return data as { id: string; name: string | null; student_no: string | null; role: Role; credits: number } | null;
}

// ───────────────────────── 登录限流（进程内，防暴力猜密码）─────────────────────────

const fails = new Map<string, { n: number; until: number }>();
const MAX_FAILS = 5, LOCK_MS = 5 * 60 * 1000;

export function loginLocked(key: string): number {
  const f = fails.get(key);
  if (!f || f.n < MAX_FAILS) return 0;
  const left = f.until - Date.now();
  if (left <= 0) { fails.delete(key); return 0; }
  return Math.ceil(left / 1000);
}
function noteFail(key: string) {
  const f = fails.get(key) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= MAX_FAILS) f.until = Date.now() + LOCK_MS;
  fails.set(key, f);
}

/** 校验账号密码；成功返回 { id, version }，失败返回 null（不区分“账号不存在”和“密码错误”） */
export function checkLogin(account: string, password: string, key: string): { id: string; version: number } | null {
  const row = sqlite()
    .prepare("select id, password_hash, session_version, disabled from users where account = ?")
    .get(account.trim()) as { id: string; password_hash: string; session_version: number; disabled: number } | undefined;
  // 账号不存在时也做一次哈希，避免通过响应时间判断账号是否存在
  const ok = verifyPassword(password, row?.password_hash || "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
  if (!row || !ok || row.disabled) { noteFail(key); return null; }
  fails.delete(key);
  sqlite().prepare("update users set last_login_at = ? where id = ?").run(new Date().toISOString(), row.id);
  return { id: row.id, version: Number(row.session_version) };
}

// ───────────────────────── 账号管理（管理端 / 名册导入用）─────────────────────────

export type NewUser = {
  account: string;
  password: string;
  name?: string | null;
  role?: Role;
  credits?: number;
  student_no?: string | null;
  class?: string | null;
  college?: string | null;
  major?: string | null;
};

/** 建号：users + profiles 同一事务写入；账号已存在时抛出 code=23505 的错误 */
export function createUser(u: NewUser): string {
  const account = u.account.trim();
  if (!account) throw new Error("账号不能为空");
  if (String(u.password).length < 6) throw new Error("密码至少 6 位");
  return tx((c) => {
    const r = c
      .prepare("insert into users (account, password_hash) values (?, ?) returning id")
      .get(account, hashPassword(u.password)) as { id: string };
    c.prepare(
      "insert into profiles (id, name, student_no, role, credits, class, college, major) values (?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      r.id,
      u.name || account,
      u.student_no ?? null,
      u.role || "student",
      Number.isFinite(u.credits) ? Number(u.credits) : 120,
      u.class ?? null,
      u.college ?? null,
      u.major ?? null
    );
    return r.id;
  });
}

/** 改密码：同时让该账号所有旧会话失效；返回新的会话版本号 */
export function setPassword(userId: string, password: string): number {
  if (String(password).length < 6) throw new Error("密码至少 6 位");
  const r = sqlite()
    .prepare("update users set password_hash = ?, session_version = session_version + 1 where id = ? returning session_version")
    .get(hashPassword(password), userId) as { session_version: number } | undefined;
  if (!r) throw new Error("账号不存在");
  return Number(r.session_version);
}

/** 按账号查用户 id（不区分大小写） */
export function findUserIdByAccount(account: string): string | null {
  const r = sqlite().prepare("select id from users where account = ?").get(account.trim()) as { id: string } | undefined;
  return r?.id ?? null;
}

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { query } from "@/lib/db";

const COOKIE = "cxcy_session";
const SESSION_DAYS = 30;

export type LocalUser = {
  id: string;
  studentNo: string;
  name: string | null;
  role: string;
  credits: number;
};

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function isAdminRole(role: string | null | undefined) {
  return role === "admin" || role === "teacher";
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

export function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

function sessionCookieOptions(expires: Date) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", expires };
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, hashSessionToken(token), expires]
  );
  cookies().set(COOKIE, token, sessionCookieOptions(expires));
  return token;
}

export async function clearSession() {
  const token = cookies().get(COOKIE)?.value;
  if (token) await query("DELETE FROM sessions WHERE token_hash = $1", [hashSessionToken(token)]);
  cookies().set(COOKIE, "", sessionCookieOptions(new Date(0)));
}

export async function getSessionUser(): Promise<LocalUser | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  const { rows } = await query<LocalUser>(
    `SELECT u.id, u.student_no AS "studentNo", COALESCE(p.name, u.name) AS name,
            COALESCE(p.role, u.role)::text AS role, COALESCE(p.credits, 0)::int AS credits
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN profiles p ON p.id = u.id
      WHERE s.token_hash = $1 AND s.expires_at > now()
      LIMIT 1`,
    [hashSessionToken(token)]
  );
  return rows[0] || null;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function requireAdmin() {
  const user = await getSessionUser();
  return user && isAdminRole(user.role) ? user : null;
}

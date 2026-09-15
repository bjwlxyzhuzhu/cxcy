import { getSessionUser } from "@/lib/auth-local";
import { query } from "@/lib/db";

/** 取当前登录用户（无则 null） */
export async function getUser() {
  return getSessionUser();
}

/** 取当前用户档案（含积分/角色）；未登录返回 null */
export async function getProfile() {
  const user = await getSessionUser();
  if (!user) return null;
  const { rows } = await query("SELECT id, name, student_no, role, credits FROM profiles WHERE id = $1", [user.id]);
  return rows[0] || null;
}

import "server-only";
import { requireAdmin as requireLocalAdmin } from "@/lib/auth-local";

/** 管理端权限校验：返回当前管理员档案，非 admin/teacher 返回 null。用于 /api/admin/* 与 /admin 页面 gate。 */
export async function requireAdmin() {
  return requireLocalAdmin();
}

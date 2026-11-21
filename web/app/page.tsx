import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import LoginPortal from "@/components/LoginPortal";

export const dynamic = "force-dynamic";

/** 首页：未登录显示登录（学生 / 教师 / 管理员）；已登录直接进入各自的首页 */
export default async function Page() {
  let profile = null;
  try { profile = await getProfile(); } catch { profile = null; }
  if (profile) redirect(homeOf(profile.role));
  return <LoginPortal />;
}

function homeOf(role?: string | null) {
  return role === "admin" ? "/admin?tab=terms" : role === "teacher" ? "/teacher" : "/course";
}

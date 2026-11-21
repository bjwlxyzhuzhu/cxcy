import GalaxyHome from "@/components/GalaxyHome";
import { getProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** 星系展示模式：原首页的银河动效，适合课堂开场与宣传展示；日常使用走浅色的角色首页 */
export default async function GalaxyPage() {
  let profile = null;
  try { profile = await getProfile(); } catch { profile = null; }
  return (
    <GalaxyHome initialCredits={profile?.credits ?? null} loggedIn={!!profile} userName={profile?.name ?? null}
      studentNo={profile?.student_no ?? null} role={profile?.role ?? null} />
  );
}

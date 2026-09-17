import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth-local";
import { cookies } from "next/headers";

export const runtime = "nodejs";

export async function POST() {
  await clearSession();
  // 退出仅清除凭据，不删除账号历史或实验记录，避免共用电脑串号。
  cookies().delete("cxcy_experiment_session");
  return NextResponse.json({ ok: true });
}

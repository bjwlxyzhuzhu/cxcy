import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth-local";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  return NextResponse.json({ user });
}

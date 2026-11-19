import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PURPOSES = ["chat", "reason", "text", "image", "tts"];

/** 本人绑定的模型密钥（只读写自己的；?purpose=chat 只取一条且不返回密钥本身） */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const purpose = new URL(req.url).searchParams.get("purpose");
  if (purpose) {
    const { data } = await db().from("user_api_keys").select("provider, model").eq("user_id", user.id).eq("purpose", purpose).maybeSingle();
    return NextResponse.json({ key: data || null });
  }
  const { data, error } = await db().from("user_api_keys").select("purpose, provider, base_url, api_key, model").eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  let b: { purpose?: string; provider?: string; base_url?: string; api_key?: string; model?: string };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  if (!b.purpose || !PURPOSES.includes(b.purpose)) return NextResponse.json({ error: "用途无效" }, { status: 400 });
  const s = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const { error } = await db().from("user_api_keys").upsert({
    user_id: user.id, purpose: b.purpose, provider: s(b.provider, 40), base_url: s(b.base_url, 300),
    api_key: s(b.api_key, 400), model: s(b.model, 120), updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const purpose = new URL(req.url).searchParams.get("purpose") || "";
  const { error } = await db().from("user_api_keys").delete().eq("user_id", user.id).eq("purpose", purpose);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

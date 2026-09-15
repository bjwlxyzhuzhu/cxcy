import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db-client";
import { getSessionUser, isAdminRole } from "@/lib/auth-local";

export const runtime = "nodejs";

const TABLES = new Set(["profiles", "rosters", "usage_logs", "app_config", "user_api_keys", "knowledge", "cases", "templates", "projects", "user_skills", "user_enabled_skills", "evidence_events", "intervention_cards"]);
const ADMIN_TABLES = new Set(["profiles", "rosters", "usage_logs", "app_config", "knowledge", "cases", "templates"]);
const ADMIN_WRITE_TABLES = new Set(["profiles", "rosters", "usage_logs", "app_config", "knowledge", "cases", "templates"]);

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const url = new URL(req.url);
  const table = url.searchParams.get("table") || "";
  if (!TABLES.has(table)) return NextResponse.json({ error: "不支持的数据表" }, { status: 400 });
  const admin = createAdminClient();
  const q = admin.from(table).select(url.searchParams.get("select") || "*");
  const filters = JSON.parse(url.searchParams.get("filters") || "[]") as { op: string; column: string; value: unknown }[];
  for (const filter of filters) {
    if (filter.op === "eq") q.eq(filter.column, filter.value);
    else if (filter.op === "neq") q.neq(filter.column, filter.value);
    else if (filter.op === "in" && Array.isArray(filter.value)) q.in(filter.column, filter.value);
  }
  if (!isAdminRole(user.role)) {
    const ownColumn = table === "profiles" ? "id" : "user_id";
    if (["profiles", "user_api_keys", "projects", "user_skills", "user_enabled_skills", "evidence_events", "intervention_cards", "usage_logs"].includes(table)) q.eq(ownColumn, user.id);
    else if (ADMIN_TABLES.has(table) && !["cases", "templates"].includes(table)) return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  if (url.searchParams.get("order")) q.order(url.searchParams.get("order")!, { ascending: url.searchParams.get("ascending") !== "false" });
  if (url.searchParams.get("limit")) q.limit(Number(url.searchParams.get("limit")));
  if (url.searchParams.get("single") === "1") q.maybeSingle();
  const result = await q;
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ data: result.data, count: result.count ?? null });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  let body: { table?: string; op?: string; data?: Record<string, unknown>; filters?: { op: string; column: string; value: unknown }[]; select?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "请求格式错误" }, { status: 400 }); }
  const table = body.table || "";
  if (!TABLES.has(table)) return NextResponse.json({ error: "不支持的数据表" }, { status: 400 });
  const admin = createAdminClient();
  const isAdmin = isAdminRole(user.role);
  if (ADMIN_WRITE_TABLES.has(table) && !isAdmin) return NextResponse.json({ error: "无权限" }, { status: 403 });
  if (!isAdmin && ["user_api_keys", "projects", "user_skills", "user_enabled_skills"].includes(table)) {
    body.data = { ...(body.data || {}), user_id: user.id };
  }
  const q = admin.from(table);
  if (body.op === "insert") q.insert(body.data || {});
  else if (body.op === "update") q.update(body.data || {});
  else if (body.op === "delete") q.delete();
  else if (body.op === "upsert") q.upsert(body.data || {}, { onConflict: table === "user_api_keys" ? "user_id, purpose" : "class, student_no" });
  else return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
  for (const filter of body.filters || []) {
    if (filter.op === "eq") q.eq(filter.column, filter.value);
    else if (filter.op === "neq") q.neq(filter.column, filter.value);
  }
  if (body.select) q.select(body.select);
  const result = await q;
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  return NextResponse.json({ data: result.data, count: result.count ?? null });
}

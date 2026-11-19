import "server-only";
import { sqlite, type Sqlite } from "@/lib/db";
import { TYPE_BY_KEY, type FieldDef, type ObjectTypeDef } from "./schema";

/**
 * 项目本体 · 动作引擎（行为层）
 *
 * 所有“改变状态”的操作都以动作（Action）的形式执行，而不是直接改字段：
 *   · 一个动作 = 参数校验 + 权限判断 + 业务规则 + 连带影响（计分、快照…），在同一个写事务里完成，出错整体回滚；
 *   · 无论成功失败都写一条审计记录（onto_audit）：谁、人还是 AI、对什么对象、做了什么；
 *   · humanOnly 的动作（认证、计分、发布版本、教师确认）AI 不能执行 —— 人判断 / AI 执行。
 *
 * 动作的 run() 必须是同步的，只能用传入的连接 ctx.c 读写数据库，不能再开事务、不能调用模型。
 * 需要调用模型的流程：先在动作外生成草稿，再把结果作为参数交给动作。
 */

export type ActorKind = "human" | "ai" | "system";
export type Actor = { userId: string; kind: ActorKind };

export class ActionError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type Ctx = {
  c: Sqlite;
  actor: Actor;
  isTeacher: boolean;
  now: string;
  /** 审计归属：动作执行过程中填写 */
  scope: { projectId?: string | null; matchId?: string | null; targetType?: string | null; targetId?: string | null };
};

export type ActionDef<P = unknown, R = unknown> = {
  key: string;
  label: string;
  /** 只能由人执行（AI / 系统自动化不能执行） */
  humanOnly?: boolean;
  parse: (raw: Record<string, unknown>) => P;
  run: (ctx: Ctx, p: P) => R;
};

const REGISTRY = new Map<string, ActionDef<unknown, unknown>>();

export function defineAction<P, R>(def: ActionDef<P, R>): ActionDef<P, R> {
  REGISTRY.set(def.key, def as ActionDef<unknown, unknown>);
  return def;
}

export function listActions() {
  return [...REGISTRY.values()].map((d) => ({ key: d.key, label: d.label, humanOnly: !!d.humanOnly }));
}

function auditJson(v: unknown): string {
  try {
    const s = JSON.stringify(v ?? {});
    return s.length > 8000 ? JSON.stringify({ _truncated: true, size: s.length }) : s;
  } catch {
    return "{}";
  }
}

function writeAudit(c: Sqlite, key: string, actor: Actor, scope: Ctx["scope"], params: unknown, result: unknown, ok: boolean, error?: string) {
  c.prepare(
    `insert into onto_audit (project_id, match_id, action, actor_id, actor_kind, target_type, target_id, params, result, ok, error)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    scope.projectId ?? null, scope.matchId ?? null, key, actor.userId || null, actor.kind,
    scope.targetType ?? null, scope.targetId ?? null, auditJson(params), auditJson(result), ok ? 1 : 0, error ?? null
  );
}

/** 执行一个动作：成功返回结果；失败抛出 ActionError（status 可直接作为 HTTP 状态码） */
export function runAction<R = unknown>(key: string, actor: Actor, raw: Record<string, unknown> = {}): R {
  const c = sqlite();
  const def = REGISTRY.get(key);
  const scope: Ctx["scope"] = {};
  if (!def) throw new ActionError(400, `未知动作：${key}`);

  const fail = (e: unknown): never => {
    const err = e instanceof ActionError ? e : new ActionError(500, (e as Error)?.message || "动作执行失败");
    if (!(e instanceof ActionError)) console.error(`[ontology] 动作 ${key} 异常：`, e);
    try { writeAudit(c, key, actor, scope, raw, {}, false, err.message); } catch { /* 审计失败不掩盖原错误 */ }
    throw err;
  };

  if (def.humanOnly && actor.kind !== "human") fail(new ActionError(403, "该动作必须由人执行（AI 只能起草，不能代替人确认）"));
  let params: unknown;
  try { params = def.parse(raw || {}); } catch (e) { fail(e instanceof ActionError ? e : new ActionError(400, (e as Error).message)); }

  const ctx: Ctx = { c, actor, isTeacher: isTeacherSync(c, actor.userId), now: new Date().toISOString(), scope };
  c.exec("begin immediate");
  let result: unknown;
  try {
    result = def.run(ctx, params);
    writeAudit(c, key, actor, scope, raw, result, true);
    c.exec("commit");
  } catch (e) {
    c.exec("rollback");
    fail(e);
  }
  return result as R;
}

// ───────────────────────── 权限与读取 ─────────────────────────

export function isTeacherSync(c: Sqlite, userId: string): boolean {
  if (!userId) return false;
  const r = c.prepare("select role from profiles where id = ?").get(userId) as { role?: string } | undefined;
  return r?.role === "teacher" || r?.role === "admin";
}

export function projectRole(c: Sqlite, userId: string, projectId: string): "owner" | "member" | null {
  const r = c.prepare("select role from project_members where project_id = ? and user_id = ?").get(projectId, userId) as { role?: string } | undefined;
  return (r?.role as "owner" | "member") || null;
}

/** 必须是项目成员（教师不能代学生改项目内容） */
export function requireMember(ctx: Ctx, projectId: string) {
  ctx.scope.projectId = projectId;
  if (!projectRole(ctx.c, ctx.actor.userId, projectId)) throw new ActionError(403, "只能操作自己所在项目的内容");
}

/** 项目成员或教师 */
export function requireMemberOrTeacher(ctx: Ctx, projectId: string) {
  ctx.scope.projectId = projectId;
  if (!ctx.isTeacher && !projectRole(ctx.c, ctx.actor.userId, projectId)) throw new ActionError(403, "无权查看或操作该项目");
}

export function objectType(key: string): ObjectTypeDef {
  const t = TYPE_BY_KEY[key];
  if (!t) throw new ActionError(400, `未知对象类型：${key}`);
  return t;
}

export type ObjRow = Record<string, unknown> & { id: string; project_id?: string | null; status?: string };

export function getObject(c: Sqlite, typeKey: string, id: string): ObjRow | null {
  const t = objectType(typeKey);
  return (c.prepare(`select * from ${t.table} where id = ?`).get(id) as ObjRow | undefined) ?? null;
}

// ───────────────────────── 参数清洗 ─────────────────────────

export const str = (v: unknown, max = 300): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** 按字段定义清洗可编辑字段；未在白名单里的字段一律忽略 */
export function cleanFields(t: ObjectTypeDef, raw: unknown): Record<string, unknown> {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const f of t.fields) {
    if (!(f.key in src)) continue;
    out[f.key] = cleanValue(f, src[f.key]);
  }
  return out;
}

function cleanValue(f: FieldDef, v: unknown): unknown {
  switch (f.kind) {
    case "text": return str(v, f.max ?? 300);
    case "longtext": return str(v, f.max ?? 4000);
    case "date": return str(v, 20) || null;
    case "int": {
      const n = Number(v);
      return v === null || v === "" || !Number.isFinite(n) ? null : Math.max(0, Math.floor(n));
    }
    case "enum": {
      const s = str(v, 40);
      if (!f.options?.some((o) => o.value === s)) throw new ActionError(400, `${f.label}取值无效`);
      return s;
    }
    case "list": {
      const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(/\n+/) : [];
      return JSON.stringify(arr.map((x) => str(String(x ?? ""), 300)).filter(Boolean).slice(0, 20));
    }
    case "json": {
      const s = JSON.stringify(v ?? []);
      if (s.length > 8000) throw new ActionError(400, `${f.label}内容过长`);
      return s;
    }
  }
}

/** 来源：{kind, ref, note}；kind 必须是真实来源类型之一 */
export function cleanSource(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  return { kind: str(r.kind, 30), ref: str(r.ref, 300), note: str(r.note, 500) };
}

export function parseJson<T>(s: unknown, fallback: T): T {
  if (typeof s !== "string") return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

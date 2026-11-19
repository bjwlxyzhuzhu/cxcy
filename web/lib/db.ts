import "server-only";
import { openDatabase, migrate } from "../db/migrate.mjs";

/**
 * 数据访问层（SQLite，Node 内置 node:sqlite）。
 *
 * 为了让原来 119 处 supabase-js 调用基本不用改，这里实现了一个只覆盖本项目实际用到方法的
 * 薄封装：db().from("表").select/insert/upsert/update/delete + eq/neq/gt/gte/lt/lte/in/like/ilike/is/or
 * + order/limit/range/single/maybeSingle，返回结构与 supabase-js 相同：{ data, error, count }。
 * 另提供 rpc("deduct_credits" | "match_knowledge") 与原 Postgres 函数同名同参。
 *
 * 所有 SQL 都参数化；表名、列名只接受白名单字符，防止拼接注入。
 * jsontext 列（原 jsonb / text[]）写入时自动 JSON.stringify、读出时自动 JSON.parse；
 * boolean 列存 0/1，读出时转回 true/false。
 *
 * ⚠ 本模块只能在服务端（Node 运行时）导入；所有权限判断都在调用它的接口里完成。
 */

// ───────────────────────── 底层连接 ─────────────────────────

type Row = Record<string, unknown>;
interface Stmt {
  all(...p: unknown[]): Row[];
  get(...p: unknown[]): Row | undefined;
  run(...p: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}
export interface Sqlite {
  exec(sql: string): void;
  prepare(sql: string): Stmt;
  close(): void;
}

const g = globalThis as unknown as { __sqlite?: Sqlite; __sqliteMeta?: Map<string, TableMeta> };

/** 取原始连接（进程内单例；首次打开时自动执行未执行的迁移） */
export function sqlite(): Sqlite {
  if (!g.__sqlite) {
    const conn = openDatabase() as Sqlite;
    const applied: string[] = migrate(conn);
    if (applied.length) console.log("[db] 已执行迁移：", applied.join(", "));
    g.__sqlite = conn;
    g.__sqliteMeta = new Map();
  }
  return g.__sqlite;
}

/** 在一个写事务里执行同步函数（BEGIN IMMEDIATE，出错回滚） */
export function tx<T>(fn: (c: Sqlite) => T): T {
  const c = sqlite();
  c.exec("begin immediate");
  try {
    const r = fn(c);
    c.exec("commit");
    return r;
  } catch (e) {
    c.exec("rollback");
    throw e;
  }
}

// ───────────────────────── 表结构元信息 ─────────────────────────

interface TableMeta {
  cols: Set<string>;
  json: Set<string>;
  bool: Set<string>;
  blob: Set<string>;
  pk: string[];
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
function ident(name: string): string {
  if (!IDENT.test(name)) throw new DbError(`非法的表名或列名：${name}`, "42602");
  return `"${name}"`;
}

function meta(table: string): TableMeta {
  sqlite();
  const cache = g.__sqliteMeta!;
  let m = cache.get(table);
  if (m) return m;
  ident(table);
  // table_xinfo 包含生成列（char_len / total）
  const info = sqlite().prepare(`pragma table_xinfo("${table}")`).all() as {
    name: string; type: string; pk: number; hidden: number;
  }[];
  if (!info.length) throw new DbError(`表或视图不存在：${table}`, "42P01");
  m = { cols: new Set(), json: new Set(), bool: new Set(), blob: new Set(), pk: [] };
  for (const c of info) {
    m.cols.add(c.name);
    const t = (c.type || "").toLowerCase();
    if (t === "jsontext") m.json.add(c.name);
    else if (t === "boolean") m.bool.add(c.name);
    else if (t === "blob") m.blob.add(c.name);
    if (c.pk > 0) m.pk[c.pk - 1] = c.name;
  }
  cache.set(table, m);
  return m;
}

// ───────────────────────── 值转换 ─────────────────────────

/** 写入前：对象/数组 → JSON 文本；布尔 → 0/1；Date → ISO；向量 → Float32 BLOB */
function toDb(m: TableMeta, col: string, v: unknown): unknown {
  if (v === undefined || v === null) return null;
  if (m.json.has(col)) return JSON.stringify(v);
  if (m.blob.has(col)) return toVectorBlob(v);
  return toParam(v);
}

/** 过滤条件里的值：布尔 → 0/1；Date → ISO；其余原样 */
function toParam(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "bigint") return Number(v);
  if (v !== null && typeof v === "object" && !(v instanceof Uint8Array)) return JSON.stringify(v);
  return v;
}

/** 向量：接受 number[]、Float32Array 或 "[0.1,0.2,...]" 字符串（原 pgvector 写法） */
export function toVectorBlob(v: unknown): Uint8Array | null {
  if (v == null) return null;
  if (v instanceof Uint8Array) return v;
  let arr: number[] | Float32Array | null = null;
  if (v instanceof Float32Array) arr = v;
  else if (Array.isArray(v)) arr = v as number[];
  else if (typeof v === "string" && v.trim().startsWith("[")) arr = JSON.parse(v) as number[];
  if (!arr) throw new DbError("向量格式不正确", "22P02");
  const f = arr instanceof Float32Array ? arr : Float32Array.from(arr);
  return new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
}

function fromVectorBlob(b: unknown): Float32Array | null {
  if (!(b instanceof Uint8Array)) return null;
  // 复制一份以保证 4 字节对齐
  const copy = new Uint8Array(b.byteLength);
  copy.set(b);
  return new Float32Array(copy.buffer);
}

/** 读出后：JSON 文本 → 对象；0/1 → 布尔；去掉 null 原型 */
function fromDb(m: TableMeta | null, row: Row): Row {
  const out: Row = {};
  for (const k of Object.keys(row)) {
    let v = row[k];
    if (m && v !== null && v !== undefined) {
      if (m.json.has(k) && typeof v === "string") {
        try { v = JSON.parse(v); } catch { /* 保留原文本 */ }
      } else if (m.bool.has(k)) {
        v = v === 1 || v === "1" || v === true;
      } else if (m.blob.has(k)) {
        v = fromVectorBlob(v);
      }
    }
    if (typeof v === "bigint") v = Number(v);
    out[k] = v;
  }
  return out;
}

// ───────────────────────── 错误与结果 ─────────────────────────

export class DbError extends Error {
  code: string;
  details?: string;
  hint?: string;
  constructor(message: string, code = "XX000") {
    super(message);
    this.code = code;
  }
}

/** 把 SQLite 错误映射成接近 Postgres 的错误码，便于原有判断（如 23505 唯一冲突）继续生效 */
function wrapErr(e: unknown): DbError {
  if (e instanceof DbError) return e;
  const msg = (e as Error)?.message || String(e);
  let code = "XX000";
  if (/UNIQUE constraint failed|PRIMARY KEY constraint/.test(msg)) code = "23505";
  else if (/FOREIGN KEY constraint failed/.test(msg)) code = "23503";
  else if (/NOT NULL constraint failed/.test(msg)) code = "23502";
  else if (/CHECK constraint failed/.test(msg)) code = "23514";
  else if (/no such column|has no column/.test(msg)) code = "42703";
  else if (/no such table/.test(msg)) code = "42P01";
  return new DbError(msg, code);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbResult<T = any> = {
  data: T;
  error: DbError | null;
  count: number | null;
  status: number;
  statusText: string;
};

// ───────────────────────── 查询构造器 ─────────────────────────

type Op = "select" | "insert" | "upsert" | "update" | "delete";
type Cond = { sql: string; params: unknown[] };
type CountOpt = { count?: "exact" | "planned" | "estimated"; head?: boolean };

const OPS: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=", like: "like", ilike: "like" };

// 与 supabase-js 未声明类型时一致：列表查询 data 为 any[]，single/maybeSingle 为 any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class Query<T = any[]> implements PromiseLike<DbResult<T>> {
  private op: Op = "select";
  private cols = "*";
  private returning: string | null = null;
  private values: Row[] = [];
  private onConflict: string[] | null = null;
  private ignoreDup = false;
  private where: Cond[] = [];
  private orders: string[] = [];
  private lim: number | null = null;
  private off: number | null = null;
  private countMode = false;
  private headOnly = false;
  private one: "single" | "maybe" | null = null;
  private m: TableMeta;

  private table: string;
  constructor(table: string) {
    this.table = table;
    this.m = meta(table);
  }

  // —— 动作 ——
  select(cols = "*", opts: CountOpt = {}): Query<T> {
    if (this.op === "select") {
      this.cols = cols;
      this.countMode = !!opts.count;
      this.headOnly = !!opts.head;
    } else {
      this.returning = cols; // insert/update/upsert/delete 之后的 .select() = RETURNING
    }
    return this;
  }
  insert(v: Row | Row[], opts: CountOpt = {}): Query<T> {
    this.op = "insert";
    this.values = Array.isArray(v) ? v : [v];
    this.countMode = !!opts.count;
    return this;
  }
  upsert(v: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } & CountOpt = {}): Query<T> {
    this.op = "upsert";
    this.values = Array.isArray(v) ? v : [v];
    this.onConflict = opts.onConflict ? opts.onConflict.split(",").map((s) => s.trim()).filter(Boolean) : null;
    this.ignoreDup = !!opts.ignoreDuplicates;
    this.countMode = !!opts.count;
    return this;
  }
  update(v: Row, opts: CountOpt = {}): Query<T> {
    this.op = "update";
    this.values = [v];
    this.countMode = !!opts.count;
    return this;
  }
  delete(opts: CountOpt = {}): Query<T> {
    this.op = "delete";
    this.countMode = !!opts.count;
    return this;
  }

  // —— 过滤 ——
  private col(c: string): string {
    if (!this.m.cols.has(c)) throw new DbError(`列 ${this.table}.${c} 不存在`, "42703");
    return ident(c);
  }
  // 注：SQLite 的 LIKE 不区分 ASCII 大小写，like 与 ilike 行为相同（本项目 like 只用于 uuid 前缀匹配，无影响）
  private cmp(c: string, op: string, v: unknown): Query<T> {
    this.where.push({ sql: `${this.col(c)} ${OPS[op]} ?`, params: [toParam(v)] });
    return this;
  }
  eq(c: string, v: unknown) { return v === null ? this.is(c, null) : this.cmp(c, "eq", v); }
  neq(c: string, v: unknown) {
    // 与 Postgres 一致：NULL 不等于任何值，也不“不等于”任何值
    return this.cmp(c, "neq", v);
  }
  gt(c: string, v: unknown) { return this.cmp(c, "gt", v); }
  gte(c: string, v: unknown) { return this.cmp(c, "gte", v); }
  lt(c: string, v: unknown) { return this.cmp(c, "lt", v); }
  lte(c: string, v: unknown) { return this.cmp(c, "lte", v); }
  like(c: string, v: string) { return this.cmp(c, "like", v); }
  ilike(c: string, v: string) { return this.cmp(c, "ilike", v); }
  is(c: string, v: null | boolean) {
    if (v === null) this.where.push({ sql: `${this.col(c)} is null`, params: [] });
    else this.where.push({ sql: `${this.col(c)} = ?`, params: [v ? 1 : 0] });
    return this;
  }
  in(c: string, vs: readonly unknown[]) {
    if (!vs.length) {
      this.where.push({ sql: "0", params: [] }); // 空集合：永远不匹配（与 supabase 行为一致）
      return this;
    }
    this.where.push({ sql: `${this.col(c)} in (${vs.map(() => "?").join(",")})`, params: vs.map(toParam) });
    return this;
  }
  /** 只支持 supabase 的简单写法："a.eq.x,b.gte.y"（各项为 OR，值不能含逗号） */
  or(expr: string) {
    const parts: Cond[] = expr.split(",").map((p) => {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\.(eq|neq|gt|gte|lt|lte|like|ilike|is)\.(.*)$/.exec(p.trim());
      if (!m) throw new DbError(`不支持的 or 条件：${p}`, "42601");
      const [, c, op, raw] = m;
      if (op === "is") return { sql: `${this.col(c)} is null`, params: [] };
      const v = raw === "true" ? 1 : raw === "false" ? 0 : raw;
      return { sql: `${this.col(c)} ${OPS[op]} ?`, params: [v] };
    });
    this.where.push({ sql: `(${parts.map((p) => p.sql).join(" or ")})`, params: parts.flatMap((p) => p.params) });
    return this;
  }

  // —— 排序与分页 ——
  order(c: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const asc = opts.ascending !== false;
    // 与 Postgres 默认一致：升序 NULL 在后，降序 NULL 在前
    const nullsFirst = opts.nullsFirst ?? !asc;
    this.orders.push(`${this.col(c)} ${asc ? "asc" : "desc"} nulls ${nullsFirst ? "first" : "last"}`);
    return this;
  }
  limit(n: number) { this.lim = Math.max(0, Math.floor(n)); return this; }
  range(from: number, to: number) { this.off = from; this.lim = to - from + 1; return this; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  single(): Query<any> { this.one = "single"; return this as unknown as Query<any>; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  maybeSingle(): Query<any> { this.one = "maybe"; return this as unknown as Query<any>; }

  // —— 执行 ——
  private colList(spec: string): string {
    const s = spec.trim();
    if (s === "*" || s === "") return "*";
    return s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        if (x === "*") return "*";
        const alias = /^([A-Za-z_]\w*)\s*:\s*([A-Za-z_]\w*)$/.exec(x);
        if (alias) return `${this.col(alias[2])} as ${ident(alias[1])}`;
        return this.col(x);
      })
      .join(", ");
  }
  private whereSql(): { sql: string; params: unknown[] } {
    if (!this.where.length) return { sql: "", params: [] };
    return { sql: " where " + this.where.map((w) => w.sql).join(" and "), params: this.where.flatMap((w) => w.params) };
  }
  private tail(): string {
    let s = "";
    if (this.orders.length) s += " order by " + this.orders.join(", ");
    if (this.lim != null) s += ` limit ${this.lim}`;
    else if (this.off != null) s += " limit -1";
    if (this.off != null) s += ` offset ${Math.max(0, Math.floor(this.off))}`;
    return s;
  }

  private run(): DbResult<T> {
    const db = sqlite();
    const t = ident(this.table);
    let rows: Row[] | null = null;
    let count: number | null = null;

    if (this.op === "select") {
      const w = this.whereSql();
      if (this.countMode) {
        const r = db.prepare(`select count(*) as n from ${t}${w.sql}`).get(...w.params);
        count = Number(r?.n ?? 0);
      }
      if (!this.headOnly) {
        rows = db.prepare(`select ${this.colList(this.cols)} from ${t}${w.sql}${this.tail()}`).all(...w.params);
      }
    } else if (this.op === "insert" || this.op === "upsert") {
      const ret = this.returning != null ? ` returning ${this.colList(this.returning)}` : "";
      const out: Row[] = [];
      let n = 0;
      tx(() => {
        for (const v of this.values) {
          const keys = Object.keys(v).filter((k) => v[k] !== undefined);
          keys.forEach((k) => this.col(k));
          let sql = keys.length
            ? `insert into ${t} (${keys.map(ident).join(", ")}) values (${keys.map(() => "?").join(", ")})`
            : `insert into ${t} default values`;
          if (this.op === "upsert") {
            const target = this.onConflict ?? this.m.pk;
            if (!target.length) throw new DbError(`表 ${this.table} 没有主键，upsert 需要 onConflict`, "42P10");
            const upd = keys.filter((k) => !target.includes(k));
            sql += ` on conflict (${target.map((c) => this.col(c)).join(", ")}) `;
            sql += this.ignoreDup || !upd.length
              ? "do nothing"
              : "do update set " + upd.map((k) => `${ident(k)} = excluded.${ident(k)}`).join(", ");
          }
          const params = keys.map((k) => toDb(this.m, k, v[k]));
          if (ret) out.push(...db.prepare(sql + ret).all(...params));
          else n += Number(db.prepare(sql).run(...params).changes);
        }
      });
      rows = ret ? out : null;
      if (this.countMode) count = ret ? out.length : n;
    } else if (this.op === "update") {
      const v = this.values[0] || {};
      const keys = Object.keys(v).filter((k) => v[k] !== undefined);
      if (!keys.length) throw new DbError("update 没有要更新的字段", "42601");
      keys.forEach((k) => this.col(k));
      const w = this.whereSql();
      const sql = `update ${t} set ${keys.map((k) => `${ident(k)} = ?`).join(", ")}${w.sql}`;
      const params = [...keys.map((k) => toDb(this.m, k, v[k])), ...w.params];
      if (this.returning != null) {
        rows = db.prepare(`${sql} returning ${this.colList(this.returning)}`).all(...params);
        if (this.countMode) count = rows.length;
      } else {
        const r = db.prepare(sql).run(...params);
        if (this.countMode) count = Number(r.changes);
      }
    } else if (this.op === "delete") {
      const w = this.whereSql();
      const sql = `delete from ${t}${w.sql}`;
      if (this.returning != null) {
        rows = db.prepare(`${sql} returning ${this.colList(this.returning)}`).all(...w.params);
        if (this.countMode) count = rows.length;
      } else {
        const r = db.prepare(sql).run(...w.params);
        if (this.countMode) count = Number(r.changes);
      }
    }

    const conv = rows ? rows.map((r) => fromDb(this.m, r)) : null;
    if (this.one) {
      const list = conv ?? [];
      if (list.length > 1) throw new DbError("查询返回了多行，期望一行", "PGRST116");
      if (!list.length && this.one === "single") throw new DbError("查询没有返回任何行", "PGRST116");
      return ok((list[0] ?? null) as T, count);
    }
    return ok(conv as T, count);
  }

  then<A = DbResult<T>, B = never>(
    onfulfilled?: ((v: DbResult<T>) => A | PromiseLike<A>) | null,
    onrejected?: ((e: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    let res: DbResult<T>;
    try {
      res = this.run();
    } catch (e) {
      const err = wrapErr(e);
      res = { data: null as T, error: err, count: null, status: 400, statusText: err.message };
    }
    return Promise.resolve(res).then(onfulfilled, onrejected);
  }
}

function ok<T>(data: T, count: number | null): DbResult<T> {
  return { data, error: null, count, status: 200, statusText: "OK" };
}

// ───────────────────────── 原 Postgres 函数 ─────────────────────────

/** 原子扣积分并记流水；余额不足返回错误 INSUFFICIENT_CREDITS（与原函数一致） */
function deductCredits(a: { p_user: string; p_action: string; p_cost: number; p_meta?: unknown }): number {
  return tx((c) => {
    const r = c
      .prepare("update profiles set credits = credits - ? where id = ? and credits >= ? returning credits")
      .get(a.p_cost, a.p_user, a.p_cost);
    if (!r) throw new DbError("INSUFFICIENT_CREDITS", "P0001");
    c.prepare("insert into usage_logs (user_id, action, cost, meta) values (?, ?, ?, ?)")
      .run(a.p_user, a.p_action, a.p_cost, JSON.stringify(a.p_meta ?? {}));
    return Number(r.credits);
  });
}

/** 知识库向量检索：余弦相似度暴力扫描（几千条知识块毫秒级），返回字段与原函数一致 */
function matchKnowledge(a: { query_embedding: unknown; match_count?: number }) {
  const qb = toVectorBlob(a.query_embedding);
  const q = qb ? fromVectorBlob(qb)! : null;
  if (!q) return [];
  let qn = 0;
  for (let i = 0; i < q.length; i++) qn += q[i] * q[i];
  qn = Math.sqrt(qn) || 1;
  const rows = sqlite()
    .prepare("select id, source, title, chunk, embedding from knowledge where embedding is not null")
    .all();
  const scored = rows.map((r) => {
    const v = fromVectorBlob(r.embedding)!;
    let dot = 0, vn = 0;
    const n = Math.min(v.length, q.length);
    for (let i = 0; i < n; i++) { dot += v[i] * q[i]; vn += v[i] * v[i]; }
    return { id: Number(r.id), source: r.source, title: r.title, chunk: r.chunk, similarity: dot / (qn * (Math.sqrt(vn) || 1)) };
  });
  scored.sort((x, y) => y.similarity - x.similarity);
  return scored.slice(0, a.match_count ?? 6);
}

// ───────────────────────── 对外入口 ─────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export const dbClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from<T = any[]>(table: string): Query<T> {
    return new Query<T>(table);
  },
  async rpc(fn: string, args: Any = {}): Promise<DbResult<Any>> {
    try {
      if (fn === "deduct_credits") return ok(deductCredits(args), null);
      if (fn === "match_knowledge") return ok(matchKnowledge(args), null);
      throw new DbError(`未知函数：${fn}`, "42883");
    } catch (e) {
      const err = wrapErr(e);
      return { data: null, error: err, count: null, status: 400, statusText: err.message };
    }
  },
};

/** 服务端数据访问入口（替代原 createAdminClient()）：db().from("表")… */
export function db() {
  return dbClient;
}

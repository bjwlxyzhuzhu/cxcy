import "server-only";
import { query } from "@/lib/db";

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
function identifiers(value: string) {
  const cols = value.trim() === "*" ? ["*"] : value.split(",").map((x) => x.trim());
  for (const col of cols) if (col !== "*" && !IDENT.test(col.split(/\s+as\s+/i)[0])) throw new Error("Invalid SQL identifier");
  return cols.join(", ");
}

function tableName(table: string) {
  if (!IDENT.test(table)) throw new Error("Invalid SQL table");
  return `public.${table}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result = { data: any; error: Error | null; count: number | null };

class TableQuery implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "delete" = "select";
  private columns = "*";
  private values: unknown[] = [];
  private where: string[] = [];
  private orderBy = "";
  private limitValue?: number;
  private offsetValue?: number;
  private returning = false;
  private countRequested = false;
  private headOnly = false;
  private singleMode: "single" | "maybe" | null = null;
  private data: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private upsertConflict?: string;

  constructor(private readonly table: string) {}
  select(columns = "*", options?: { count?: "exact"; head?: boolean }) { this.columns = identifiers(columns); this.returning = this.op !== "select"; this.countRequested = options?.count === "exact"; this.headOnly = options?.head === true; return this; }
  insert(data: Record<string, unknown> | Record<string, unknown>[]) { this.op = "insert"; this.data = data; return this; }
  update(data: Record<string, unknown>) { this.op = "update"; this.data = data; return this; }
  delete(options?: { count?: "exact" }) { this.op = "delete"; this.countRequested = options?.count === "exact"; return this; }
  upsert(data: Record<string, unknown> | Record<string, unknown>[], options: { onConflict: string }) { this.op = "insert"; this.data = data; this.upsertConflict = options.onConflict; return this; }
  eq(column: string, value: unknown) { return this.condition(column, "=", value); }
  neq(column: string, value: unknown) { return this.condition(column, "<>", value); }
  in(column: string, values: unknown[]) { this.assertColumn(column); this.where.push(`${column} = ANY($${this.values.length + 1})`); this.values.push(values); return this; }
  or(expression: string) {
    const clauses = expression.split(",").map((part) => { const [column, operator, raw] = part.split("."); if (!column || !operator || raw === undefined) throw new Error("Invalid OR expression"); this.assertColumn(column); const op = operator === "eq" ? "=" : operator === "gte" ? ">=" : operator === "neq" ? "<>" : null; if (!op) throw new Error("Unsupported OR operator"); this.values.push(raw); return `${column} ${op} $${this.values.length}`; });
    this.where.push(`(${clauses.join(" OR ")})`); return this;
  }
  order(column: string, opts?: { ascending?: boolean }) { this.assertColumn(column); this.orderBy = ` ORDER BY ${column} ${opts?.ascending === false ? "DESC" : "ASC"}`; return this; }
  limit(value: number) { this.limitValue = Math.max(0, Math.floor(value)); return this; }
  range(from: number, to: number) { this.offsetValue = Math.max(0, Math.floor(from)); this.limitValue = Math.max(0, Math.floor(to - from + 1)); return this; }
  single() { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }

  private assertColumn(column: string) { if (!IDENT.test(column)) throw new Error("Invalid SQL column"); }
  private condition(column: string, op: string, value: unknown) { this.assertColumn(column); this.values.push(value); this.where.push(`${column} ${op} $${this.values.length}`); return this; }
  private whereSql() { return this.where.length ? ` WHERE ${this.where.join(" AND ")}` : ""; }

  private async execute(): Promise<Result> {
    const table = tableName(this.table);
    try {
      if (this.op === "select") {
        const countSql = this.countRequested ? `SELECT count(*)::int AS count FROM ${table}${this.whereSql()}` : null;
        const sql = `SELECT ${this.columns} FROM ${table}${this.whereSql()}${this.orderBy}${this.limitValue === undefined ? "" : ` LIMIT ${this.limitValue}`}${this.offsetValue === undefined ? "" : ` OFFSET ${this.offsetValue}`}`;
        const result = this.headOnly ? { rows: [], rowCount: 0 } : await query(sql, this.values);
        const count = countSql ? Number((await query<{ count: number }>(countSql, this.values)).rows[0]?.count || 0) : undefined;
        return this.format(result.rows, count);
      }
      if (!this.data) throw new Error("Missing mutation data");
      const rows = Array.isArray(this.data) ? this.data : [this.data];
      if (this.op === "insert") {
        const cols = Object.keys(rows[0]); cols.forEach(this.assertColumn);
        const args: unknown[] = []; const tuples = rows.map((row) => `(${cols.map((c) => { args.push(row[c]); return `$${args.length}`; }).join(", ")})`);
        const conflict = this.upsertConflict ? ` ON CONFLICT (${this.upsertConflict.split(",").map((x) => x.trim()).join(", ")}) DO UPDATE SET ${cols.filter((c) => !this.upsertConflict!.split(",").includes(c)).map((c) => `${c}=EXCLUDED.${c}`).join(", ")}` : "";
        const result = await query(`INSERT INTO ${table} (${cols.join(", ")}) VALUES ${tuples.join(", ")}${conflict}${this.returning ? ` RETURNING ${this.columns}` : ""}`, args);
        return this.format(result.rows, result.rowCount);
      }
      if (this.op === "update") {
        const entries = Object.entries(rows[0]); const args = entries.map(([, v]) => v); const set = entries.map(([c], i) => `${c} = $${i + 1}`).join(", ");
        const shiftedWhere = this.where.map((w) => w.replace(/\$(\d+)/g, (_, n) => `$${Number(n) + args.length}`));
        const result = await query(`UPDATE ${table} SET ${set}${shiftedWhere.length ? ` WHERE ${shiftedWhere.join(" AND ")}` : ""}${this.returning ? ` RETURNING ${this.columns}` : ""}`, [...args, ...this.values]);
        return this.format(result.rows, result.rowCount);
      }
      const result = await query(`DELETE FROM ${table}${this.whereSql()}${this.returning ? ` RETURNING ${this.columns}` : ""}`, this.values);
      return this.format(result.rows, result.rowCount);
    } catch (error) { return { data: null, error: error instanceof Error ? error : new Error(String(error)), count: null }; }
  }

  private format(rows: unknown[], count?: number | null): Result {
    if (this.singleMode === "single" && rows.length !== 1) return { data: null, error: new Error(rows.length ? "Multiple rows returned" : "No rows returned"), count: count ?? null };
    return { data: this.singleMode ? (rows[0] || null) : rows, error: null, count: count ?? null };
  }
  then<TResult1 = Result, TResult2 = never>(onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2> { return this.execute().then(onfulfilled, onrejected); }
}

export function createAdminClient() {
  return {
    from: (table: string) => new TableQuery(table),
    rpc: (name: string, args: Record<string, unknown>) => ({
      then: (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) => {
        if (name !== "match_knowledge") return Promise.resolve({ data: null, error: new Error("Unsupported database function"), count: null }).then(resolve, reject);
        const vector = args.query_embedding;
        const count = Number(args.match_count || 6);
        return query("SELECT id, source, title, chunk, 1 - (embedding <=> $1::vector) AS similarity FROM public.knowledge WHERE embedding IS NOT NULL ORDER BY embedding <=> $1::vector LIMIT $2", [vector, count])
          .then((r) => resolve({ data: r.rows, error: null, count: r.rowCount }), reject);
      },
    }),
  };
}
export const createClient = createAdminClient;

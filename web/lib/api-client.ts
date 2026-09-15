// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Result<T = unknown> = { data: T; error: { message: string } | null; count?: number | null };
type Filter = { op: string; column: string; value: unknown };

async function me() {
  const r = await fetch("/api/auth/me", { credentials: "same-origin" });
  const body = await r.json();
  const user = body.user || null;
  return { data: { user, session: user ? { user } : null }, error: r.ok ? null : { message: body.error || "未登录" } };
}

class ApiQuery<T = unknown> implements PromiseLike<Result<T>> {
  private filters: Filter[] = [];
  private columns = "*";
  private orderBy = "";
  private ascending = true;
  private limitValue?: number;
  private singleMode = false;
  constructor(private readonly table: string) {}
  select(columns = "*") { this.columns = columns; return this; }
  eq(column: string, value: unknown) { this.filters.push({ op: "eq", column, value }); return this; }
  neq(column: string, value: unknown) { this.filters.push({ op: "neq", column, value }); return this; }
  in(column: string, value: unknown[]) { this.filters.push({ op: "in", column, value }); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.orderBy = column; this.ascending = options?.ascending !== false; return this; }
  limit(value: number) { this.limitValue = value; return this; }
  single() { this.singleMode = true; return this; }
  maybeSingle() { this.singleMode = true; return this; }
  insert(data: Record<string, unknown>) { return this.mutate("insert", data); }
  update(data: Record<string, unknown>) { return new MutationQuery(this.table, "update", data); }
  delete() { return new MutationQuery(this.table, "delete", {}); }
  upsert(data: Record<string, unknown>) { return new MutationQuery(this.table, "upsert", data); }
  then<TResult1 = Result<T>, TResult2 = never>(resolve?: ((value: Result<T>) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) { return this.execute().then(resolve, reject); }
  private mutate(op: string, data: Record<string, unknown>) { return new MutationQuery(this.table, op, data); }
  private async execute(): Promise<Result<T>> {
    const params = new URLSearchParams({ table: this.table, select: this.columns, filters: JSON.stringify(this.filters) });
    if (this.orderBy) { params.set("order", this.orderBy); params.set("ascending", String(this.ascending)); }
    if (this.limitValue !== undefined) params.set("limit", String(this.limitValue));
    if (this.singleMode) params.set("single", "1");
    const r = await fetch(`/api/data?${params}`, { credentials: "same-origin" }); const body = await r.json();
    return { data: body.data as T, error: r.ok ? null : { message: body.error || "请求失败" }, count: body.count };
  }
}

class MutationQuery implements PromiseLike<Result> {
  private filters: Filter[] = []; private columns?: string;
  constructor(private readonly table: string, private readonly op: string, private readonly data: Record<string, unknown>) {}
  eq(column: string, value: unknown) { this.filters.push({ op: "eq", column, value }); return this; }
  neq(column: string, value: unknown) { this.filters.push({ op: "neq", column, value }); return this; }
  select(columns = "*") { this.columns = columns; return this; }
  single() { return this; }
  maybeSingle() { return this; }
  then<TResult1 = Result, TResult2 = never>(resolve?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null) { return fetch("/api/data", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ table: this.table, op: this.op, data: this.data, filters: this.filters, select: this.columns }) }).then(async (r) => { const b = await r.json(); return { data: b.data, error: r.ok ? null : { message: b.error || "请求失败" }, count: b.count }; }).then(resolve, reject); }
}

export function createClient() {
  return {
    auth: {
      getSession: me,
      getUser: me,
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        const studentNo = email.split("@")[0];
        const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ studentNo, password }) });
        const b = await r.json(); return { error: r.ok ? null : { message: b.error || "登录失败" } };
      },
      updateUser: async ({ password }: { password: string }) => { const r = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) }); const b = await r.json(); return { error: r.ok ? null : { message: b.error || "修改密码失败" } }; },
      signOut: async () => { const r = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); return { error: r.ok ? null : { message: "退出失败" } }; },
    },
    from: <T = unknown>(table: string) => new ApiQuery<T>(table),
  };
}

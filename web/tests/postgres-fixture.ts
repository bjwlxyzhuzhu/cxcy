import { Pool } from "pg";
// 仅供显式配置的独立测试库；拒绝常见生产库名。
export class PostgresFixture {
  private pool: Pool;
  readonly appUrl: string;
  constructor(url: string) {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith("/cxcy_test"))
      throw new Error(
        "TEST_DATABASE_URL must point to a dedicated cxcy_test* database",
      );
    parsed.searchParams.set("application_name", "cxcy-fixture-setup");
    this.pool = new Pool({ connectionString: parsed.toString(), max: 1 });
    parsed.searchParams.set("application_name", "cxcy-integration-app");
    this.appUrl = parsed.toString();
  }
  async exec(sql: string) {
    await this.pool.query(sql);
  }
  async query<T>(sql: string, params?: unknown[]) {
    const result = await this.pool.query(sql, params);
    return { rows: result.rows as T[] };
  }
  async close() {
    await this.pool.end();
  }
  async getStats() {
    const r = await this.pool.query(
      "select count(*)::int as n from pg_stat_activity where datname=current_database() and application_name='cxcy-integration-app'",
    );
    return {
      activeConnections: r.rows[0].n,
      queuedQueries: 0,
      maxConnections: 64,
    };
  }
}

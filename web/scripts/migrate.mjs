import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("缺少 DATABASE_URL。请先在环境变量或 Portainer Stack 中配置 PostgreSQL 连接串。");
  process.exit(1);
}
const pool = new Pool({ connectionString: databaseUrl });
const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../db/migrations");
const client = await pool.connect();
try {
  await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const files = (await fs.readdir(migrationsDir)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
  for (const file of files) {
    const existing = await client.query("SELECT 1 FROM public.schema_migrations WHERE version = $1", [file]);
    if (existing.rowCount) { console.log(`✓ 已跳过 ${file}`); continue; }
    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO public.schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`✓ 已应用 ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw new Error(`迁移 ${file} 失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} finally {
  client.release();
  await pool.end();
}

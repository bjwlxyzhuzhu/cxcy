// 数据库打开与迁移执行（纯 JS：Next 服务端与 scripts/*.mjs 共用）
// 使用 Node 内置 node:sqlite（Node ≥ 22.13，推荐 24+），不需要任何第三方依赖。
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/** 解析 DATABASE_URL：支持 file:./data/app.db 或直接写路径；相对路径按进程工作目录解析 */
export function resolveDbPath(url = process.env.DATABASE_URL) {
  const raw = String(url || "file:./data/app.db").replace(/^file:(\/\/)?/, "");
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

/** 打开数据库并设置连接参数：WAL（读写并发）、外键约束、忙等待 5 秒 */
export function openDatabase(file = resolveDbPath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(
    "pragma journal_mode = WAL; pragma foreign_keys = ON; pragma busy_timeout = 5000; pragma synchronous = NORMAL;"
  );
  return db;
}

/** 迁移目录：默认 <工作目录>/db/migrations，可用 MIGRATIONS_DIR 覆盖 */
export function migrationsDir() {
  return process.env.MIGRATIONS_DIR
    ? path.resolve(process.env.MIGRATIONS_DIR)
    : path.resolve(process.cwd(), "db/migrations");
}

/** 按文件名顺序执行未执行过的迁移（每个文件一个事务），返回本次执行的文件名列表 */
export function migrate(db, dir = migrationsDir()) {
  db.exec(
    "create table if not exists schema_migrations (name text primary key, applied_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')))"
  );
  const done = new Set(db.prepare("select name from schema_migrations").all().map((r) => r.name));
  if (!fs.existsSync(dir)) throw new Error(`找不到迁移目录：${dir}`);
  const files = fs.readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const applied = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    db.exec("begin immediate");
    try {
      db.exec(sql);
      db.prepare("insert into schema_migrations (name) values (?)").run(f);
      db.exec("commit");
      applied.push(f);
    } catch (e) {
      db.exec("rollback");
      throw new Error(`迁移 ${f} 失败：${e?.message || e}`);
    }
  }
  return applied;
}

import "server-only";
import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";

// Next.js 各路由包/开发热更新可能分别加载本模块。连接池必须按进程复用，
// 否则每个模块实例都会再开10条连接，批量导出时耗尽数据库连接上限。
const processDb = globalThis as typeof globalThis & {
  __cxcyDbPool?: Pool;
};

function getPool() {
  if (!processDb.__cxcyDbPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    processDb.__cxcyDbPool = new Pool({
      connectionString: url,
      max: 10,
      idleTimeoutMillis: 30_000,
    });
  }
  return processDb.__cxcyDbPool;
}

export function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  values: unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, values);
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDb() {
  const pool = processDb.__cxcyDbPool;
  delete processDb.__cxcyDbPool;
  if (pool) await pool.end();
}

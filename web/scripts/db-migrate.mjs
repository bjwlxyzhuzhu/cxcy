// 执行数据库迁移：node --env-file-if-exists=.env.local scripts/db-migrate.mjs
// 应用启动时也会自动执行未执行的迁移；本脚本用于部署前显式建库/升级与核对。
import { openDatabase, migrate, resolveDbPath } from "../db/migrate.mjs";

const file = resolveDbPath();
const db = openDatabase(file);
const applied = migrate(db);
console.log(`数据库：${file}`);
console.log(applied.length ? `本次执行迁移：${applied.join(", ")}` : "没有待执行的迁移");
const objs = db
  .prepare("select type, count(*) n from sqlite_master where name not like 'sqlite_%' group by type order by type")
  .all();
console.log("库内对象：" + objs.map((o) => `${o.type} ${o.n}`).join("，"));
db.close();

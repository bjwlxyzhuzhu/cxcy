// 脚本专用数据库入口：复用 lib/db.ts 的查询封装（与网站完全同一套代码）。
// Node ≥ 22.18 / 24 可直接加载 .ts（类型擦除）；server-only 只在 Next 里有意义，这里换成空模块。
import { registerHooks } from "node:module";

registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return next(spec, ctx);
  },
});

const mod = await import("../lib/db.ts");
/** 用法与网站内相同：db().from("表").select()… */
export const db = mod.db;
export const sqlite = mod.sqlite;

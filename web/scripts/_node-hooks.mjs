// 脱离 Next 直接用 Node 运行 TS 代码时的模块钩子：server-only 换成空模块，@/ 别名指向项目根目录
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = pathToFileURL(path.resolve(import.meta.dirname, "..") + "/").href;
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    if (spec.startsWith("@/")) {
      const base = new URL(spec.slice(2), root).href;
      for (const ext of ["", ".ts", ".tsx", "/index.ts"]) {
        try { return next(base + ext, ctx); } catch { /* 试下一个扩展名 */ }
      }
    }
    if ((spec.startsWith("./") || spec.startsWith("../")) && !/\.[cm]?[jt]sx?$/.test(spec)) {
      for (const ext of [".ts", "/index.ts"]) {
        try { return next(spec + ext, ctx); } catch { /* 试下一个 */ }
      }
    }
    try {
      return next(spec, ctx);
    } catch (e) {
      // CommonJS 包的子路径（如 next/headers）在 ESM 下需要带 .js 后缀
      if (!spec.startsWith(".") && !spec.startsWith("node:") && !/\.[cm]?js$/.test(spec)) return next(spec + ".js", ctx);
      throw e;
    }
  },
});

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { guideSections } from "../lib/user-guide";
for (const section of guideSections) {
  const file = `app${section.href === "/" ? "" : section.href}/page.tsx`;
  if (!existsSync(file)) throw new Error(`手册入口缺失：${file}`);
}
mkdirSync("../docs", { recursive: true });
writeFileSync(
  "../docs/用户使用手册.md",
  "# 双创AI用户使用手册\n\n由 web/lib/user-guide.ts 生成；运行 pnpm guide:generate 更新并核对页面入口。\n\n" +
    guideSections
      .map((s) => `## ${s.title}\n\n${s.body}\n\n入口：\`${s.href}\``)
      .join("\n\n") +
    "\n",
  "utf8",
);
console.log(`手册已生成，${guideSections.length}个页面入口检查通过`);

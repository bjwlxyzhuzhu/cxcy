import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { guideSections } from "../lib/user-guide";
import { guideWalkthrough } from "../lib/guide-walkthrough";
import { guideMarkdown } from "../lib/guide-markdown";
for (const section of guideSections) {
  const file = `app${section.href === "/" ? "" : section.href}/page.tsx`;
  if (!existsSync(file)) throw new Error(`手册入口缺失：${file}`);
  const w = guideWalkthrough[section.href];
  if (!w?.steps.length) throw new Error(`操作步骤缺失：${section.href}`);
  if (w.image && !existsSync(`public/guide/${w.image}.png`)) throw new Error(`图片缺失：${w.image}`);
}
mkdirSync("../docs", { recursive: true });
writeFileSync("../docs/用户使用手册.md", guideMarkdown("https://cxcy.tokenone.work"), "utf8");
console.log(`手册已生成，${guideSections.length}个入口及图片检查通过`);

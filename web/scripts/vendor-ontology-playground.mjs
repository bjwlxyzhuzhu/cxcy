// 把 microsoft/ontology-playground（MIT）构建成离线静态文件，放到 public/ontology-playground/。
// 用法（需要联网下载源码与依赖，只在维护时运行一次；网站运行时不访问外网）：
//   git clone https://github.com/microsoft/ontology-playground.git <源码目录>
//   git -C <源码目录> checkout 7bf7acb427424ce68f917fa26f484fb06ca42051
//   node scripts/vendor-ontology-playground.mjs <源码目录>
// 做的事：去掉 Google 字体链接 → npm ci --ignore-scripts → 以 /ontology-playground/ 为 base 构建（关闭 AI 生成）
//        → 复制 build/ 到 public/ontology-playground，附 LICENSE.txt，删除 Azure 部署配置。
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const src = process.argv[2];
if (!src || !fs.existsSync(path.join(src, "package.json"))) {
  console.error("用法：node scripts/vendor-ontology-playground.mjs <ontology-playground 源码目录>");
  process.exit(1);
}
const html = path.join(src, "index.html");
fs.writeFileSync(html, fs.readFileSync(html, "utf8")
  .replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.(googleapis|gstatic)\.com"[^>]*>/g, "")
  .replace(/\s*<link href="https:\/\/fonts\.googleapis\.com[^>]*>/g, ""));

const env = { ...process.env, VITE_BASE_PATH: "/ontology-playground/", VITE_ENABLE_AI_BUILDER: "false", MSYS_NO_PATHCONV: "1" };
execSync("npm ci --ignore-scripts --no-audit --no-fund", { cwd: src, stdio: "inherit", env });
execSync("npm run build", { cwd: src, stdio: "inherit", env });

const dst = path.resolve("public/ontology-playground");
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(path.join(src, "build"), dst, { recursive: true });
fs.rmSync(path.join(dst, "staticwebapp.config.json"), { force: true });
fs.copyFileSync(path.join(src, "LICENSE"), path.join(dst, "LICENSE.txt"));
const indexHtml = fs.readFileSync(path.join(dst, "index.html"), "utf8");
if (/fonts\.googleapis|fonts\.gstatic/.test(indexHtml)) throw new Error("index.html 仍引用外网字体");
if (!indexHtml.includes('src="/ontology-playground/')) throw new Error("base 路径不对（Windows Git Bash 下请设置 MSYS_NO_PATHCONV=1）");
console.log("已更新 public/ontology-playground（记得同步更新 NOTICE.md 里的版本号）");

import "server-only";
import type { Sqlite } from "@/lib/db";
import { parseJson } from "./engine";
import { glossaryFor } from "./glossary";
import { SOURCE_KINDS } from "./schema";

/**
 * 第 7、8 步：按“已认证 / 已确认”的本体自动生成成果（不调用模型）
 *   · 路演 HTML：问题 → 证据 → 方案 → 迭代 → 指标，自包含、离线可播（方向键或点击翻页）
 *   · 项目档案：证据链、版本、决策日志与操作统计（不含任何个人姓名与账号）
 * 所有文字都做 HTML 转义；不引用外网字体、脚本或图片。
 */

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
const ok = "status in ('certified','confirmed')";
const VERDICT: Record<string, string> = { keep: "保留", modify: "修改", drop: "放弃" };
const kindLabel = (k: string) => SOURCE_KINDS.find((x) => x.value === k)?.label || k;

type Row = Record<string, unknown>;
function load(c: Sqlite, projectId: string) {
  const all = (table: string) => c.prepare(`select * from ${table} where project_id = ? and ${ok} order by created_at, rowid`).all(projectId) as Row[];
  const project = c.prepare("select id, name from projects where id = ?").get(projectId) as { id: string; name: string };
  const links = c.prepare("select link_type, src_type, src_id, dst_type, dst_id from onto_links where project_id = ?").all(projectId) as Row[];
  return {
    project, links,
    tracks: all("track_profiles"), hmws: all("hmw_questions"), briefs: all("task_briefs"), versions: all("product_versions"),
    evidence: all("evidence_items"), reports: all("test_reports"), decisions: all("decisions"),
    glossary: glossaryFor(c, projectId).filter((g) => g.scope === "team"),
  };
}
const list = (v: unknown) => parseJson<unknown[]>(v, []).map((x) => (typeof x === "object" && x ? (x as Record<string, unknown>) : x));
const srcOf = (r: Row) => { const s = parseJson<Record<string, string>>(r.source, {}); return s.kind && s.kind !== "ai" ? `${kindLabel(s.kind)}${s.ref ? " · " + s.ref : ""}` : ""; };

const PITCH_CSS = `*{box-sizing:border-box;margin:0}body{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:#06091c;color:#e8ecff}
section{min-height:100vh;padding:7vh 8vw;display:none;flex-direction:column;justify-content:center;gap:2.2vh}section.on{display:flex}
h1{font-size:5.2vh;line-height:1.25}h2{font-size:4vh;color:#7dd3fc}p,li{font-size:2.6vh;line-height:1.7;color:#cbd5f5}
.tag{display:inline-block;font-size:1.8vh;padding:.3vh 1.2vh;border:1px solid #7dd3fc66;border-radius:99px;color:#7dd3fc;margin-right:1vh}
.q{border-left:4px solid #fbbf24;padding-left:2vh;color:#fde68a}.src{font-size:1.9vh;color:#8a94b8}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(28vw,1fr));gap:2vh}.card{border:1px solid #33407a;border-radius:14px;padding:2.4vh;background:#0c1333}
.big{font-size:6vh;font-weight:800;color:#34d399}.nav{position:fixed;right:2vw;bottom:2vh;font-size:1.8vh;color:#64748b}`;

export function renderPitch(c: Sqlite, projectId: string) {
  const d = load(c, projectId);
  const empty = !d.tracks.length && !d.hmws.length && !d.evidence.length;
  const slides: string[] = [];
  const track = d.tracks[0];
  slides.push(`<section><span class="tag">路演</span><h1>${esc(d.project.name)}</h1>
    ${track ? `<p>${esc(track.track)}${track.audience ? " · 面向" + esc(track.audience) : ""}</p><p>${esc(track.summary)}</p>` : ""}
    <p class="src">本页由项目本体中学生已认证的内容自动生成 · 计分只认证据</p></section>`);
  if (d.hmws.length) slides.push(`<section><h2>我们要解决的问题</h2>${d.hmws.map((h) => `<div class="card"><p><b>${esc(h.text)}</b></p>${h.user_quote ? `<p class="q">“${esc(h.user_quote)}”</p>` : ""}${h.rationale ? `<p class="src">${esc(h.rationale)}</p>` : ""}</div>`).join("")}</section>`);
  if (d.evidence.length) slides.push(`<section><h2>真实用户证据</h2><div class="grid">${d.evidence.slice(0, 8).map((e) => `<div class="card"><p>${esc(e.content)}</p>${e.quote ? `<p class="q">“${esc(e.quote)}”</p>` : ""}<p class="src">${esc(srcOf(e))}${e.sample_n ? ` · 样本 ${esc(e.sample_n)}` : ""}</p></div>`).join("")}</div></section>`);
  const brief = d.briefs[0];
  if (brief) slides.push(`<section><h2>方案：${esc(brief.title)}</h2><p>${esc(brief.goal)}</p><ul>${list(brief.features).map((f) => `<li>${esc(f)}</li>`).join("")}</ul>${list(brief.metrics).length ? `<p class="src">验证指标：${list(brief.metrics).map(esc).join("；")}</p>` : ""}</section>`);
  if (d.versions.length) slides.push(`<section><h2>版本迭代</h2><div class="grid">${d.versions.map((v) => `<div class="card"><p><b>${esc(v.label)}</b></p><p>${esc(v.summary)}</p><ul>${list(v.changes).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}</div></section>`);
  if (d.decisions.length) slides.push(`<section><h2>用证据做的决定</h2>${d.decisions.map((x) => `<div class="card"><p><span class="tag">${esc(VERDICT[String(x.verdict)] || x.verdict)}</span><b>${esc(x.subject)}</b></p><p class="src">${esc(x.rationale)}</p></div>`).join("")}</section>`);
  const metrics = d.reports.flatMap((r) => list(r.metrics).filter((m) => typeof m === "object") as Record<string, unknown>[]);
  if (d.reports.length) slides.push(`<section><h2>测试结果</h2>${metrics.length ? `<div class="grid">${metrics.slice(0, 6).map((m) => `<div class="card"><div class="big">${esc(m.value)}${esc(m.unit)}</div><p>${esc(m.name)}</p></div>`).join("")}</div>` : ""}${d.reports.map((r) => `<p>${esc(r.summary)}</p>`).join("")}</section>`);
  slides.push(`<section><h2>谢谢</h2><p>${esc(d.project.name)} · 下一步：带着新的假设回到现实验证</p></section>`);
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.project.name)} · 路演</title><style>${PITCH_CSS}</style></head><body>
${slides.join("\n")}
<div class="nav">← → 翻页 · <span id="n"></span></div>
<script>(function(){var s=document.querySelectorAll("section"),i=0;function go(k){i=Math.max(0,Math.min(s.length-1,k));s.forEach(function(x,j){x.classList.toggle("on",j===i)});document.getElementById("n").textContent=(i+1)+" / "+s.length}
document.addEventListener("keydown",function(e){if(e.key==="ArrowRight"||e.key===" "||e.key==="PageDown")go(i+1);if(e.key==="ArrowLeft"||e.key==="PageUp")go(i-1)});document.addEventListener("click",function(e){go(e.clientX>innerWidth/2?i+1:i-1)});go(0)})();</script>
</body></html>`;
  return { title: `${d.project.name} · 路演`, html, data: { slides: slides.length }, empty };
}

const ARCH_CSS = `body{font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;max-width:960px;margin:0 auto;padding:32px 20px;color:#1f2937;line-height:1.7}
h1{font-size:26px}h2{font-size:19px;margin-top:28px;border-bottom:1px solid #e5e7eb;padding-bottom:6px}table{border-collapse:collapse;width:100%;font-size:14px}
td,th{border:1px solid #e5e7eb;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f9fafb}.q{color:#92400e}.m{color:#6b7280;font-size:13px}`;

export function renderArchive(c: Sqlite, projectId: string) {
  const d = load(c, projectId);
  const total = d.tracks.length + d.hmws.length + d.briefs.length + d.versions.length + d.evidence.length + d.reports.length + d.decisions.length;
  const audit = c.prepare(
    "select action, actor_kind, count(*) n from onto_audit where project_id = ? and ok = 1 group by action, actor_kind order by action"
  ).all(projectId) as { action: string; actor_kind: string; n: number }[];
  const cites = (id: unknown) => d.links.filter((l) => l.link_type === "cites" && l.src_id === id).map((l) => {
    const e = d.evidence.find((x) => x.id === l.dst_id) || d.reports.find((x) => x.id === l.dst_id);
    return e ? esc(e.content || e.title) : "";
  }).filter(Boolean).join("；");
  const sec = (title: string, body: string) => `<h2>${title}</h2>${body}`;
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.project.name)} · 项目档案</title><style>${ARCH_CSS}</style></head><body>
<h1>${esc(d.project.name)} · 项目档案</h1>
<p class="m">归档时间：${esc(new Date().toLocaleString("zh-CN", { hour12: false, timeZone: "Asia/Shanghai" }))} · 只收录学生已认证 / 教师已确认的内容 · 不含个人姓名</p>
${sec("赛道画像", d.tracks.map((t) => `<p><b>${esc(t.title)}</b>（${esc(t.track)}）面向 ${esc(t.audience)}。${esc(t.summary)}</p>`).join("") || "<p class='m'>无</p>")}
${sec("HMW 问题", d.hmws.map((h) => `<p><b>${esc(h.text)}</b>${h.user_quote ? `<br><span class="q">“${esc(h.user_quote)}”</span>` : ""}</p>`).join("") || "<p class='m'>无</p>")}
${sec("证据链", d.evidence.length ? `<table><tr><th>证据</th><th>原话 / 记录</th><th>来源</th><th>样本</th></tr>${d.evidence.map((e) => `<tr><td>${esc(e.content)}</td><td class="q">${esc(e.quote)}</td><td>${esc(srcOf(e))}</td><td>${esc(e.sample_n ?? "")}</td></tr>`).join("")}</table>` : "<p class='m'>无</p>")}
${sec("产品任务书", d.briefs.map((b) => `<p><b>${esc(b.title)}</b>：${esc(b.goal)}</p><p class="m">功能：${list(b.features).map(esc).join("；")}　指标：${list(b.metrics).map(esc).join("；")}</p>`).join("") || "<p class='m'>无</p>")}
${sec("版本", d.versions.map((v) => `<p><b>${esc(v.label)}</b> ${esc(v.summary)}<br><span class="m">${list(v.changes).map(esc).join("；")}</span></p>`).join("") || "<p class='m'>无</p>")}
${sec("测试报告", d.reports.map((r) => `<p><b>${esc(r.title)}</b>：${esc(r.summary)}</p>`).join("") || "<p class='m'>无</p>")}
${sec("决策日志", d.decisions.length ? `<table><tr><th>决定</th><th>针对</th><th>理由</th><th>依据</th></tr>${d.decisions.map((x) => `<tr><td>${esc(VERDICT[String(x.verdict)] || x.verdict)}</td><td>${esc(x.subject)}</td><td>${esc(x.rationale)}</td><td>${cites(x.id)}</td></tr>`).join("")}</table>` : "<p class='m'>无</p>")}
${sec("术语口径", d.glossary.map((g) => `<p><b>${esc(g.term)}</b>：${esc(g.definition)}</p>`).join("") || "<p class='m'>无</p>")}
${sec("人判断 / AI 执行 · 操作统计", `<table><tr><th>操作</th><th>执行方</th><th>次数</th></tr>${audit.map((a) => `<tr><td>${esc(a.action)}</td><td>${a.actor_kind === "ai" ? "AI 起草" : "人"}</td><td>${a.n}</td></tr>`).join("")}</table>`)}
</body></html>`;
  return {
    title: `${d.project.name} · 项目档案`, html, empty: total === 0,
    data: { counts: { track: d.tracks.length, hmw: d.hmws.length, brief: d.briefs.length, version: d.versions.length, evidence: d.evidence.length, report: d.reports.length, decision: d.decisions.length } },
  };
}

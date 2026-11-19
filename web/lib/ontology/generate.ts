import "server-only";
import type { Sqlite } from "@/lib/db";
import { TYPE_BY_KEY } from "./schema";
import { isVerbatim, norm, pickJson } from "./extract";
import { parseJson } from "./engine";
import { glossaryFor, glossaryPrompt } from "./glossary";

/**
 * 产品线半自动化 · AI 起草本步
 *   · 依据：本项目“已认证 / 已确认”的对象（人认过的才算数）+ 术语口径；第 1、5 步另附调研资料原文
 *   · 输出：本步需要的草稿对象与关系；全部是草稿，学生认证后才生效
 *   · 校验：引用编号必须存在且类型正确；测试报告的数字与原话必须在资料原文中查到；
 *           V0.2 的“保留 / 修改 / 放弃”建议必须引用已认证证据，否则丢弃
 */

export type GenStep = "track" | "brief" | "v01" | "test" | "v02";
export const GEN_STEPS: GenStep[] = ["track", "brief", "v01", "test", "v02"];
export const GEN_LABEL: Record<GenStep, string> = {
  track: "赛道画像", brief: "产品任务书", v01: "V0.1 与测试问卷", test: "测试报告与证据", v02: "迭代决策与 V0.2",
};

const PREFIX: Record<string, string> = {
  track_profile: "T", hmw: "H", evidence: "E", task_brief: "B", product_version: "V", test_report: "R", decision: "D",
};
const ok = "status in ('certified','confirmed')";

export type Ref = { type: string; id: string };
export type GenContext = { text: string; refs: Record<string, Ref>; materials: { key: string; name: string; text: string }[]; glossary: string };

function count(c: Sqlite, table: string, projectId: string, cond = ok) {
  return Number((c.prepare(`select count(*) n from ${table} where project_id = ? and ${cond}`).get(projectId) as { n: number }).n);
}

/** 前置条件：不满足时返回提示（不调用模型） */
export function precheck(c: Sqlite, projectId: string, step: GenStep): string | null {
  const mats = count(c, "materials", projectId, "1 = 1");
  if (step === "track" && mats === 0 && count(c, "evidence_items", projectId) === 0) return "先上传调研资料（项目本体页），AI 才有依据起草赛道画像";
  if (step === "brief" && count(c, "hmw_questions", projectId) === 0) return "先认证至少 1 个 HMW 问题，再起草任务书";
  if (step === "v01" && count(c, "task_briefs", projectId) === 0) return "先认证产品任务书，再起草 V0.1";
  if (step === "test") {
    if (count(c, "product_versions", projectId) === 0) return "先发布 V0.1，再整理测试报告";
    if (count(c, "materials", projectId, "kind in ('test','survey','interview','observation')") === 0) return "先上传测试结果（问卷、访谈或实测记录），AI 才能汇总测试报告";
  }
  if (step === "v02") {
    if (count(c, "product_versions", projectId) === 0) return "先发布 V0.1";
    if (count(c, "evidence_items", projectId) + count(c, "test_reports", projectId) === 0) return "先认证至少 1 条证据或测试报告，迭代决策必须有依据";
  }
  return null;
}

/** 已认证对象编号成文，并附上调研资料（第 1、5 步） */
export function buildContext(c: Sqlite, projectId: string, step: GenStep): GenContext {
  const refs: Record<string, Ref> = {};
  const lines: string[] = [];
  for (const type of ["track_profile", "hmw", "task_brief", "product_version", "evidence", "test_report", "decision"]) {
    const t = TYPE_BY_KEY[type];
    const rows = c.prepare(`select * from ${t.table} where project_id = ? and ${ok} order by created_at, rowid`).all(projectId) as Record<string, unknown>[];
    rows.forEach((r, i) => {
      const key = `${PREFIX[type]}${i + 1}`;
      refs[key] = { type, id: String(r.id) };
      const body = t.fields.map((f) => {
        const v = r[f.key];
        const s = f.kind === "list" || f.kind === "json" ? parseJson<unknown[]>(v, []).map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join("；") : String(v ?? "");
        return s ? `${f.label}：${s}` : "";
      }).filter(Boolean).join("；").slice(0, 400);
      lines.push(`[${key}] ${t.label}｜${body}`);
    });
  }
  const materials: GenContext["materials"] = [];
  if (step === "track" || step === "test") {
    const cond = step === "test" ? "and kind in ('test','survey','interview','observation')" : "";
    const ms = c.prepare(`select name, text from materials where project_id = ? ${cond} order by created_at desc, rowid desc limit 3`).all(projectId) as { name: string; text: string }[];
    let budget = 6000;
    ms.forEach((m, i) => {
      const text = m.text.slice(0, Math.max(0, Math.min(3000, budget)));
      budget -= text.length;
      if (text) materials.push({ key: `M${i + 1}`, name: m.name, text });
    });
  }
  const glossary = glossaryPrompt(glossaryFor(c, projectId));
  const text = [
    lines.length ? `【本项目已认证的对象】\n${lines.join("\n")}` : "【本项目已认证的对象】（暂无）",
    materials.length ? `【调研 / 测试资料原文】\n${materials.map((m) => `[${m.key}] 《${m.name}》\n${m.text}`).join("\n\n")}` : "",
    glossary,
  ].filter(Boolean).join("\n\n");
  return { text, refs, materials, glossary };
}

const SCHEMA: Record<GenStep, string> = {
  track: `{"track":{"title":"","track":"","audience":"","summary":"","trends":[""],"opportunities":[""]}}`,
  brief: `{"brief":{"title":"","goal":"","features":[""],"metrics":[""],"risks":[""],"addresses":["H1"]}}`,
  v01: `{"version":{"summary":"","changes":["V0.1 包含的功能"],"implements":["B1"],"addresses":["H1"]},"questionnaire":["测试问卷的题目"]}`,
  test: `{"report":{"title":"","summary":"","metrics":[{"name":"","value":"","unit":"","source":"M1"}],"findings":[""]},"evidence":[{"kind":"test","content":"","quote":"","sample_n":null,"source":"M1"}]}`,
  v02: `{"decisions":[{"verdict":"keep|modify|drop","subject":"","rationale":"","cites":["E1"],"about":["B1"]}],"version":{"summary":"","changes":[""]}}`,
};
const TASK: Record<GenStep, string> = {
  track: "根据资料与已认证对象，起草一个赛道画像：所在赛道、目标人群、现状概述、趋势与机会点。",
  brief: "根据已认证的 HMW 问题与证据，起草一份产品任务书：要解决的问题与目标、功能清单（只列最小可行范围）、验证指标（可量化）、风险。addresses 填它回应的 HMW 编号。",
  v01: "根据已认证的任务书，起草 V0.1 的版本说明（能让真实用户试用的最小版本）与功能清单；再起草一份 5–8 题的用户测试问卷，用来验证任务书里的指标。implements 填实现的任务书编号。",
  test: "根据【调研 / 测试资料原文】汇总 V0.1 的测试报告：结论摘要、指标结果（每项写明 source 资料编号，数值必须是原文里出现过的）、主要发现；并抽取证据（quote 必须从对应资料逐字摘录，source 填资料编号）。",
  v02: "根据已认证的证据与测试报告，逐条给出“保留 keep / 修改 modify / 放弃 drop”的迭代决策：subject 写针对什么，rationale 写理由，cites 必须引用支撑它的已认证证据（E）或测试报告（R）编号，about 可引用任务书（B）或版本（V）。再起草 V0.2 的版本说明与相对上一版的改动清单。",
};

/** 起草提示词（含标记“产品线起草:步骤”，便于本机模拟模型识别） */
export function genMessages(step: GenStep, ctx: GenContext) {
  const system = `你是创新创业课程的产品线助手（产品线起草:${step}）。人判断、AI 执行：你只起草，学生会逐条认证。
任务：${TASK[step]}
规则：只依据下面给出的已认证对象与资料，不编造数据、原话、受访者；引用对象时只用给出的编号（如 H1、E2）；遇到术语按口径理解；不写任何个人姓名。
只输出 JSON：${SCHEMA[step]}`;
  return [{ role: "system" as const, content: system }, { role: "user" as const, content: ctx.text }];
}

const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : typeof v === "number" ? String(v) : "");
const arr = (v: unknown, n = 12, m = 200) => (Array.isArray(v) ? v.map((x) => s(x, m)).filter(Boolean).slice(0, n) : []);

/** 把引用编号换成对象；只保留指定类型 */
function resolve(keys: unknown, ctx: GenContext, types: string[]): Ref[] {
  return arr(keys, 8, 10).map((k) => ctx.refs[k]).filter((r): r is Ref => !!r && types.includes(r.type));
}

export type GenPlan = {
  track?: { title: string; track: string; audience: string; summary: string; trends: string[]; opportunities: string[] };
  brief?: { title: string; goal: string; features: string[]; metrics: string[]; risks: string[]; addresses: Ref[] };
  version?: { summary: string; changes: string[]; implements: Ref[]; addresses: Ref[]; questionnaire: string[] };
  report?: { title: string; summary: string; metrics: { name: string; value: string; unit: string }[]; findings: string[] };
  evidence?: { kind: string; content: string; quote: string; sample_n: number | null; material: string }[];
  decisions?: { verdict: string; subject: string; rationale: string; cites: Ref[]; about: Ref[] }[];
};

/** 规范化 + 校验 */
export function verifyPlan(step: GenStep, raw: string, ctx: GenContext): { plan: GenPlan; warnings: string[] } {
  const j = pickJson(raw) || {};
  const warnings: string[] = [];
  const plan: GenPlan = {};
  const o = (k: string) => (j[k] && typeof j[k] === "object" ? (j[k] as Record<string, unknown>) : null);

  if (step === "track") {
    const t = o("track");
    if (t && (s(t.title, 80) || s(t.track, 60))) {
      plan.track = { title: s(t.title, 80) || s(t.track, 60), track: s(t.track, 60), audience: s(t.audience, 200), summary: s(t.summary, 2000), trends: arr(t.trends), opportunities: arr(t.opportunities) };
    }
  }
  if (step === "brief") {
    const b = o("brief");
    if (b && s(b.title, 80)) {
      plan.brief = { title: s(b.title, 80), goal: s(b.goal, 1000), features: arr(b.features), metrics: arr(b.metrics), risks: arr(b.risks), addresses: resolve(b.addresses, ctx, ["hmw"]) };
      if (!plan.brief.addresses.length) warnings.push("任务书没有对应到已认证的 HMW 问题，请认证前手动建立“回应”关系");
    }
  }
  if (step === "v01" || step === "v02") {
    const v = o("version");
    if (v && (s(v.summary, 2000) || arr(v.changes).length)) {
      plan.version = {
        summary: s(v.summary, 2000), changes: arr(v.changes),
        implements: resolve(v.implements, ctx, ["task_brief"]), addresses: resolve(v.addresses, ctx, ["hmw"]),
        questionnaire: step === "v01" ? arr(j.questionnaire, 10, 200) : [],
      };
    }
  }
  if (step === "test") {
    const r = o("report");
    const byKey = Object.fromEntries(ctx.materials.map((m) => [m.key, m]));
    const all = ctx.materials.map((m) => m.text).join("\n");
    if (r && (s(r.title, 80) || s(r.summary, 2000))) {
      const metrics: { name: string; value: string; unit: string }[] = [];
      for (const m of (Array.isArray(r.metrics) ? r.metrics : []).slice(0, 10) as Record<string, unknown>[]) {
        const name = s(m?.name, 60), value = s(m?.value, 30), unit = s(m?.unit, 20);
        if (!name || !value) continue;
        const src = byKey[s(m?.source, 10)]?.text || all;
        if (!norm(src).includes(norm(value))) { warnings.push(`指标「${name}」的数值 ${value} 在测试资料中找不到，已剔除`); continue; }
        metrics.push({ name, value, unit });
      }
      plan.report = { title: s(r.title, 80) || "V0.1 测试报告", summary: s(r.summary, 2000), metrics, findings: arr(r.findings) };
    }
    const evs: GenPlan["evidence"] = [];
    for (const e of (Array.isArray(j.evidence) ? j.evidence : []).slice(0, 10) as Record<string, unknown>[]) {
      const content = s(e?.content, 300);
      if (!content) continue;
      const mat = byKey[s(e?.source, 10)] || ctx.materials[0];
      let quote = s(e?.quote, 300);
      if (quote && !(mat && isVerbatim(quote, mat.text))) { warnings.push(`证据「${content.slice(0, 20)}」的原话在资料中找不到，已清空`); quote = ""; }
      const n = Number(e?.sample_n);
      evs.push({
        kind: ["interview", "survey", "test", "observation", "document", "data"].includes(String(e?.kind)) ? String(e.kind) : "test",
        content, quote, sample_n: e?.sample_n === null || e?.sample_n === undefined || !Number.isFinite(n) || !(mat && mat.text.includes(String(n))) ? null : n,
        material: mat?.name || "",
      });
    }
    plan.evidence = evs;
  }
  if (step === "v02") {
    const ds: NonNullable<GenPlan["decisions"]> = [];
    for (const d of (Array.isArray(j.decisions) ? j.decisions : []).slice(0, 8) as Record<string, unknown>[]) {
      const subject = s(d?.subject, 200);
      if (!subject) continue;
      const verdict = ["keep", "modify", "drop"].includes(String(d?.verdict)) ? String(d.verdict) : "";
      const cites = resolve(d?.cites, ctx, ["evidence", "test_report"]);
      if (!verdict) { warnings.push(`建议「${subject.slice(0, 20)}」没有给出保留 / 修改 / 放弃，已丢弃`); continue; }
      if (!cites.length) { warnings.push(`建议「${subject.slice(0, 20)}」没有引用已认证的证据，已丢弃`); continue; }
      ds.push({ verdict, subject, rationale: s(d?.rationale, 1000), cites, about: resolve(d?.about, ctx, ["task_brief", "product_version", "hypothesis"]) });
    }
    plan.decisions = ds;
  }
  return { plan, warnings };
}

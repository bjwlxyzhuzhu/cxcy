import "server-only";
import { SOURCE_KINDS } from "./schema";

/**
 * AI 自动建本体 · 抽取与校验
 *   1. 提示词：只抽取、不判断、不补充资料里没有的信息
 *   2. 规范化：把模型返回的 JSON 收敛成固定结构，限制条数与长度
 *   3. 防编造：原话必须能在原文里逐字找到；样本量数字必须在原文出现；找不到的清空并给出提醒
 * 抽取结果只是草稿（origin=ai），必须由学生逐条认证后才能用于决策与计分。
 */

export type DraftEvidence = { ref: string; kind: string; content: string; quote: string; sample_n: number | null; collected_at: string; verbatim: boolean; quote_removed?: boolean };
export type DraftHmw = { ref: string; text: string; user_quote: string; rationale: string; based_on: string[]; verbatim: boolean; quote_removed?: boolean };
export type DraftTrack = { title: string; track: string; audience: string; summary: string } | null;
export type Draft = { evidence: DraftEvidence[]; hmw: DraftHmw[]; track: DraftTrack };

const EVIDENCE_KINDS = ["interview", "survey", "test", "observation", "document", "data"];
const MAX_EVIDENCE = 12, MAX_HMW = 5;

export const kindLabel = (k: string) => SOURCE_KINDS.find((x) => x.value === k)?.label || k;

/** 抽取提示词（含标记“本体抽取”，便于本机模拟模型识别） */
export function extractMessages(material: { kind: string; ref_note: string; text: string }) {
  const system = `你是创新创业课程的“项目本体”整理助手（本体抽取）。你只做抽取，不做判断，不补充资料里没有的信息。
从【资料原文】中抽取：
1. evidence：可作为证据的具体事实（受访者说了什么、问卷数据、实测结果、观察到的现象）。每条字段：
   ref（e1、e2…）、kind（interview/survey/test/observation/document/data 之一）、content（一句话摘要，≤80 字）、
   quote（从原文逐字摘录的一段，≤120 字，必须与原文完全一致；找不到合适的原文就留空字符串）、
   sample_n（原文明确写出的样本量数字，没有就 null）、collected_at（原文写明的日期，没有就空字符串）。最多 ${MAX_EVIDENCE} 条。
2. hmw：由证据引出的“我们如何……”问题，最多 ${MAX_HMW} 条。字段：ref（h1…）、text（以“我们如何”开头）、
   user_quote（引发这个问题的原文原话，逐字摘录，没有就空）、rationale（为什么值得做，≤80 字）、based_on（引用的 evidence ref 列表）。
3. track：如果资料能看出所在赛道/行业与目标人群，给出 {"title","track","audience","summary"}；看不出就 null。
规则：不要编造数字、原话、日期、受访者身份；资料里没有的一律留空。不要输出任何个人姓名、电话、单位全称。
只输出 JSON：{"evidence":[...],"hmw":[...],"track":null}`;
  const user = `资料类型：${kindLabel(material.kind)}\n出处说明：${material.ref_note || "（未填写）"}\n【资料原文】\n${material.text}`;
  return [{ role: "system" as const, content: system }, { role: "user" as const, content: user }];
}

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** 从模型输出里取 JSON（容忍前后多余文字与代码块） */
export function pickJson(raw: string): Record<string, unknown> | null {
  try { return JSON.parse(raw); } catch { /* 继续 */ }
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/** 规范化模型输出 */
export function normalizeDraft(j: Record<string, unknown> | null): Draft {
  const ev = Array.isArray(j?.evidence) ? (j!.evidence as Record<string, unknown>[]) : [];
  const hm = Array.isArray(j?.hmw) ? (j!.hmw as Record<string, unknown>[]) : [];
  const evidence: DraftEvidence[] = ev.slice(0, MAX_EVIDENCE).map((e, i) => {
    const n = Number(e?.sample_n);
    return {
      ref: s(e?.ref, 10) || `e${i + 1}`,
      kind: EVIDENCE_KINDS.includes(String(e?.kind)) ? String(e.kind) : "document",
      content: s(e?.content, 200), quote: s(e?.quote, 300),
      sample_n: e?.sample_n === null || e?.sample_n === undefined || e?.sample_n === "" || !Number.isFinite(n) ? null : Math.max(0, Math.floor(n)),
      collected_at: s(e?.collected_at, 20), verbatim: false,
    };
  }).filter((e) => e.content);
  const hmw: DraftHmw[] = hm.slice(0, MAX_HMW).map((h, i) => ({
    ref: s(h?.ref, 10) || `h${i + 1}`, text: s(h?.text, 200), user_quote: s(h?.user_quote, 300), rationale: s(h?.rationale, 300),
    based_on: Array.isArray(h?.based_on) ? (h.based_on as unknown[]).map((x) => s(x, 10)).filter(Boolean).slice(0, 6) : [],
    verbatim: false,
  })).filter((h) => h.text);
  const t = j?.track && typeof j.track === "object" ? (j.track as Record<string, unknown>) : null;
  const track: DraftTrack = t && (s(t.track, 60) || s(t.title, 80))
    ? { title: s(t.title, 80) || s(t.track, 60), track: s(t.track, 60), audience: s(t.audience, 200), summary: s(t.summary, 1000) }
    : null;
  return { evidence, hmw, track };
}

/** 比对用的规范化：去空白与引号，全角转半角，统一大小写 */
export function norm(x: string): string {
  return x
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\s　"'“”‘’「」『』]/g, "")
    .replace(/[，]/g, ",").replace(/[。]/g, ".").replace(/[：]/g, ":").replace(/[；]/g, ";")
    .toLowerCase();
}

/** 原话是否能在原文中逐字找到（规范化后比对；太短的不算） */
export function isVerbatim(quote: string, text: string): boolean {
  const q = norm(quote);
  return q.length >= 4 && norm(text).includes(q);
}

/** 数字是否在原文出现（阿拉伯数字，或 1–99 的常见汉字写法） */
function numberInText(n: number, text: string): boolean {
  if (new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(text)) return true;
  if (n <= 0 || n >= 100) return false;
  const d = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const forms = new Set<string>();
  if (n < 10) { forms.add(d[n]); if (n === 2) forms.add("两"); }
  else {
    const t = Math.floor(n / 10), u = n % 10;
    forms.add((t === 1 ? "十" : d[t] + "十") + d[u]);
    if (t === 1) forms.add("一十" + d[u]);
  }
  return [...forms].some((f) => f && text.includes(f));
}

/** 防编造校验：清空找不到出处的原话与样本量，返回提醒 */
export function verifyDraft(text: string, d: Draft): { draft: Draft; warnings: string[] } {
  const warnings: string[] = [];
  for (const e of d.evidence) {
    if (e.quote) {
      e.verbatim = isVerbatim(e.quote, text);
      if (!e.verbatim) { warnings.push(`证据「${e.content.slice(0, 20)}」的原话在资料中找不到，已清空，请人工补充`); e.quote = ""; e.quote_removed = true; }
    }
    if (e.sample_n !== null && !numberInText(e.sample_n, text)) {
      warnings.push(`证据「${e.content.slice(0, 20)}」的样本量 ${e.sample_n} 在资料中找不到，已清空`);
      e.sample_n = null;
    }
    if (e.collected_at && !text.includes(e.collected_at)) e.collected_at = "";
  }
  const refs = new Set(d.evidence.map((e) => e.ref));
  for (const h of d.hmw) {
    if (h.user_quote) {
      h.verbatim = isVerbatim(h.user_quote, text);
      if (!h.verbatim) { warnings.push(`问题「${h.text.slice(0, 20)}」引用的原话在资料中找不到，已清空`); h.user_quote = ""; h.quote_removed = true; }
    }
    h.based_on = h.based_on.filter((r) => refs.has(r));
  }
  return { draft: d, warnings };
}

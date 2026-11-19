import "server-only";
import type { Sqlite } from "@/lib/db";
import { TYPE_BY_KEY } from "./schema";
import { isVerbatim, norm, pickJson } from "./extract";
import { parseJson } from "./engine";
import type { GlossaryDraft } from "./actions/glossary";

/**
 * 口径与术语表
 *   · 口径检查：AI 读本队全部资料与对象，找出“同一个词、不同说法”（一个数，三个人答），起草术语定义
 *   · 防编造：术语必须真的出现在资料里；每种说法引用的原文必须在它标注的来源里逐字找到
 *   · 口径上下文：把“人认过”的口径整理成文字，交给平台里的 AI 角色（机器懂）
 */

export type GSource = { key: string; label: string; text: string };

const OBJ_TYPES = ["track_profile", "hmw", "task_brief", "product_version", "evidence", "test_report", "decision"];

/** 收集本队可供检查的原文：调研资料 + 未驳回的本体对象 */
export function collectSources(c: Sqlite, projectId: string, maxTotal = 10000): GSource[] {
  const out: GSource[] = [];
  let total = 0;
  const mats = c.prepare("select name, text from materials where project_id = ? order by created_at, rowid").all(projectId) as { name: string; text: string }[];
  mats.forEach((m, i) => {
    const text = m.text.slice(0, Math.max(0, Math.min(3000, maxTotal - total)));
    if (!text) return;
    total += text.length;
    out.push({ key: `M${i + 1}`, label: `资料《${m.name}》`, text });
  });
  let n = 0;
  for (const type of OBJ_TYPES) {
    const t = TYPE_BY_KEY[type];
    const rows = c.prepare(`select * from ${t.table} where project_id = ? and status <> 'rejected' order by created_at, rowid`).all(projectId) as Record<string, unknown>[];
    for (const r of rows) {
      const text = t.fields.map((f) => {
        const v = r[f.key];
        const s = f.kind === "list" || f.kind === "json" ? parseJson<unknown[]>(v, []).join("；") : String(v ?? "");
        return s ? `${f.label}：${s}` : "";
      }).filter(Boolean).join("\n").slice(0, 800);
      if (!text || total + text.length > maxTotal) continue;
      total += text.length;
      n++;
      out.push({ key: `O${n}`, label: `${t.label}「${String(r[t.titleField] ?? "").slice(0, 20)}」`, text });
    }
  }
  return out;
}

/** 口径检查提示词（含标记“口径对齐”，便于本机模拟模型识别） */
export function glossaryMessages(sources: GSource[], existing: { term: string; definition: string }[]) {
  const system = `你是创新创业课程的“口径对齐”助手。同一个说法，团队里不同的人、不同的资料可能指的不是一回事（比如“复购率”有人按下单算、有人按付款算）。
任务：
1. 从下面编号的原文里找出这个项目的关键术语（目标用户、付费意愿、试用成功、复购率、转化率、获客成本等，以原文实际出现的为准），最多 8 个。
2. 为每个术语起草一个清晰的定义（definition）和计算方式（formula，没有就空），列出原文里出现的同义说法（aliases）。
3. 如果同一术语在不同原文里含义或算法不一致，在 variants 里列出每种说法：meaning（这种说法的含义）、source（原文编号，如 M1、O2）、quote（从该原文逐字摘录的一句，必须完全一致）。没有不一致就给空数组。
规则：只用原文里有的信息，不编造术语、数字和原话；不输出个人姓名。
只输出 JSON：{"terms":[{"term":"","definition":"","formula":"","aliases":[],"variants":[{"meaning":"","source":"M1","quote":""}]}]}`;
  const ex = existing.length ? `\n【本队已有术语】\n${existing.map((e) => `- ${e.term}：${e.definition}`).join("\n")}` : "";
  const user = `【原文】\n${sources.map((s) => `[${s.key}] ${s.label}\n${s.text}`).join("\n\n")}${ex}`;
  return [{ role: "system" as const, content: system }, { role: "user" as const, content: user }];
}

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** 规范化 + 防编造校验 */
export function verifyGlossary(raw: string, sources: GSource[]): { terms: GlossaryDraft[]; warnings: string[] } {
  const j = pickJson(raw);
  const arr = Array.isArray(j?.terms) ? (j!.terms as Record<string, unknown>[]) : [];
  const byKey = Object.fromEntries(sources.map((x) => [x.key, x]));
  const all = norm(sources.map((x) => x.text).join("\n"));
  const warnings: string[] = [];
  const terms: GlossaryDraft[] = [];
  for (const t of arr.slice(0, 8)) {
    const term = s(t?.term, 40);
    if (!term) continue;
    const aliases = Array.isArray(t?.aliases) ? (t.aliases as unknown[]).map((x) => s(x, 40)).filter(Boolean).slice(0, 8) : [];
    // 术语（或其同义说法）必须真的出现在原文里
    if (![term, ...aliases].some((w) => w && all.includes(norm(w)))) {
      warnings.push(`术语「${term}」在资料里找不到，已忽略`);
      continue;
    }
    const conflicts: GlossaryDraft["conflicts"] = [];
    const seen = new Set<string>();
    for (const v of (Array.isArray(t?.variants) ? (t.variants as Record<string, unknown>[]) : []).slice(0, 6)) {
      const src = byKey[s(v?.source, 10)];
      const quote = s(v?.quote, 200), meaning = s(v?.meaning, 200);
      if (!src || !quote || !meaning) continue;
      if (!isVerbatim(quote, src.text)) { warnings.push(`「${term}」的一种说法引用的原文在 ${src.label} 中找不到，已剔除`); continue; }
      const k = norm(meaning);
      if (seen.has(k)) continue;
      seen.add(k);
      conflicts.push({ meaning, where: src.label, quote });
    }
    terms.push({
      term, definition: s(t?.definition, 600), formula: s(t?.formula, 200), aliases,
      conflicts: conflicts.length >= 2 ? conflicts : [],
    });
  }
  return { terms, warnings };
}

// ───────────────────────── 口径上下文（供 AI 角色使用）─────────────────────────

export type GTerm = { term: string; definition: string; formula: string; aliases: string[]; scope: "class" | "team"; status: string };

/** 取课堂口径（教师已确认）与本队术语（已认证 / 已确认） */
export function glossaryFor(c: Sqlite, projectId: string | null): GTerm[] {
  const rows = c.prepare(
    `select term, definition, formula, aliases, status, project_id from glossary_terms
     where (project_id is null and status = 'confirmed') or (project_id = ? and status in ('certified','confirmed'))
     order by project_id is not null, term`
  ).all(projectId ?? "") as { term: string; definition: string; formula: string; aliases: string; status: string; project_id: string | null }[];
  return rows.map((r) => ({
    term: r.term, definition: r.definition, formula: r.formula, aliases: parseJson<string[]>(r.aliases, []),
    scope: r.project_id ? "team" : "class", status: r.status,
  }));
}

/** 把问题里出现的词对到术语（命中术语本身或同义说法） */
export function matchTerms(text: string, terms: GTerm[]): GTerm[] {
  const t = norm(text || "");
  return terms.filter((g) => [g.term, ...g.aliases].some((w) => w && t.includes(norm(w))));
}

/** 生成给 AI 的口径说明（只包含人认过的口径） */
export function glossaryPrompt(terms: GTerm[]): string {
  if (!terms.length) return "";
  const line = (g: GTerm) => `- ${g.term}：${g.definition}${g.formula ? `（怎么算：${g.formula}）` : ""}${g.aliases.length ? `（也叫：${g.aliases.join("、")}）` : ""}`;
  const cls = terms.filter((g) => g.scope === "class"), team = terms.filter((g) => g.scope === "team");
  return [
    cls.length ? `【课堂口径（教师确认，全班统一）】\n${cls.map(line).join("\n")}` : "",
    team.length ? `【本队术语（学生已认证）】\n${team.map(line).join("\n")}` : "",
    "遇到上面这些词，一律按这里的口径理解和回答；对方用法与口径不一致时，先指出并请对方对齐。",
  ].filter(Boolean).join("\n");
}

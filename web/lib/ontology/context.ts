import "server-only";
import type { Sqlite } from "@/lib/db";
import { TYPE_BY_KEY } from "./schema";
import { parseJson, projectRole, isTeacherSync } from "./engine";
import { glossaryFor, glossaryPrompt, matchTerms, type GTerm } from "./glossary";

/**
 * 统一 AI 上下文层（人认过 · 机器懂）
 * 平台里的 AI 角色回答前都先“查一层本体”：
 *   1. 把问题里的词对到术语口径（课堂口径 + 本队已认证术语）
 *   2. 取出与问题最相关的已认证 / 已确认对象，编号成文（〔E2〕这样的出处）
 *   3. 统一回答规则：本项目事实只能用本体里的内容并标出处；本体里没有的直说，不编造
 * 回答后再做出处校验：只保留真实存在的编号，编造的编号删掉并提示；返回出处清单供界面显示、可一路查回原对象。
 */

const PREFIX: Record<string, string> = {
  track_profile: "T", hmw: "H", task_brief: "B", product_version: "V", evidence: "E", test_report: "R", decision: "D",
};
const TYPES = Object.keys(PREFIX);

export type CiteRef = { key: string; type: string; id: string; label: string };
export type OntologyContext = {
  block: string;                       // 注入 system 的文字（无项目时只含课堂口径与通用规则）
  refs: Record<string, CiteRef>;
  terms: string[];                     // 问题里命中的术语
  projectId: string | null;
  objectCount: number;
};

/** 问题与对象文本的相关度：双字片段重合数（中文友好，无需分词） */
function bigrams(s: string): Set<string> {
  const t = s.replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2));
  return out;
}
function score(q: Set<string>, text: string): number {
  if (!q.size) return 0;
  let n = 0;
  for (const b of bigrams(text)) if (q.has(b)) n++;
  return n;
}

export const ANSWER_RULES = `【回答规则 · 人判断 / AI 执行】
1. 先把问题里的词对到【术语口径】，按口径理解和使用这些词。
2. 涉及本项目的事实（用户怎么说、数据多少、做了什么决定、版本改了什么），只能用【项目本体】里的内容，并在对应句子后用〔E2〕这样的编号标出依据。
3. 【项目本体】里没有的项目事实，直接说“项目本体里没有这条信息，建议回到现实中验证”，不要编造数据、原话、用户反馈或测试结果。
4. 通用方法和理论可以讲，但要说明那是通用知识，不是本项目的证据。`;

/** 构建上下文：项目须是本人参与的项目（或教师查看）；否则只给课堂口径与规则 */
export function ontologyContext(c: Sqlite, userId: string, projectId: string | null | undefined, question: string, maxChars = 3500): OntologyContext {
  const allowed = !!projectId && (!!projectRole(c, userId, projectId) || isTeacherSync(c, userId));
  const pid = allowed ? projectId! : null;
  const glossary: GTerm[] = glossaryFor(c, pid);
  const hit = matchTerms(question, glossary);
  const refs: Record<string, CiteRef> = {};
  const lines: { key: string; text: string; s: number }[] = [];
  const q = bigrams(question || "");

  if (pid) {
    for (const type of TYPES) {
      const t = TYPE_BY_KEY[type];
      const rows = c.prepare(`select * from ${t.table} where project_id = ? and status in ('certified','confirmed') order by created_at, rowid`).all(pid) as Record<string, unknown>[];
      rows.forEach((r, i) => {
        const key = `${PREFIX[type]}${i + 1}`;
        const body = t.fields.map((f) => {
          const v = r[f.key];
          const s = f.kind === "list" || f.kind === "json"
            ? parseJson<unknown[]>(v, []).map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join("；")
            : String(v ?? "");
          return s ? `${f.label}：${s}` : "";
        }).filter(Boolean).join("；").slice(0, 300);
        const title = String(r[t.titleField] ?? "").slice(0, 30);
        refs[key] = { key, type, id: String(r.id), label: `${t.label}：${title}` };
        // 证据与决策优先：同等相关度下更值得引用
        const bonus = type === "evidence" || type === "decision" || type === "test_report" ? 2 : 0;
        lines.push({ key, text: `〔${key}〕${t.label}｜${body}`, s: score(q, body) + bonus });
      });
    }
  }
  // 按相关度挑选，直到字数上限；没有任何重合时保留原顺序（全部都可能相关）
  lines.sort((a, b) => b.s - a.s);
  const picked: string[] = [];
  let used = 0;
  for (const l of lines) {
    if (used + l.text.length > maxChars) continue;
    picked.push(l.text);
    used += l.text.length;
  }
  const pickedKeys = new Set(picked.map((x) => x.slice(1, x.indexOf("〕"))));
  for (const k of Object.keys(refs)) if (!pickedKeys.has(k)) delete refs[k];

  const parts = [
    glossaryPrompt(glossary) ? `【术语口径】\n${glossaryPrompt(glossary)}${hit.length ? `\n本题涉及：${hit.map((g) => g.term).join("、")}` : ""}` : "",
    pid
      ? (picked.length ? `【项目本体 · 学生已认证 / 教师已确认】\n${picked.join("\n")}` : "【项目本体】本项目还没有已认证的内容。涉及本项目事实的问题，一律说明需要先认证证据或回到现实中验证。")
      : "",
    ANSWER_RULES,
  ].filter(Boolean);
  return { block: parts.join("\n\n"), refs, terms: hit.map((g) => g.term), projectId: pid, objectCount: picked.length };
}

/** 出处校验：保留真实编号，删掉编造的编号；返回用到的出处与无效编号 */
export function checkCitations(text: string, refs: Record<string, CiteRef>): { text: string; cited: CiteRef[]; invalid: string[] } {
  const cited: CiteRef[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  const out = (text || "").replace(/[〔［\[]([TBHVERD]\d{1,3})[〕］\]]/g, (m, key: string) => {
    const r = refs[key];
    if (!r) { if (!invalid.includes(key)) invalid.push(key); return ""; }
    if (!seen.has(key)) { seen.add(key); cited.push(r); }
    return `〔${key}〕`;
  });
  return { text: out, cited, invalid };
}

/** 分身对战用：对方项目的口径与已认证证据（分身据此追问，不替对方编造；不要求标出处编号） */
export function opponentBrief(c: Sqlite, projectId: string | null | undefined): string {
  const glossary = glossaryPrompt(glossaryFor(c, projectId || null));
  if (!projectId) return glossary ? `【术语口径】\n${glossary}` : "";
  const ev = c.prepare(
    "select content, quote, sample_n from evidence_items where project_id = ? and status in ('certified','confirmed') order by created_at desc limit 6"
  ).all(projectId) as { content: string; quote: string; sample_n: number | null }[];
  const dec = c.prepare(
    "select verdict, subject from decisions where project_id = ? and status in ('certified','confirmed') order by created_at desc limit 3"
  ).all(projectId) as { verdict: string; subject: string }[];
  const V: Record<string, string> = { keep: "保留", modify: "修改", drop: "放弃" };
  const lines = [
    ...ev.map((e) => `- 证据：${e.content}${e.quote ? `（原话：“${e.quote.slice(0, 60)}”）` : ""}${e.sample_n ? `，样本 ${e.sample_n}` : ""}`),
    ...dec.map((d) => `- 决策：${V[d.verdict] || d.verdict}「${d.subject}」`),
  ];
  return [
    glossary ? `【术语口径】\n${glossary}` : "",
    lines.length
      ? `【对方项目里已认证的依据】\n${lines.join("\n")}\n追问时可以针对这些依据深挖（样本够不够、怎么得出的、还缺什么）；对方没有提供的证据不要替他们编造。`
      : "【对方项目里还没有已认证的证据】可以追问他们拿什么证明，但不要替他们编造。",
  ].filter(Boolean).join("\n\n");
}

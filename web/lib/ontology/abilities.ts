import "server-only";
import type { Sqlite } from "@/lib/db";
import { parseJson } from "./engine";

/**
 * 五力能力画像（海报 LINE 02：判断力 / 共情力 / 创造力 / 反思力 / 联结力）
 * 只统计数据库里的真实记录（已认证 / 教师已确认的对象、对局计分事件），不让 AI 给人文能力打分。
 * 每一力给出“数了什么、数到多少”，雷达图分值 = 计数 × 权重，封顶 100，仅用于直观对比。
 * asOf（ISO 时间）：只数这个时间点之前已认证 / 已发生的记录——用于增值性评价（学期初 vs 现在）。
 */

export type Ability = { key: string; label: string; count: number; score: number; basis: { label: string; n: number }[] };

const ok = "status in ('certified','confirmed')";
function n(c: Sqlite, sql: string, ...p: unknown[]): number {
  return Number((c.prepare(sql).get(...p) as { n: number } | undefined)?.n || 0);
}

export function computeAbilities(c: Sqlite, projectId: string, asOf?: string): Ability[] {
  const P = projectId;
  const T = asOf || "9999-12-31T23:59:59.999Z";
  const cert = (alias = "") => `${alias}${ok} and coalesce(${alias}certified_at, ${alias}updated_at) <= ?`;
  // 判断力：挂了证据的已认证决策；教师确认的现实验证
  const decisions = n(c, `select count(*) n from decisions d where d.project_id = ? and ${cert("d.")}
    and exists (select 1 from onto_links l where l.link_type = 'cites' and l.src_type = 'decision' and l.src_id = d.id)`, P, T);
  const verified = n(c, "select count(*) n from hypotheses where project_id = ? and status = 'verified' and updated_at <= ?", P, T);
  // 共情力：带用户原话的已认证证据；引用了用户原话的已认证 HMW
  const quotes = n(c, `select count(*) n from evidence_items where project_id = ? and ${cert()} and trim(quote) <> ''`, P, T);
  const hmwQuotes = n(c, `select count(*) n from hmw_questions where project_id = ? and ${cert()} and trim(user_quote) <> ''`, P, T);
  // 创造力：已认证的备选（赛道画像、任务书的数量）；V0.2 起每个版本的实质改动条数
  const options = n(c, `select count(*) n from track_profiles where project_id = ? and ${cert()}`, P, T) + n(c, `select count(*) n from task_briefs where project_id = ? and ${cert()}`, P, T);
  const later = c.prepare(`select changes from product_versions where project_id = ? and ${cert()} order by created_at, rowid`).all(P, T) as { changes: string }[];
  const changes = later.slice(1).reduce((s, v) => s + parseJson<unknown[]>(v.changes, []).length, 0);
  // 反思力：证伪并修正；决定“修改 / 放弃”；对齐了口径冲突后重新认证的术语
  const falsified = n(c, "select count(*) n from hypotheses where project_id = ? and status = 'falsified' and updated_at <= ?", P, T);
  const revise = n(c, `select count(*) n from decisions where project_id = ? and ${cert()} and verdict in ('modify','drop')`, P, T);
  const aligned = n(c, "select count(*) n from onto_audit where project_id = ? and ok = 1 and action = 'glossary.resolve' and created_at <= ?", P, T)
    + n(c, `select count(*) n from glossary_terms where project_id = ? and ${cert()} and origin = 'ai'`, P, T);
  // 联结力：本队分身让别队证伪了假设（对局计分事件）；已认证证据覆盖的来源类型数；项目成员协作人数
  const twinHits = n(c, `select count(*) n from arena_events e join arena_teams t on t.id = e.team_id where t.project_id = ? and e.kind = 'twin_hit' and e.created_at <= ?`, P, T);
  const kinds = n(c, `select count(distinct json_extract(source, '$.kind')) n from evidence_items where project_id = ? and ${cert()}`, P, T);
  const members = n(c, "select count(*) n from project_members where project_id = ? and joined_at <= ?", P, T);

  const mk = (key: string, label: string, basis: { label: string; n: number; w: number }[]): Ability => {
    const count = basis.reduce((s, b) => s + b.n, 0);
    return { key, label, count, score: Math.min(100, basis.reduce((s, b) => s + b.n * b.w, 0)), basis: basis.map(({ label, n }) => ({ label, n })) };
  };
  return [
    mk("judgment", "判断力", [{ label: "挂了证据的决策", n: decisions, w: 20 }, { label: "教师确认的现实验证", n: verified, w: 20 }]),
    mk("empathy", "共情力", [{ label: "带用户原话的证据", n: quotes, w: 15 }, { label: "引用原话的 HMW 问题", n: hmwQuotes, w: 15 }]),
    mk("creativity", "创造力", [{ label: "已认证的备选方案", n: options, w: 15 }, { label: "迭代版本的实质改动", n: changes, w: 10 }]),
    mk("reflection", "反思力", [{ label: "证伪并修正", n: falsified, w: 20 }, { label: "修改 / 放弃的决策", n: revise, w: 15 }, { label: "核对并认证的术语", n: aligned, w: 10 }]),
    mk("connection", "联结力", [{ label: "分身让别队证伪假设", n: twinHits, w: 20 }, { label: "证据来源类型", n: kinds, w: 15 }, { label: "协作成员", n: Math.max(0, members - 1), w: 10 }]),
  ];
}

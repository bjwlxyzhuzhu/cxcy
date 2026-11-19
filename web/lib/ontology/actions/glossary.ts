import "server-only";
import { defineAction, ActionError, requireMember, str } from "../engine";
import { cnDayStartIso } from "./draft";

/** 每人每天最多做几次 AI 口径检查（不扣积分，用次数防滥用） */
export const DAILY_GLOSSARY_LIMIT = 10;

const list = (v: unknown, n = 10) =>
  JSON.stringify((Array.isArray(v) ? v : typeof v === "string" ? v.split(/\n+/) : []).map((x) => str(String(x ?? ""), 120)).filter(Boolean).slice(0, n));

/** 推荐的课堂口径：与平台计分、证据规则保持一致（规则定义，不是成果数据；教师点击后才写入） */
export const RECOMMENDED_CLASS_TERMS = [
  {
    term: "带证据回应", formula: "平台按证据判定规则自动识别；每队每轮最多计分 8 次",
    definition: "回应质询时给出已经发生的调研或实测结果（数据、访谈原话、实测记录）。计划、预测、假想的话、团队介绍、自家定价都不算证据。",
    aliases: ["拿出证据", "证据命中"], examples: ["算：访谈 12 家里 8 家愿意试用一个月", "不算：预计第一年能赚 100 万"],
  },
  {
    term: "假设", formula: "",
    definition: "一句能在现实中检验的判断，写清对象、行为和数量。",
    aliases: ["待验证假设"], examples: ["中小材料加工厂愿意为质检自动化每年付 3 万元以上"],
  },
  {
    term: "证伪", formula: "",
    definition: "有证据表明假设不成立，并写出修正后的新假设或方案。只说“不对”不算证伪。",
    aliases: ["证伪并修正"], examples: [],
  },
  {
    term: "现实验证", formula: "提交过程与结果 → 教师确认 → 计分",
    definition: "回到现实中用访谈、问卷或实测检验假设，写清问了谁、怎么做、结果如何，经教师确认才算通过。",
    aliases: ["回到现实验证"], examples: [],
  },
  {
    term: "调研证据", formula: "",
    definition: "已经发生的访谈、问卷、实测、观察或单据记录，注明真实来源并经学生认证。AI 起草的内容不是证据。",
    aliases: ["证据"], examples: [],
  },
  {
    term: "数字分身", formula: "",
    definition: "依据真实调研资料生成的一类人的角色原型，只能说资料里有的话。分身是假设，不是证据，不复制任何真实个人。",
    aliases: ["分身", "调研分身"], examples: [],
  },
  {
    term: "MVP", formula: "",
    definition: "最小可行产品：能让真实用户试用、用来检验关键假设的最小版本（通常是 V0.1）。",
    aliases: ["最小可行产品", "V0.1"], examples: [],
  },
];

// ───────────────────────── 课堂口径（教师）─────────────────────────

defineAction({
  key: "class.term_upsert", label: "维护课堂口径", humanOnly: true,
  parse: (r) => {
    const term = str(r.term, 40), definition = str(r.definition, 600);
    if (!term || !definition) throw new ActionError(400, "请填写术语和定义");
    return { id: str(r.id, 64), term, definition, formula: str(r.formula, 200), aliases: list(r.aliases), examples: list(r.examples) };
  },
  run: (ctx, p) => {
    if (!ctx.isTeacher) throw new ActionError(403, "课堂口径只能由教师维护");
    try {
      if (p.id) {
        const r = ctx.c.prepare(
          "update glossary_terms set term = ?, definition = ?, formula = ?, aliases = ?, examples = ?, status = 'confirmed', confirmed_by = ?, confirmed_at = ? where id = ? and project_id is null returning id"
        ).get(p.term, p.definition, p.formula, p.aliases, p.examples, ctx.actor.userId, ctx.now, p.id);
        if (!r) throw new ActionError(404, "课堂口径不存在");
        ctx.scope.targetId = p.id;
      } else {
        const r = ctx.c.prepare(
          `insert into glossary_terms (project_id, term, definition, formula, aliases, examples, status, origin, created_by, confirmed_by, confirmed_at)
           values (null, ?, ?, ?, ?, ?, 'confirmed', 'human', ?, ?, ?) returning id`
        ).get(p.term, p.definition, p.formula, p.aliases, p.examples, ctx.actor.userId, ctx.actor.userId, ctx.now) as { id: string };
        ctx.scope.targetId = r.id;
      }
    } catch (e) {
      if (/UNIQUE/.test((e as Error).message)) throw new ActionError(409, "课堂口径里已有这个术语");
      throw e;
    }
    ctx.scope.targetType = "glossary_term";
    return { id: ctx.scope.targetId };
  },
});

defineAction({
  key: "class.term_retire", label: "停用课堂口径", humanOnly: true,
  parse: (r) => ({ id: str(r.id, 64) }),
  run: (ctx, p) => {
    if (!ctx.isTeacher) throw new ActionError(403, "课堂口径只能由教师维护");
    const r = ctx.c.prepare("update glossary_terms set status = 'rejected' where id = ? and project_id is null returning id").get(p.id);
    if (!r) throw new ActionError(404, "课堂口径不存在");
    ctx.scope.targetType = "glossary_term";
    ctx.scope.targetId = p.id;
    return { ok: true };
  },
});

defineAction({
  key: "class.seed_terms", label: "导入推荐课堂口径", humanOnly: true,
  parse: () => ({}),
  run: (ctx) => {
    if (!ctx.isTeacher) throw new ActionError(403, "课堂口径只能由教师维护");
    const ins = ctx.c.prepare(
      `insert into glossary_terms (project_id, term, definition, formula, aliases, examples, status, origin, created_by, confirmed_by, confirmed_at)
       values (null, ?, ?, ?, ?, ?, 'confirmed', 'human', ?, ?, ?) on conflict do nothing`
    );
    let added = 0;
    for (const t of RECOMMENDED_CLASS_TERMS) {
      added += Number(ins.run(t.term, t.definition, t.formula, JSON.stringify(t.aliases), JSON.stringify(t.examples), ctx.actor.userId, ctx.actor.userId, ctx.now).changes);
    }
    return { added };
  },
});

// ───────────────────────── AI 口径检查结果入库（AI 可执行，只生成草稿 / 冲突标记）─────────────────────────

export type GlossaryDraft = { term: string; definition: string; formula: string; aliases: string[]; conflicts: { meaning: string; where: string; quote: string }[] };

defineAction({
  key: "draft.glossary_import", label: "AI 起草术语与口径冲突",
  parse: (r) => ({ project_id: str(r.project_id, 64), terms: (Array.isArray(r.terms) ? r.terms : []) as GlossaryDraft[] }),
  run: (ctx, p) => {
    requireMember(ctx, p.project_id);
    const used = ctx.c.prepare(
      "select count(*) n from onto_audit where action = 'draft.glossary_import' and actor_id = ? and ok = 1 and created_at >= ?"
    ).get(ctx.actor.userId, cnDayStartIso()) as { n: number };
    if (Number(used.n) >= DAILY_GLOSSARY_LIMIT) throw new ActionError(429, `今天已检查 ${DAILY_GLOSSARY_LIMIT} 次口径，明天再来`);
    const origin = ctx.actor.kind === "human" ? "human" : "ai";
    let created = 0, flagged = 0;
    for (const t of p.terms.slice(0, 12)) {
      const term = str(t.term, 40);
      if (!term) continue;
      const conflicts = JSON.stringify((t.conflicts || []).slice(0, 6));
      const hasConflict = (t.conflicts || []).length >= 2;
      const ex = ctx.c.prepare("select id from glossary_terms where project_id = ? and term = ? collate nocase").get(p.project_id, term) as { id: string } | undefined;
      if (ex) {
        // 已有术语：只更新冲突标记，不改动定义与认证状态（是否重新对齐由学生决定）
        if (hasConflict) { ctx.c.prepare("update glossary_terms set conflicts = ? where id = ?").run(conflicts, ex.id); flagged++; }
        continue;
      }
      ctx.c.prepare(
        `insert into glossary_terms (project_id, term, definition, formula, aliases, conflicts, status, origin, source, created_by)
         values (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`
      ).run(p.project_id, term, str(t.definition, 600), str(t.formula, 200), list(t.aliases), hasConflict ? conflicts : "[]", origin, JSON.stringify({ kind: "ai" }), ctx.actor.userId);
      created++;
      if (hasConflict) flagged++;
    }
    return { created, flagged };
  },
});

// ───────────────────────── 对齐确认（人）─────────────────────────

defineAction({
  key: "glossary.resolve", label: "确认口径已对齐", humanOnly: true,
  parse: (r) => ({ id: str(r.id, 64) }),
  run: (ctx, p) => {
    const g = ctx.c.prepare("select project_id, status, conflicts from glossary_terms where id = ?").get(p.id) as
      { project_id: string | null; status: string; conflicts: string } | undefined;
    if (!g || !g.project_id) throw new ActionError(404, "术语不存在");
    requireMember(ctx, g.project_id);
    ctx.scope.targetType = "glossary_term";
    ctx.scope.targetId = p.id;
    if (!["certified", "confirmed"].includes(g.status)) throw new ActionError(409, "草稿请直接修改定义后认证");
    // 团队核对后认为现有定义无误：保留定义与认证状态，只清空冲突标记（留审计）
    ctx.c.prepare("update glossary_terms set conflicts = '[]' where id = ?").run(p.id);
    return { ok: true };
  },
});

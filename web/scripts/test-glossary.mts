// 口径与术语表单测（临时库）：防编造校验、课堂口径、AI 检查入库、认证清冲突、口径上下文
// 运行：node --test scripts/test-glossary.mts
import "./_node-hooks.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const tmp = path.join(os.tmpdir(), `glossary-test-${Date.now()}.db`);
process.env.DATABASE_URL = "file:" + tmp;
const { sqlite } = await import("../lib/db.ts");
const { createUser } = await import("../lib/auth.ts");
const { runAction, ActionError } = await import("../lib/ontology/index.ts");
const { verifyGlossary, collectSources, glossaryFor, matchTerms, glossaryPrompt } = await import("../lib/ontology/glossary.ts");

const A = createUser({ account: "A01", password: "test1234" });
const B = createUser({ account: "B01", password: "test1234" });
const T = createUser({ account: "T01", password: "test1234", role: "teacher" });
const human = (id: string) => ({ userId: id, kind: "human" as const });
const ai = (id: string) => ({ userId: id, kind: "ai" as const });
function rejects(fn: () => unknown, status: number, re?: RegExp) {
  try { fn(); } catch (e) {
    assert.ok(e instanceof ActionError, (e as Error).message);
    assert.equal((e as InstanceType<typeof ActionError>).status, status, (e as Error).message);
    if (re) assert.match((e as Error).message, re);
    return;
  }
  assert.fail("应当失败");
}

const P = runAction<{ id: string }>("project.create", human(A), { name: "甲队" }).id;
const M1 = "运营周报：本月复购率21%，按30天内再次下单的用户计算。";
const M2 = "财务对账：复购率12.7%，只统计30天内再次支付成功的用户。";
runAction("material.add", human(A), { project_id: P, name: "运营周报", kind: "document", ref_note: "2026-11 运营组周报", text: M1 + "补充说明：本周新增用户 300 人，活跃用户占比 40%，渠道以社群为主。" });
runAction("material.add", human(A), { project_id: P, name: "财务对账", kind: "document", ref_note: "2026-11 财务对账表", text: M2 + "补充说明：退款不计入支付成功，优惠券订单按实付金额统计，月度口径以财务为准。" });

test("收集原文：资料编号为 M1、M2", () => {
  const src = collectSources(sqlite(), P);
  assert.deepEqual(src.map((x) => x.key), ["M1", "M2"]);
  assert.ok(src[0].label.includes("运营周报"));
});

test("防编造：术语须在原文出现；说法原文须在标注来源中；不足两种不算冲突；重复含义去重", () => {
  const src = collectSources(sqlite(), P);
  const raw = JSON.stringify({ terms: [
    { term: "复购率", definition: "30 天内再次购买的用户占比", aliases: [], variants: [
      { meaning: "按再次下单计算", source: "M1", quote: "本月复购率21%，按30天内再次下单的用户计算" },
      { meaning: "按再次支付成功计算", source: "M2", quote: "复购率12.7%，只统计30天内再次支付成功的用户" },
      { meaning: "按注册算", source: "M1", quote: "复购率按注册用户算" },
      { meaning: "按再次下单计算", source: "M1", quote: "本月复购率21%" },
    ] },
    { term: "客单价", definition: "编造的术语", variants: [] },
    { term: "活跃用户占比", definition: "活跃用户 ÷ 总用户", variants: [{ meaning: "仅一种", source: "M1", quote: "活跃用户占比 40%" }] },
  ] });
  const { terms, warnings } = verifyGlossary(raw, src);
  assert.deepEqual(terms.map((t) => t.term), ["复购率", "活跃用户占比"]);
  assert.equal(terms[0].conflicts.length, 2, "编造的说法应被剔除、重复含义去重");
  assert.ok(terms[0].conflicts.every((c) => c.where.startsWith("资料《")));
  assert.equal(terms[1].conflicts.length, 0, "只有一种说法不算冲突");
  assert.ok(warnings.some((w) => w.includes("客单价")));
  assert.ok(warnings.some((w) => w.includes("找不到")));
  assert.equal(verifyGlossary("不是 JSON", src).terms.length, 0);
});

let GID = "";
test("AI 检查结果入库：只生成草稿；已认证术语只标冲突、不改认证状态", () => {
  const conflicts = [{ meaning: "按下单", where: "资料《运营周报》", quote: "x" }, { meaning: "按支付", where: "资料《财务对账》", quote: "y" }];
  const r = runAction<{ created: number; flagged: number }>("draft.glossary_import", ai(A), { project_id: P, terms: [
    { term: "复购率", definition: "30 天内再次购买的用户占比", formula: "", aliases: ["回购率"], conflicts },
    { term: "试用成功", definition: "试用满一个月且愿意续费", formula: "", aliases: [], conflicts: [] },
  ] });
  assert.deepEqual(r, { created: 2, flagged: 1 });
  const g = sqlite().prepare("select id, status, origin, conflicts from glossary_terms where project_id = ? and term = '试用成功'").get(P) as { id: string; status: string; origin: string; conflicts: string };
  assert.equal(g.status, "draft");
  assert.equal(g.origin, "ai");
  GID = g.id;
  // 认证“试用成功”，再让 AI 检查发现它有冲突：状态保持已认证，只多了冲突标记
  runAction("object.certify", human(A), { type: "glossary_term", id: GID });
  runAction("draft.glossary_import", ai(A), { project_id: P, terms: [{ term: "试用成功", definition: "改写的定义", formula: "", aliases: [], conflicts }] });
  const after = sqlite().prepare("select status, definition, conflicts from glossary_terms where id = ?").get(GID) as { status: string; definition: string; conflicts: string };
  assert.equal(after.status, "certified");
  assert.equal(after.definition, "试用满一个月且愿意续费", "AI 不能改已认证的定义");
  assert.equal(JSON.parse(after.conflicts).length, 2);
  rejects(() => runAction("draft.glossary_import", ai(B), { project_id: P, terms: [] }), 403);
});

test("对齐：修改定义回到草稿，重新认证后冲突清空；没有定义不能认证；术语不能重复", () => {
  const u = runAction<{ status: string }>("object.update", human(A), { type: "glossary_term", id: GID, fields: { definition: "试用满 30 天且按约定价格续费" } });
  assert.equal(u.status, "draft");
  runAction("object.certify", human(A), { type: "glossary_term", id: GID });
  const row = sqlite().prepare("select conflicts from glossary_terms where id = ?").get(GID) as { conflicts: string };
  assert.equal(row.conflicts, "[]");
  const empty = runAction<{ id: string }>("object.create", human(A), { type: "glossary_term", project_id: P, fields: { term: "获客成本" } }).id;
  rejects(() => runAction("object.certify", human(A), { type: "glossary_term", id: empty }), 400, /定义/);
  rejects(() => runAction("object.create", human(A), { type: "glossary_term", project_id: P, fields: { term: "复购率" } }), 409, /已有/);
  rejects(() => runAction("object.update", human(A), { type: "glossary_term", id: empty, fields: { term: "试用成功" } }), 409);
});

test("确认口径已对齐：只清冲突、不改定义与状态；草稿与非成员不可用；AI 不可代办", () => {
  const conflicts = [{ meaning: "甲", where: "资料《运营周报》", quote: "x" }, { meaning: "乙", where: "资料《财务对账》", quote: "y" }];
  runAction("draft.glossary_import", ai(A), { project_id: P, terms: [{ term: "试用成功", definition: "AI 改写", formula: "", aliases: [], conflicts }] });
  rejects(() => runAction("glossary.resolve", ai(A), { id: GID }), 403, /必须由人执行/);
  rejects(() => runAction("glossary.resolve", human(B), { id: GID }), 403);
  runAction("glossary.resolve", human(A), { id: GID });
  const r = sqlite().prepare("select status, definition, conflicts from glossary_terms where id = ?").get(GID) as { status: string; definition: string; conflicts: string };
  assert.equal(r.status, "certified");
  assert.equal(r.definition, "试用满 30 天且按约定价格续费");
  assert.equal(r.conflicts, "[]");
  const draft = sqlite().prepare("select id from glossary_terms where project_id = ? and status = 'draft' limit 1").get(P) as { id: string };
  rejects(() => runAction("glossary.resolve", human(A), { id: draft.id }), 409);
});

test("课堂口径：只有教师能维护；一键导入可重复执行；可停用", () => {
  rejects(() => runAction("class.seed_terms", human(A), {}), 403);
  rejects(() => runAction("class.term_upsert", human(A), { term: "x", definition: "y" }), 403);
  const s1 = runAction<{ added: number }>("class.seed_terms", human(T), {});
  assert.ok(s1.added >= 5);
  assert.equal(runAction<{ added: number }>("class.seed_terms", human(T), {}).added, 0);
  rejects(() => runAction("class.term_upsert", human(T), { term: "带证据回应", definition: "重复" }), 409);
  const id = runAction<{ id: string }>("class.term_upsert", human(T), { term: "转化率", definition: "下单用户 ÷ 访问用户", formula: "下单 ÷ 访问" }).id;
  runAction("class.term_upsert", human(T), { id, term: "转化率", definition: "付款用户 ÷ 访问用户" });
  const r = sqlite().prepare("select definition, status from glossary_terms where id = ?").get(id) as { definition: string; status: string };
  assert.equal(r.definition, "付款用户 ÷ 访问用户");
  assert.equal(r.status, "confirmed");
  runAction("class.term_retire", human(T), { id });
  rejects(() => runAction("class.seed_terms", ai(T), {}), 403, /必须由人执行/);
});

test("口径上下文：只含教师确认的课堂口径与本队已认证术语；能把问题里的词对到术语", () => {
  const g = glossaryFor(sqlite(), P);
  const names = g.map((x) => x.term);
  assert.ok(names.includes("带证据回应"));
  assert.ok(names.includes("试用成功"));
  assert.ok(!names.includes("复购率"), "草稿术语不进上下文");
  assert.ok(!names.includes("获客成本"));
  assert.ok(!names.includes("转化率"), "已停用的课堂口径不进上下文");
  const hit = matchTerms("你们说的分身到底准不准？试用成功的标准是什么", g);
  assert.deepEqual(hit.map((x) => x.term).sort(), ["数字分身", "试用成功"].sort());
  const prompt = glossaryPrompt(g);
  assert.match(prompt, /课堂口径/);
  assert.match(prompt, /本队术语/);
  assert.match(prompt, /试用满 30 天/);
  assert.equal(glossaryPrompt([]), "");
  assert.ok(!glossaryFor(sqlite(), null).some((x) => x.scope === "team"));
});

test("每日检查限次", () => {
  for (let i = 0; i < 7; i++) runAction("draft.glossary_import", ai(A), { project_id: P, terms: [] });
  rejects(() => runAction("draft.glossary_import", ai(A), { project_id: P, terms: [] }), 429, /明天/);
});

test.after(() => {
  for (const f of [tmp, tmp + "-wal", tmp + "-shm"]) { try { fs.unlinkSync(f); } catch { /* 忽略 */ } }
});

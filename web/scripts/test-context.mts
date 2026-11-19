// 统一 AI 上下文层单测（临时库）：只含人认过的内容、权限、相关度与字数上限、术语对齐、出处校验、分身依据
// 运行：node --test scripts/test-context.mts
import "./_node-hooks.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const tmp = path.join(os.tmpdir(), `context-test-${Date.now()}.db`);
process.env.DATABASE_URL = "file:" + tmp;
const { sqlite } = await import("../lib/db.ts");
const { createUser } = await import("../lib/auth.ts");
const { runAction } = await import("../lib/ontology/index.ts");
const { ontologyContext, checkCitations, opponentBrief, ANSWER_RULES } = await import("../lib/ontology/context.ts");

const A = createUser({ account: "A01", password: "test1234" });
const B = createUser({ account: "B01", password: "test1234" });
const T = createUser({ account: "T01", password: "test1234", role: "teacher" });
const h = { userId: A, kind: "human" as const };
const c = sqlite();
const P = runAction<{ id: string }>("project.create", h, { name: "甲队" }).id;
const mk = (type: string, fields: Record<string, unknown>, certify = true, source?: Record<string, string>) => {
  const id = runAction<{ id: string }>("object.create", h, { type, project_id: P, fields }).id;
  if (certify) runAction("object.certify", h, { type, id, source });
  return id;
};
const E1 = mk("evidence", { kind: "test", content: "夜班试用两周，漏检率从 4% 降到 0.5%" }, true, { kind: "test", ref: "2026-11 试用记录" });
mk("evidence", { kind: "interview", content: "草稿：所有老板都愿意付费" }, false);
mk("hmw", { text: "我们如何减少夜班漏检？" });
runAction("object.create", h, { type: "glossary_term", project_id: P, fields: { term: "试用成功", definition: "试用满 30 天且续费", aliases: ["试用达标"] } });
const g = c.prepare("select id from glossary_terms where term = '试用成功'").get() as { id: string };
runAction("object.certify", h, { type: "glossary_term", id: g.id });
runAction("class.seed_terms", { userId: T, kind: "human" }, {});

test("只含已认证内容；带回答规则；草稿不进上下文", () => {
  const ctx = ontologyContext(c, A, P, "漏检率改善了多少");
  assert.ok(ctx.block.includes(ANSWER_RULES));
  assert.ok(ctx.block.includes("漏检率从 4% 降到 0.5%"));
  assert.ok(!ctx.block.includes("所有老板都愿意付费"), "草稿不能进上下文");
  assert.equal(ctx.projectId, P);
  assert.ok(Object.values(ctx.refs).some((r) => r.id === E1 && r.type === "evidence"));
});

test("权限：非成员拿不到项目内容，只给课堂口径与规则；教师可以", () => {
  const other = ontologyContext(c, B, P, "漏检率");
  assert.equal(other.projectId, null);
  assert.ok(!other.block.includes("漏检率从 4%"));
  assert.ok(!other.block.includes("试用成功"), "别队术语也不能泄露");
  assert.ok(other.block.includes("带证据回应"), "课堂口径照常提供");
  assert.equal(Object.keys(other.refs).length, 0);
  assert.equal(ontologyContext(c, T, P, "漏检率").projectId, P);
  assert.equal(ontologyContext(c, A, null, "随便问问").projectId, null);
});

test("术语对齐：问题里的词（含同义说法）对到口径", () => {
  const ctx = ontologyContext(c, A, P, "我们怎么算试用达标？分身算证据吗");
  assert.deepEqual(ctx.terms.sort(), ["数字分身", "试用成功", "调研证据"].sort(), "“证据”是课堂口径“调研证据”的同义说法");
  assert.match(ctx.block, /本题涉及：/);
});

test("没有已认证内容的项目：明确告诉 AI 不能编", () => {
  const Q = runAction<{ id: string }>("project.create", h, { name: "空项目" }).id;
  const ctx = ontologyContext(c, A, Q, "我们的用户怎么说");
  assert.match(ctx.block, /还没有已认证的内容/);
});

test("相关度优先 + 字数上限：放不下的对象不进上下文，也不在可引用编号里", () => {
  for (let i = 0; i < 30; i++) mk("decision", { verdict: "keep", subject: `无关决策 ${i} ${"填充".repeat(40)}` }, false);
  const ctx = ontologyContext(c, A, P, "漏检率", 400);
  assert.ok(ctx.block.includes("漏检率从 4% 降到 0.5%"), "最相关的证据应被选中");
  const keys = Object.keys(ctx.refs);
  assert.ok(keys.every((k) => ctx.block.includes(`〔${k}〕`)), "可引用编号必须都在上下文里");
});

test("出处校验：保留真实编号、删除编造编号、去重；兼容方括号写法", () => {
  const ctx = ontologyContext(c, A, P, "漏检率");
  const key = Object.values(ctx.refs).find((r) => r.id === E1)!.key;
  const r = checkCitations(`漏检降了〔${key}〕。满意度很高〔E99〕。再说一次[${key}]。`, ctx.refs);
  assert.equal(r.cited.length, 1);
  assert.equal(r.cited[0].id, E1);
  assert.deepEqual(r.invalid, ["E99"]);
  assert.ok(!r.text.includes("E99"));
  assert.equal((r.text.match(new RegExp(`〔${key}〕`, "g")) || []).length, 2);
  assert.equal(checkCitations("没有任何引用", ctx.refs).cited.length, 0);
});

test("分身依据：对方已认证证据与口径；草稿不出现；无项目时只给口径", () => {
  const b = opponentBrief(c, P);
  assert.match(b, /对方项目里已认证的依据/);
  assert.ok(b.includes("漏检率从 4% 降到 0.5%"));
  assert.ok(!b.includes("所有老板都愿意付费"));
  assert.ok(b.includes("试用成功"));
  const none = opponentBrief(c, null);
  assert.ok(none.includes("带证据回应") && !none.includes("对方项目"));
});

test.after(() => {
  for (const f of [tmp, tmp + "-wal", tmp + "-shm"]) { try { fs.unlinkSync(f); } catch { /* 忽略 */ } }
});

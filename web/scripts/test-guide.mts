// 智能引导师单测（临时库）：五力画像只计已认证记录、现实验证自动预审、干预卡起草与发送
// 运行：node --test scripts/test-guide.mts
import "./_node-hooks.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const tmp = path.join(os.tmpdir(), `guide-test-${Date.now()}.db`);
process.env.DATABASE_URL = "file:" + tmp;
const { sqlite } = await import("../lib/db.ts");
const { createUser } = await import("../lib/auth.ts");
const { runAction, ActionError } = await import("../lib/ontology/index.ts");
const { computeAbilities } = await import("../lib/ontology/abilities.ts");
const { preReviewVerification, draftCardFromBlocker, draftCardForStep } = await import("../lib/ontology/guide.ts");

const A = createUser({ account: "A01", password: "test1234" });
const B = createUser({ account: "B01", password: "test1234" });
const T = createUser({ account: "T01", password: "test1234", role: "teacher" });
const h = { userId: A, kind: "human" as const };
const c = sqlite();
const P = runAction<{ id: string }>("project.create", h, { name: "甲队" }).id;
runAction("project.add_member", h, { project_id: P, account: "B01" });
const mk = (type: string, fields: Record<string, unknown>, certify = true, source?: Record<string, string>) => {
  const id = runAction<{ id: string }>("object.create", h, { type, project_id: P, fields }).id;
  if (certify) runAction("object.certify", h, { type, id, source });
  return id;
};
function rejects(fn: () => unknown, status: number, re?: RegExp) {
  try { fn(); } catch (e) {
    assert.ok(e instanceof ActionError, (e as Error).message);
    assert.equal((e as InstanceType<typeof ActionError>).status, status, (e as Error).message);
    if (re) assert.match((e as Error).message, re);
    return;
  }
  assert.fail("应当失败");
}
const ab = () => Object.fromEntries(computeAbilities(c, P).map((a) => [a.key, a]));

test("空项目：五力全为 0（联结力不计负责人本人）", () => {
  const P0 = runAction<{ id: string }>("project.create", h, { name: "空" }).id;
  assert.ok(computeAbilities(c, P0).every((a) => a.count === 0 && a.score === 0));
});

test("五力只数已认证记录；草稿不算；每一力都给出依据明细", () => {
  const e1 = mk("evidence", { kind: "interview", content: "老板最怕漏检", quote: "退一次货损失上万" }, true, { kind: "interview", ref: "2026-11 走访" });
  mk("evidence", { kind: "survey", content: "问卷 200 份", quote: "63% 愿意多付" }, true, { kind: "survey", ref: "问卷星 2026-11 回收" });
  mk("evidence", { kind: "test", content: "草稿证据", quote: "草稿原话" }, false);
  mk("hmw", { text: "我们如何减少漏检？", user_quote: "最怕漏检" });
  mk("track_profile", { title: "AI 质检" });
  mk("task_brief", { title: "任务书" });
  const d = mk("decision", { verdict: "modify", subject: "改成按月订阅" }, false);
  runAction("link.create", h, { link: "cites", src: { type: "decision", id: d }, dst: { type: "evidence", id: e1 } });
  runAction("object.certify", h, { type: "decision", id: d });
  mk("product_version", { label: "V0.1" });
  const v2 = mk("product_version", { label: "V0.2", changes: ["按月订阅", "震动提醒"] }, false);
  runAction("link.create", h, { link: "results_from", src: { type: "product_version", id: v2 }, dst: { type: "decision", id: d } });
  runAction("object.certify", h, { type: "product_version", id: v2 });
  const a = ab();
  assert.equal(a.judgment.count, 1, "挂了证据的决策 1");
  assert.equal(a.empathy.count, 3, "带原话的证据 2 + 引用原话的 HMW 1（草稿不算）");
  assert.equal(a.creativity.count, 4, "备选方案 2 + V0.2 的 2 条改动");
  assert.equal(a.reflection.count, 1, "修改 / 放弃的决策 1");
  assert.equal(a.connection.count, 3, "来源类型 2 + 协作成员 1");
  assert.ok(computeAbilities(c, P).every((x) => x.score <= 100 && x.basis.length >= 2));
});

test("现实验证自动预审：要素齐全 / 缺要素 / 计划性说法", () => {
  const good = preReviewVerification("回访 2 家工厂老板，电话访谈，都把退货率排第一，同意试用一个月后按每件 0.3 元续费");
  assert.equal(good.ok, true);
  assert.equal(good.missing.length, 0);
  const vague = preReviewVerification("我们觉得这个方向很好");
  assert.equal(vague.ok, false);
  assert.ok(vague.missing.includes("怎么验证") && vague.missing.includes("有具体数字"));
  const plan = preReviewVerification("我们打算下周访谈 5 位老板，预计都会同意");
  assert.equal(plan.ok, false);
  assert.match(plan.note, /计划或推测/);
});

test("卡点起草干预卡：四段齐全、去哪练是平台内链接；停滞时按当前步骤起草", () => {
  for (const key of ["decision_no_evidence", "glossary_conflict", "stale_drafts", "quote_missing", "verifying", "其他"]) {
    const d = draftCardFromBlocker({ key, text: "条测试卡点", n: 2 }, "甲队");
    assert.ok(d.sharp && d.evidence.includes("甲队") && d.advice && d.link_href.startsWith("/"), key);
    assert.equal(d.rule, `project:${key}`);
  }
  const s = draftCardForStep(3, "产品任务书", "至少 1 份产品任务书已认证", "甲队");
  assert.match(s.evidence, /第 3 步/);
});

test("教师发干预卡：只有教师能发；发给全部成员；7 天内同类卡不重复；只接受平台内链接", () => {
  const card = draftCardFromBlocker({ key: "stale_drafts", text: "条草稿超过 3 天未认证", n: 3 }, "甲队");
  rejects(() => runAction("intervention.send", h, { project_id: P, ...card }), 403, /教师/);
  rejects(() => runAction("intervention.send", { userId: T, kind: "ai" }, { project_id: P, ...card }), 403, /必须由人执行/);
  rejects(() => runAction("intervention.send", { userId: T, kind: "human" }, { project_id: P, ...card, link_href: "https://example.com" }), 400, /平台内/);
  const r = runAction<{ sent: number; skipped: number }>("intervention.send", { userId: T, kind: "human" }, { project_id: P, ...card });
  assert.deepEqual(r, { sent: 2, skipped: 0 });
  const cards = c.prepare("select user_id, status, sharp from intervention_cards where rule = 'project:stale_drafts'").all() as { user_id: string; status: string; sharp: string }[];
  assert.deepEqual(cards.map((x) => x.user_id).sort(), [A, B].sort());
  assert.ok(cards.every((x) => x.status === "open"));
  assert.deepEqual(runAction("intervention.send", { userId: T, kind: "human" }, { project_id: P, ...card }), { sent: 0, skipped: 2 });
  rejects(() => runAction("intervention.send", { userId: T, kind: "human" }, { project_id: "不存在", ...card }), 404);
});

test.after(() => {
  for (const f of [tmp, tmp + "-wal", tmp + "-shm"]) { try { fs.unlinkSync(f); } catch { /* 忽略 */ } }
});

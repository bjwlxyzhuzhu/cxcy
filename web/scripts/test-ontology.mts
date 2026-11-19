// 项目本体 · 动作引擎单测（临时库，不碰 data/app.db）
// 运行：node --test scripts/test-ontology.mts
import "./_node-hooks.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const tmp = path.join(os.tmpdir(), `onto-test-${Date.now()}.db`);
process.env.DATABASE_URL = "file:" + tmp;
const { sqlite } = await import("../lib/db.ts");
const { createUser } = await import("../lib/auth.ts");
const { runAction, ActionError } = await import("../lib/ontology/index.ts");

const A = createUser({ account: "A01", password: "test1234", role: "student" });
const B = createUser({ account: "B01", password: "test1234", role: "student" });
const T = createUser({ account: "T01", password: "test1234", role: "teacher" });
const human = (id: string) => ({ userId: id, kind: "human" as const });
const ai = (id: string) => ({ userId: id, kind: "ai" as const });

function rejects(fn: () => unknown, status: number, re?: RegExp) {
  try { fn(); } catch (e) {
    assert.ok(e instanceof ActionError, "应抛出 ActionError：" + (e as Error).message);
    assert.equal((e as InstanceType<typeof ActionError>).status, status, (e as Error).message);
    if (re) assert.match((e as Error).message, re);
    return;
  }
  assert.fail("应当失败但成功了");
}
const audit = () => sqlite().prepare("select action, actor_kind, ok, error from onto_audit order by id").all() as { action: string; actor_kind: string; ok: number; error: string | null }[];

const P = runAction<{ id: string }>("project.create", human(A), { name: "甲队项目" }).id;
const Q = runAction<{ id: string }>("project.create", human(B), { name: "乙队项目" }).id;

test("建项目：创建者是负责人；可按账号加成员", () => {
  const r = sqlite().prepare("select role from project_members where project_id = ? and user_id = ?").get(P, A) as { role: string };
  assert.equal(r.role, "owner");
  rejects(() => runAction("project.add_member", human(B), { project_id: P, account: "B01" }), 403);
  runAction("project.add_member", human(T), { project_id: Q, account: "T01" }); // 教师可以加人
  rejects(() => runAction("project.add_member", human(A), { project_id: P, account: "不存在" }), 404);
});

test("AI 起草：origin=ai、状态为草稿；AI 不能认证", () => {
  const r = runAction<{ id: string; origin: string; status: string }>("object.create", ai(A), {
    type: "hmw", project_id: P, fields: { text: "我们如何让小厂老板放心试用 AI 质检？", user_quote: "怕不准，怕停产" },
  });
  assert.equal(r.origin, "ai");
  assert.equal(r.status, "draft");
  rejects(() => runAction("object.certify", ai(A), { type: "hmw", id: r.id }), 403, /必须由人执行/);
  const ok = runAction<{ status: string }>("object.certify", human(A), { type: "hmw", id: r.id });
  assert.equal(ok.status, "certified");
});

test("非成员不能在别人项目里建对象；教师也不能代学生写", () => {
  rejects(() => runAction("object.create", human(B), { type: "hmw", project_id: P, fields: { text: "x" } }), 403);
  rejects(() => runAction("object.create", human(T), { type: "hmw", project_id: P, fields: { text: "x" } }), 403);
});

test("字段白名单与枚举校验", () => {
  const r = runAction<{ id: string }>("object.create", human(A), { type: "evidence", project_id: P, fields: { kind: "interview", content: "访谈 6 家", hacker: "x" } });
  const row = sqlite().prepare("select * from evidence_items where id = ?").get(r.id) as Record<string, unknown>;
  assert.equal(row.content, "访谈 6 家");
  assert.ok(!("hacker" in row));
  rejects(() => runAction("object.create", human(A), { type: "evidence", project_id: P, fields: { kind: "瞎填" } }), 400);
  rejects(() => runAction("object.create", human(A), { type: "hypothesis", project_id: P, fields: {} }), 400);
});

let EV = "";
test("证据认证必须挂真实来源（AI 生成的不是证据）", () => {
  EV = runAction<{ id: string }>("object.create", ai(A), { type: "evidence", project_id: P, fields: { kind: "interview", content: "6 家里 4 家愿意试用", sample_n: 6 } }).id;
  rejects(() => runAction("object.certify", human(A), { type: "evidence", id: EV }), 400, /真实来源/);
  rejects(() => runAction("object.certify", human(A), { type: "evidence", id: EV, source: { kind: "ai", ref: "模型生成" } }), 400, /真实来源/);
  rejects(() => runAction("object.certify", human(A), { type: "evidence", id: EV, source: { kind: "interview" } }), 400, /出处/);
  const r = runAction<{ status: string }>("object.certify", human(A), { type: "evidence", id: EV, source: { kind: "interview", ref: "2026-11 走访 6 家材料厂，访谈记录第 3 页" } });
  assert.equal(r.status, "certified");
});

test("已认证内容一改就退回草稿；教师确认与驳回权限", () => {
  rejects(() => runAction("object.confirm", human(A), { type: "evidence", id: EV }), 403);
  const c = runAction<{ status: string }>("object.confirm", human(T), { type: "evidence", id: EV });
  assert.equal(c.status, "confirmed");
  const u = runAction<{ status: string }>("object.update", human(A), { type: "evidence", id: EV, fields: { content: "6 家里 4 家愿意试用一个月" } });
  assert.equal(u.status, "draft");
  const row = sqlite().prepare("select certified_by, confirmed_by from evidence_items where id = ?").get(EV) as Record<string, unknown>;
  assert.equal(row.certified_by, null);
  assert.equal(row.confirmed_by, null);
  const same = runAction<{ changed: number }>("object.update", human(A), { type: "evidence", id: EV, fields: { content: "6 家里 4 家愿意试用一个月" } });
  assert.equal(same.changed, 0);
  runAction("object.certify", human(A), { type: "evidence", id: EV });
  rejects(() => runAction("object.reject", human(A), { type: "evidence", id: EV }), 403, /教师/);
  rejects(() => runAction("object.confirm", human(T), { type: "evidence", id: "不存在" }), 404);
});

test("关系：类型方向校验、跨项目禁止、重复关系不报错", () => {
  const H = runAction<{ id: string }>("object.create", human(A), { type: "hmw", project_id: P, fields: { text: "我们如何降低漏检？" } }).id;
  const r = runAction<{ id: number; existed: boolean }>("link.create", human(A), { link: "based_on", src: { type: "hmw", id: H }, dst: { type: "evidence", id: EV } });
  assert.ok(r.id);
  const again = runAction<{ existed: boolean }>("link.create", human(A), { link: "based_on", src: { type: "hmw", id: H }, dst: { type: "evidence", id: EV } });
  assert.equal(again.existed, true);
  rejects(() => runAction("link.create", human(A), { link: "based_on", src: { type: "evidence", id: EV }, dst: { type: "hmw", id: H } }), 400, /不能连接/);
  const QE = runAction<{ id: string }>("object.create", human(B), { type: "evidence", project_id: Q, fields: { kind: "survey", content: "问卷" } }).id;
  rejects(() => runAction("link.create", human(A), { link: "based_on", src: { type: "hmw", id: H }, dst: { type: "evidence", id: QE } }), 400, /不同项目/);
  rejects(() => runAction("link.create", human(B), { link: "based_on", src: { type: "hmw", id: H }, dst: { type: "evidence", id: EV } }), 403);
  rejects(() => runAction("link.remove", human(B), { id: r.id }), 403);
  runAction("link.remove", human(A), { id: r.id });
});

test("决策必须依据已认证证据；失败时整体回滚（来源修改不生效）", () => {
  const D = runAction<{ id: string }>("object.create", human(A), { type: "decision", project_id: P, fields: { verdict: "modify", subject: "卖给班组长", rationale: "质检员抵制" } }).id;
  rejects(() => runAction("object.certify", human(A), { type: "decision", id: D, source: { kind: "interview", ref: "临时写入" } }), 400, /依据/);
  const row = sqlite().prepare("select source, status from decisions where id = ?").get(D) as { source: string; status: string };
  assert.equal(row.status, "draft");
  assert.ok(!row.source.includes("临时写入"), "失败的动作不应留下部分写入");
  const draftEv = runAction<{ id: string }>("object.create", human(A), { type: "evidence", project_id: P, fields: { kind: "test", content: "未认证" } }).id;
  runAction("link.create", human(A), { link: "cites", src: { type: "decision", id: D }, dst: { type: "evidence", id: draftEv } });
  rejects(() => runAction("object.certify", human(A), { type: "decision", id: D }), 400, /依据/);
  runAction("link.create", human(A), { link: "cites", src: { type: "decision", id: D }, dst: { type: "evidence", id: EV } });
  assert.equal(runAction<{ status: string }>("object.certify", human(A), { type: "decision", id: D }).status, "certified");
});

test("版本发布：V0.1 可直接发布；V0.2 必须源于已认证决策；版本号不能重复", () => {
  const V1 = runAction<{ id: string }>("object.create", ai(A), { type: "product_version", project_id: P, fields: { label: "V0.1", summary: "最小可行原型" } }).id;
  assert.equal(runAction<{ status: string }>("object.certify", human(A), { type: "product_version", id: V1 }).status, "certified");
  rejects(() => runAction("object.create", human(A), { type: "product_version", project_id: P, fields: { label: "V0.1" } }), 409);
  const n = (sqlite().prepare("select count(*) n from product_versions where project_id = ?").get(P) as { n: number }).n;
  assert.equal(Number(n), 1, "失败的创建不应写入");
  const V2 = runAction<{ id: string }>("object.create", human(A), { type: "product_version", project_id: P, fields: { label: "V0.2" } }).id;
  rejects(() => runAction("object.certify", human(A), { type: "product_version", id: V2 }), 400, /决策/);
  const D = sqlite().prepare("select id from decisions where project_id = ? and status = 'certified'").get(P) as { id: string };
  runAction("link.create", human(A), { link: "results_from", src: { type: "product_version", id: V2 }, dst: { type: "decision", id: D.id } });
  assert.equal(runAction<{ status: string }>("object.certify", human(A), { type: "product_version", id: V2 }).status, "certified");
});

test("审计：成功与失败都留痕，区分人与 AI", () => {
  const rows = audit();
  assert.ok(rows.some((r) => r.action === "object.certify" && r.actor_kind === "ai" && !r.ok && /必须由人执行/.test(r.error || "")));
  assert.ok(rows.some((r) => r.action === "object.create" && r.actor_kind === "ai" && r.ok));
  assert.ok(rows.some((r) => r.action === "object.certify" && r.actor_kind === "human" && r.ok));
  const fails = rows.filter((r) => !r.ok).length;
  assert.ok(fails >= 10, `失败动作应全部记录（当前 ${fails} 条）`);
  rejects(() => runAction("不存在的动作", human(A), {}), 400);
});

test.after(() => {
  for (const f of [tmp, tmp + "-wal", tmp + "-shm"]) { try { fs.unlinkSync(f); } catch { /* 忽略 */ } }
});

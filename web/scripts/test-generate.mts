// 产品线半自动化单测（临时库）：前置条件、起草校验、草稿入库、路演页与项目档案、第 7–8 步进度
// 运行：node --test scripts/test-generate.mts
import "./_node-hooks.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const tmp = path.join(os.tmpdir(), `generate-test-${Date.now()}.db`);
process.env.DATABASE_URL = "file:" + tmp;
const { sqlite } = await import("../lib/db.ts");
const { createUser } = await import("../lib/auth.ts");
const { runAction, ActionError } = await import("../lib/ontology/index.ts");
const { precheck, buildContext, verifyPlan } = await import("../lib/ontology/generate.ts");
const { computeProgress } = await import("../lib/ontology/progress.ts");

const A = createUser({ account: "A01", password: "test1234" });
const B = createUser({ account: "B01", password: "test1234" });
const h = { userId: A, kind: "human" as const }, ai = { userId: A, kind: "ai" as const };
const P = runAction<{ id: string }>("project.create", h, { name: "甲队<script>" }).id;
const c = sqlite();
function rejects(fn: () => unknown, status: number, re?: RegExp) {
  try { fn(); } catch (e) {
    assert.ok(e instanceof ActionError, (e as Error).message);
    assert.equal((e as InstanceType<typeof ActionError>).status, status, (e as Error).message);
    if (re) assert.match((e as Error).message, re);
    return;
  }
  assert.fail("应当失败");
}
const gen = (step: string, raw: unknown) => {
  const ctx = buildContext(c, P, step as never);
  const { plan, warnings } = verifyPlan(step as never, JSON.stringify(raw), ctx);
  const r = runAction<{ created: Record<string, number> }>("draft.generate", ai, { project_id: P, step, plan });
  return { ...r, warnings, ctx };
};
const certifyAll = (type: string, table: string, source?: Record<string, string>) => {
  for (const r of c.prepare(`select id from ${table} where project_id = ? and status = 'draft'`).all(P) as { id: string }[])
    runAction("object.certify", h, { type, id: r.id, source });
};

const TEST_TXT = "V0.1 夜班试用记录：4 家工厂试用两周，漏检率从 4% 降到 0.5%。班组长说“提醒很及时，就是声音太吵”。";

test("前置条件：缺资料、缺 HMW、缺任务书、缺 V0.1、缺测试资料、缺证据时给出提示", () => {
  assert.match(precheck(c, P, "track")!, /上传调研资料/);
  assert.match(precheck(c, P, "brief")!, /HMW/);
  assert.match(precheck(c, P, "v01")!, /任务书/);
  assert.match(precheck(c, P, "test")!, /V0\.1/);
  assert.match(precheck(c, P, "v02")!, /V0\.1/);
});

test("第 1–4 步：起草赛道画像、任务书、V0.1（含问卷）；无效引用被剔除；V0.1 不能重复", () => {
  runAction("material.add", h, { project_id: P, name: "走访记录", kind: "interview", ref_note: "2026-11 走访 6 家", text: "我们走访了 6 家中小材料加工厂。采购负责人说：退一次货损失上万，最怕漏检。夜班两名质检员靠肉眼检查。" });
  assert.equal(precheck(c, P, "track"), null);
  assert.deepEqual(gen("track", { track: { title: "AI 质检", track: "智能制造", audience: "材料厂" } }).created, { track_profile: 1 });
  certifyAll("track_profile", "track_profiles");
  runAction("object.create", h, { type: "hmw", project_id: P, fields: { text: "我们如何减少夜班漏检？" } });
  certifyAll("hmw", "hmw_questions");
  const b = gen("brief", { brief: { title: "夜班质检任务书", goal: "减少漏检", features: ["拍照识别"], metrics: ["漏检率 < 1%"], addresses: ["H1", "H99", "E1"] } });
  assert.deepEqual(b.created, { task_brief: 1, links: 1 }, "H99 不存在、E1 类型不对，都应被剔除");
  certifyAll("task_brief", "task_briefs");
  const v = gen("v01", { version: { summary: "夜班试用原型", changes: ["拍照识别"], implements: ["B1"], addresses: ["H1"] }, questionnaire: ["漏检几次？", "愿意付费吗？"] });
  assert.deepEqual(v.created, { product_version: 1, links: 2 });
  const row = c.prepare("select label, source from product_versions where project_id = ?").get(P) as { label: string; source: string };
  assert.equal(row.label, "V0.1");
  assert.equal(JSON.parse(row.source).questionnaire.length, 2);
  rejects(() => gen("v01", { version: { summary: "再来一个", changes: ["x"] } }), 409, /已经有 V0\.1/);
  certifyAll("product_version", "product_versions");
  assert.equal(computeProgress(c, P).current, 5);
});

test("第 5 步：测试报告的数值与原话必须在测试资料中查到；证据带建议来源", () => {
  runAction("material.add", h, { project_id: P, name: "夜班试用记录", kind: "test", ref_note: "2026-11 两周试用", text: TEST_TXT + "补充：其中 3 家希望把提醒改成震动。" });
  const r = gen("test", {
    report: { title: "V0.1 测试", summary: "漏检明显减少", metrics: [{ name: "漏检率", value: "0.5", unit: "%", source: "M1" }, { name: "满意度", value: "99.9", unit: "%", source: "M1" }], findings: ["提醒太吵"] },
    evidence: [
      { kind: "test", content: "漏检率降到 0.5%", quote: "漏检率从 4% 降到 0.5%", source: "M1", sample_n: 4 },
      { kind: "interview", content: "编造的证据", quote: "所有人都说完美", source: "M1" },
    ],
  });
  assert.deepEqual(r.created, { test_report: 1, links: 3, evidence: 2 });
  assert.ok(r.warnings.some((w) => w.includes("满意度")), "编造的指标数值应被剔除");
  assert.ok(r.warnings.some((w) => w.includes("原话")), "编造的原话应被清空");
  const rep = c.prepare("select metrics from test_reports where project_id = ?").get(P) as { metrics: string };
  assert.equal(JSON.parse(rep.metrics).length, 1);
  const ev = c.prepare("select id, quote, sample_n, source from evidence_items where project_id = ? order by rowid").all(P) as { id: string; quote: string; sample_n: number | null; source: string }[];
  assert.equal(ev[0].sample_n, 4);
  assert.equal(ev[1].quote, "");
  const sug = JSON.parse(ev[0].source).suggested;
  assert.equal(sug.kind, "test");
  runAction("object.certify", h, { type: "evidence", id: ev[0].id, source: { kind: sug.kind, ref: sug.ref } });
  runAction("object.reject", h, { type: "evidence", id: ev[1].id });
  certifyAll("test_report", "test_reports");
  assert.equal(computeProgress(c, P).steps[4].status, "done");
});

test("第 6 步：没有引用已认证证据的建议被丢弃；V0.2 自动编号并源于决策；认证后完成", () => {
  const r = gen("v02", {
    decisions: [
      { verdict: "modify", subject: "改为按月订阅", rationale: "试用用户更接受固定费用", cites: ["E1", "R1"], about: ["B1"] },
      { verdict: "drop", subject: "去掉语音", rationale: "无依据", cites: ["E99"] },
      { verdict: "随便", subject: "无效决定", cites: ["E1"] },
    ],
    version: { summary: "按月订阅", changes: ["改为按月订阅"] },
  });
  assert.deepEqual(r.created, { product_version: 1, decision: 1, links: 4 });
  assert.equal(r.warnings.length, 2);
  const v2 = c.prepare("select id, label from product_versions where project_id = ? and status = 'draft'").get(P) as { id: string; label: string };
  assert.equal(v2.label, "V0.2");
  rejects(() => runAction("object.certify", h, { type: "product_version", id: v2.id }), 400, /决策/);
  certifyAll("decision", "decisions");
  runAction("object.certify", h, { type: "product_version", id: v2.id });
  assert.equal(computeProgress(c, P).steps[5].status, "done");
});

let PITCH = "";
test("第 7 步：路演页只收录已认证内容、转义 HTML、无外部资源；审阅确认后完成；可撤回", () => {
  rejects(() => runAction("artifact.generate", { userId: B, kind: "human" }, { project_id: P, kind: "pitch" }), 403);
  PITCH = runAction<{ id: string; status: string }>("artifact.generate", h, { project_id: P, kind: "pitch" }).id;
  const a = c.prepare("select html, status from project_artifacts where id = ?").get(PITCH) as { html: string; status: string };
  assert.equal(a.status, "draft");
  assert.ok(a.html.includes("甲队&lt;script&gt;"), "项目名应被转义");
  assert.ok(!/<script>[^(]/.test(a.html.replace(/<script>\(function/, "")), "除翻页脚本外不应有其他脚本");
  assert.ok(!/https?:\/\//.test(a.html), "不应引用外部资源");
  assert.ok(a.html.includes("漏检率降到 0.5%"));
  assert.ok(!a.html.includes("编造的证据"), "已驳回的证据不应出现");
  assert.ok(!a.html.includes("A01"), "不应出现学生账号或姓名");
  assert.equal(computeProgress(c, P).steps[6].status, "doing");
  rejects(() => runAction("artifact.certify", ai, { id: PITCH }), 403, /必须由人执行/);
  runAction("artifact.certify", h, { id: PITCH });
  assert.equal(computeProgress(c, P).steps[6].status, "done");
  rejects(() => runAction("artifact.certify", h, { id: PITCH }), 409);
});

test("第 8 步：项目档案生成即归档；全部 8 步完成；撤回后回到未完成", () => {
  const id = runAction<{ id: string; status: string }>("artifact.generate", h, { project_id: P, kind: "archive" });
  assert.equal(id.status, "certified");
  const html = (c.prepare("select html from project_artifacts where id = ?").get(id.id) as { html: string }).html;
  assert.ok(html.includes("决策日志") && html.includes("改为按月订阅") && html.includes("AI 起草"));
  const p = computeProgress(c, P);
  assert.equal(p.done, 8);
  assert.equal(p.current, 8, "全部完成时当前步骤停在第 8 步");
  assert.equal(p.artifacts.length, 2);
  runAction("artifact.revoke", h, { id: id.id });
  assert.equal(computeProgress(c, P).steps[7].status, "todo");
  const empty = runAction<{ id: string }>("project.create", h, { name: "空项目" }).id;
  rejects(() => runAction("artifact.generate", h, { project_id: empty, kind: "pitch" }), 400, /已认证/);
});

test.after(() => {
  for (const f of [tmp, tmp + "-wal", tmp + "-shm"]) { try { fs.unlinkSync(f); } catch { /* 忽略 */ } }
});

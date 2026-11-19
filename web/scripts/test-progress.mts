// 产品线 8 步进度判定单测（临时库）：从空项目开始，逐步认证对象，检查每步状态与卡点
// 运行：node --test scripts/test-progress.mts
import "./_node-hooks.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const tmp = path.join(os.tmpdir(), `progress-test-${Date.now()}.db`);
process.env.DATABASE_URL = "file:" + tmp;
const { sqlite } = await import("../lib/db.ts");
const { createUser } = await import("../lib/auth.ts");
const { runAction } = await import("../lib/ontology/index.ts");
const { computeProgress } = await import("../lib/ontology/progress.ts");

const A = createUser({ account: "A01", password: "test1234" });
const h = { userId: A, kind: "human" as const };
const P = runAction<{ id: string }>("project.create", h, { name: "甲队" }).id;
const create = (type: string, fields: Record<string, unknown>) => runAction<{ id: string }>("object.create", h, { type, project_id: P, fields }).id;
const certify = (type: string, id: string, source?: Record<string, string>) => runAction("object.certify", h, { type, id, source });
const link = (l: string, st: string, si: string, dt: string, di: string) => runAction("link.create", h, { link: l, src: { type: st, id: si }, dst: { type: dt, id: di } });
const status = () => computeProgress(sqlite(), P).steps.map((s) => s.status).join(",");

test("空项目：全部未开始，当前在第 1 步", () => {
  const p = computeProgress(sqlite(), P);
  assert.equal(status(), "todo,todo,todo,todo,todo,todo,todo,todo");
  assert.equal(p.current, 1);
  assert.equal(p.done, 0);
  assert.equal(p.blockers.length, 0);
});

test("草稿只算进行中；认证后才算完成", () => {
  const t = create("track_profile", { title: "中小制造业 AI 质检" });
  assert.equal(status().split(",")[0], "doing");
  certify("track_profile", t);
  assert.equal(status().split(",")[0], "done");
  assert.equal(computeProgress(sqlite(), P).current, 2);
});

test("第 2–5 步：HMW、任务书、V0.1、测试报告 + 证据", () => {
  certify("hmw", create("hmw", { text: "我们如何减少漏检？" }));
  certify("task_brief", create("task_brief", { title: "AI 质检任务书" }));
  certify("product_version", create("product_version", { label: "V0.1" }));
  assert.equal(status(), "done,done,done,done,todo,todo,todo,todo");
  const r = create("test_report", { title: "V0.1 测试" });
  certify("test_report", r);
  assert.equal(status().split(",")[4], "doing", "只有报告、没有已认证证据，不算完成");
  const e = create("evidence", { kind: "test", content: "试用 4 家，漏检降到 0.5%" });
  certify("evidence", e, { kind: "test", ref: "2026-11 试用记录" });
  assert.equal(status().split(",")[4], "done");
  assert.equal(computeProgress(sqlite(), P).current, 6);
});

test("第 6 步：决策未挂证据是卡点；V0.2 源于已认证决策才算完成", () => {
  const d = create("decision", { verdict: "modify", subject: "改卖给班组长" });
  let p = computeProgress(sqlite(), P);
  assert.equal(p.steps[5].status, "doing");
  assert.ok(p.blockers.some((b) => b.key === "decision_no_evidence" && b.n === 1));
  const e = sqlite().prepare("select id from evidence_items where project_id = ? and status = 'certified'").get(P) as { id: string };
  link("cites", "decision", d, "evidence", e.id);
  certify("decision", d);
  const v2 = create("product_version", { label: "V0.2" });
  link("results_from", "product_version", v2, "decision", d);
  assert.equal(computeProgress(sqlite(), P).steps[5].status, "doing");
  certify("product_version", v2);
  p = computeProgress(sqlite(), P);
  assert.equal(status(), "done,done,done,done,done,done,todo,todo");
  assert.equal(p.done, 6);
  assert.ok(!p.blockers.some((b) => b.key === "decision_no_evidence"));
});

test("卡点：口径冲突、原话查不到的 AI 草稿、超过 3 天的草稿", () => {
  runAction("draft.glossary_import", { userId: A, kind: "ai" }, { project_id: P, terms: [
    { term: "复购率", definition: "x", formula: "", aliases: [], conflicts: [{ meaning: "甲", where: "M1", quote: "a" }, { meaning: "乙", where: "M2", quote: "b" }] },
  ] });
  const old = new Date(Date.now() - 4 * 86400_000).toISOString();
  sqlite().prepare(
    "insert into evidence_items (project_id, kind, content, status, origin, source, created_at) values (?, 'interview', '编造', 'draft', 'ai', ?, ?)"
  ).run(P, JSON.stringify({ kind: "ai", quote_removed: true }), old);
  const keys = computeProgress(sqlite(), P).blockers.map((b) => b.key);
  assert.ok(keys.includes("glossary_conflict"));
  assert.ok(keys.includes("quote_missing"));
  assert.ok(keys.includes("stale_drafts"));
});

test.after(() => {
  for (const f of [tmp, tmp + "-wal", tmp + "-shm"]) { try { fs.unlinkSync(f); } catch { /* 忽略 */ } }
});

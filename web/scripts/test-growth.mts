// 学生成长报告单测（临时库）：学期窗口、过程性（按周）、增值性（基线 vs 现在）、终结性与里程碑
// 运行：node --test scripts/test-growth.mts
import "./_node-hooks.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const tmp = path.join(os.tmpdir(), `growth-test-${Date.now()}.db`);
process.env.DATABASE_URL = "file:" + tmp;
const { sqlite } = await import("../lib/db.ts");
const { createUser } = await import("../lib/auth.ts");
const { runAction } = await import("../lib/ontology/index.ts");
const { computeAbilities } = await import("../lib/ontology/abilities.ts");
const { listCourses, growthReport, growthSummary, courseOfStudent } = await import("../lib/growth.ts");

const c = sqlite();
const S = createUser({ account: "S1", password: "test1234", class: "一班" });
const h = { userId: S, kind: "human" as const };
const day = (d: number) => new Date(Date.now() + d * 86400_000).toISOString();
const ymd = (d: number) => day(d).slice(0, 10);
// 学期：30 天前开课、60 天后结课；基线 = 开课第 14 天 = 16 天前
c.prepare("insert into terms (id, name, start_date, end_date) values ('t1', '测试学期', ?, ?)").run(ymd(-30), ymd(60));
c.prepare("insert into courses (id, term_id, name) values ('c1', 't1', '创新创业基础')").run();
c.prepare("insert into course_classes (course_id, class) values ('c1', '一班')").run();
const P = runAction<{ id: string }>("project.create", h, { name: "测试项目" }).id;
const mk = (type: string, fields: Record<string, unknown>, source?: Record<string, string>) => {
  const id = runAction<{ id: string }>("object.create", h, { type, project_id: P, fields }).id;
  runAction("object.certify", h, { type, id, source });
  return id;
};
// 基线前：赛道画像（25 天前认证）；基线后：HMW 与证据（今天）
const t1 = mk("track_profile", { title: "AI 质检" });
c.prepare("update track_profiles set certified_at = ? where id = ?").run(day(-25), t1);
mk("hmw", { text: "我们如何减少漏检？", user_quote: "最怕漏检" });
mk("evidence", { kind: "interview", content: "老板怕漏检", quote: "退一次货损失上万" }, { kind: "interview", ref: "2026-11 走访记录" });
c.prepare("insert into evidence_events (user_id, kind, title, created_at) values (?, 'chat', '提问', ?)").run(S, day(-28));
c.prepare("insert into evidence_events (user_id, kind, title, created_at) values (?, 'chat', '提问', ?)").run(S, day(-1));

test("学生按班级归入课程", () => {
  assert.equal(courseOfStudent(c, S)?.id, "c1");
  assert.deepEqual(listCourses(c)[0].classes, ["一班"]);
});

test("五力可按时间点计算：基线前只数到当时已认证的记录", () => {
  const base = Object.fromEntries(computeAbilities(c, P, day(-16)).map((a) => [a.key, a.count]));
  const now = Object.fromEntries(computeAbilities(c, P).map((a) => [a.key, a.count]));
  assert.equal(base.creativity, 1, "基线时只有赛道画像");
  assert.equal(base.empathy, 0);
  assert.equal(now.empathy, 2, "现在：带原话的证据 + 引用原话的 HMW");
});

test("成长报告：过程性按周、增值性有增量、终结性与里程碑", () => {
  const r = growthReport(c, S, courseOfStudent(c, S));
  assert.equal(r.course?.id, "c1");
  assert.equal(r.window.finished, false);
  assert.equal(r.process.totals.evidence, 2, "学期内两条学习证据");
  assert.equal(r.process.weeks[0].evidence, 1, "第 1 周一条");
  assert.ok(r.process.totals.certified >= 2, "基线后认证的对象计入当周");
  assert.equal(r.valueAdded.stepsBase, 1, "基线时完成第 1 步");
  assert.equal(r.valueAdded.stepsNow, 2, "现在完成第 1、2 步");
  const emp = r.valueAdded.abilities.find((a) => a.key === "empathy")!;
  assert.deepEqual([emp.base, emp.now, emp.gain], [0, 2, 2]);
  assert.ok(r.process.milestones[0].at && !r.process.milestones[2].at);
  assert.equal(r.summative.stepsDone, 2);
  assert.equal(r.summative.comment, "");
});

test("教师评语进入终结性评价；列表摘要", () => {
  c.prepare("insert into student_comments (user_id, course_id, comment) values (?, 'c1', '证据意识进步明显')").run(S);
  const r = growthReport(c, S, courseOfStudent(c, S));
  assert.equal(r.summative.comment, "证据意识进步明显");
  const s = growthSummary(c, S, courseOfStudent(c, S));
  assert.equal(s.hasComment, true);
  assert.equal(s.stepsNow, 2);
});

test("删除学期会连带删除课程与评语", () => {
  c.prepare("delete from terms where id = 't1'").run();
  assert.equal(listCourses(c).length, 0);
  assert.equal(Number((c.prepare("select count(*) n from student_comments").get() as { n: number }).n), 0);
});

test.after(() => { for (const f of [tmp, tmp + "-wal", tmp + "-shm"]) { try { fs.unlinkSync(f); } catch { /* 忽略 */ } } });

// 班级与教师关联单测（临时库）：教师只看自己班的项目；管理员与未认领班级的教师看全部；越权班级看不到
// 运行：node --test scripts/test-classes.mts
import "./_node-hooks.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const tmp = path.join(os.tmpdir(), `classes-test-${Date.now()}.db`);
process.env.DATABASE_URL = "file:" + tmp;
const { sqlite } = await import("../lib/db.ts");
const { createUser } = await import("../lib/auth.ts");
const { runAction } = await import("../lib/ontology/index.ts");
const { classScope, projectClassFilter, scopeClassOptions, classSize } = await import("../lib/classes.ts");

const c = sqlite();
const S1 = createUser({ account: "S1", password: "test1234", class: "一班" });
const S2 = createUser({ account: "S2", password: "test1234", class: "二班" });
const T1 = createUser({ account: "T1", password: "test1234", role: "teacher" });
const T0 = createUser({ account: "T0", password: "test1234", role: "teacher" });
const AD = createUser({ account: "AD", password: "test1234", role: "admin" });
c.prepare("insert into class_teachers (class, teacher_id) values (?, ?)").run("一班", T1);
const P1 = runAction<{ id: string }>("project.create", { userId: S1, kind: "human" }, { name: "一班项目" }).id;
const P2 = runAction<{ id: string }>("project.create", { userId: S2, kind: "human" }, { name: "二班项目" }).id;
const visible = (uid: string, pick?: string) => {
  const [sql, params] = projectClassFilter(classScope(c, uid), pick);
  return (c.prepare(`select p.id from projects p where ${sql} order by p.name`).all(...params) as { id: string }[]).map((r) => r.id);
};

test("认领了班级的教师只看到本班项目，指定别班也看不到", () => {
  assert.deepEqual(visible(T1), [P1]);
  assert.deepEqual(visible(T1, "二班"), []);
  assert.deepEqual(scopeClassOptions(c, classScope(c, T1)), ["一班"]);
});

test("管理员与未认领班级的教师看全部，可按班筛选", () => {
  assert.deepEqual(visible(AD).sort(), [P1, P2].sort());
  assert.deepEqual(visible(T0).sort(), [P1, P2].sort());
  assert.deepEqual(visible(AD, "二班"), [P2]);
  assert.deepEqual(scopeClassOptions(c, classScope(c, AD)), ["一班", "二班"]);
});

test("班级人数只数学生", () => {
  assert.equal(classSize(c, ["一班"]), 1);
  assert.equal(classSize(c, []), 2);
});

test.after(() => { for (const f of [tmp, tmp + "-wal", tmp + "-shm"]) { try { fs.unlinkSync(f); } catch { /* 忽略 */ } } });

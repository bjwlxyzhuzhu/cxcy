import test from "node:test";
import assert from "node:assert/strict";
import {
  comparableGroups,
  dimensionSummary,
  type GrowthEvent,
} from "../lib/growth-summary";
import { reflectionProblem } from "../lib/reward-policy";
import { awardCases, starterTemplates } from "../lib/resource-library";
const event = (id: number, key = "高教", score = 5, max = 10): GrowthEvent => ({
  id,
  kind: "defense_radar",
  project_id: null,
  created_at: `2026-09-${10 + id}T00:00:00Z`,
  dims: { key, axes: [{ dim: "创新", score, max }], total: score },
});
test("不同赛道和满分不混比、时间排序、单次不伪造进步", () => {
  const groups = comparableGroups([
    event(2, "高教", 8),
    event(1),
    event(3, "职教"),
    event(4, "高教", 9, 20),
  ]);
  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups[0].events.map((e) => e.id),
    [1, 2],
  );
  assert.equal(dimensionSummary(groups[0].events)[0].delta, 30);
  assert.equal(dimensionSummary(groups[1].events)[0].delta, null);
  assert.equal(comparableGroups([event(1, "", 5), event(2, "", 8)]).length, 2);
  assert.equal(comparableGroups([event(1, "高教", 11, 10)]).length, 0);
  assert.equal(
    comparableGroups([{ ...event(1), kind: "defense_preparation" }]).length,
    0,
  );
});
test("反思长度与重复字符校验", () => {
  assert.ok(reflectionProblem("a".repeat(100)));
  assert.ok(reflectionProblem({}));
  assert.ok(reflectionProblem("短内容"));
});
test("随源码提供真实资料入口与完整四类模板", () => {
  assert.equal(awardCases.length, 6);
  assert.equal(new Set(awardCases.map((c) => c.id)).size, 6);
  for (const c of awardCases) {
    assert.ok(new URL(c.source).protocol === "https:");
    assert.ok(c.video.startsWith("https://www.bilibili.com/video/"));
  }
  assert.equal(starterTemplates.length, 4);
  for (const t of starterTemplates) assert.ok(t.content.length > 350);
});

// AI 自动建本体：抽取规范化、防编造校验、资料上传与草稿入库单测（临时库）
// 运行：node --test scripts/test-extract.mts
import "./_node-hooks.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

const tmp = path.join(os.tmpdir(), `extract-test-${Date.now()}.db`);
process.env.DATABASE_URL = "file:" + tmp;
const { sqlite } = await import("../lib/db.ts");
const { createUser } = await import("../lib/auth.ts");
const { runAction, ActionError } = await import("../lib/ontology/index.ts");
const { normalizeDraft, verifyDraft, isVerbatim, pickJson } = await import("../lib/ontology/extract.ts");

const TEXT = `2026年11月我们走访了六家中小材料加工厂。
采购负责人说：“退一次货损失上万，最怕漏检。”
其中4家愿意先试用一个月，联系电话13812345678。
夜班两名质检员靠肉眼检查，漏检最多。`;

test("原话逐字校验：容忍全角半角、空格与引号差异，太短不算", () => {
  assert.equal(isVerbatim("退一次货损失上万，最怕漏检", TEXT), true);
  assert.equal(isVerbatim("退一次货损失上万,最怕漏检", TEXT), true);
  assert.equal(isVerbatim("“退一次货损失上万， 最怕漏检。”", TEXT), true);
  assert.equal(isVerbatim("退货一次损失十万", TEXT), false);
  assert.equal(isVerbatim("漏检", TEXT), false);
});

test("规范化：容忍代码块包裹、过滤空内容、限制条数、非法类型兜底", () => {
  const raw = "```json\n" + JSON.stringify({
    evidence: [{ ref: "e1", kind: "瞎填", content: "4 家愿意试用", quote: "", sample_n: "6" }, { ref: "e2", content: "" }],
    hmw: Array.from({ length: 9 }, (_, i) => ({ ref: `h${i}`, text: `我们如何 ${i}` })),
    track: { track: "智能质检", audience: "中小材料厂" },
  }) + "\n```";
  const d = normalizeDraft(pickJson(raw));
  assert.equal(d.evidence.length, 1);
  assert.equal(d.evidence[0].kind, "document");
  assert.equal(d.evidence[0].sample_n, 6);
  assert.equal(d.hmw.length, 5);
  assert.equal(d.track?.title, "智能质检");
  assert.equal(normalizeDraft(pickJson("不是 JSON")).evidence.length, 0);
});

test("防编造：找不到的原话和样本量被清空并提醒；汉字数字可识别；无效引用被过滤", () => {
  const d = normalizeDraft({
    evidence: [
      { ref: "e1", kind: "interview", content: "怕漏检", quote: "退一次货损失上万，最怕漏检", sample_n: 6 },
      { ref: "e2", kind: "interview", content: "愿意试用", quote: "所有老板都愿意马上付费", sample_n: 4 },
      { ref: "e3", kind: "observation", content: "夜班漏检", quote: "", sample_n: 99, collected_at: "2025-01-01" },
    ],
    hmw: [{ ref: "h1", text: "我们如何减少夜班漏检？", user_quote: "夜班两名质检员靠肉眼检查", based_on: ["e3", "e9"] },
          { ref: "h2", text: "我们如何让老板放心？", user_quote: "老板说一定要买" }],
  });
  const { draft, warnings } = verifyDraft(TEXT, d);
  assert.equal(draft.evidence[0].verbatim, true);
  assert.equal(draft.evidence[0].sample_n, 6, "“六家”应识别为 6");
  assert.equal(draft.evidence[1].quote, "", "编造的原话应被清空");
  assert.equal(draft.evidence[1].sample_n, 4);
  assert.equal(draft.evidence[2].sample_n, null, "原文没有 99");
  assert.equal(draft.evidence[2].collected_at, "", "原文没有该日期");
  assert.deepEqual(draft.hmw[0].based_on, ["e3"]);
  assert.equal(draft.hmw[0].verbatim, true);
  assert.equal(draft.hmw[1].user_quote, "");
  assert.equal(warnings.length, 3);
});

const A = createUser({ account: "A01", password: "test1234" });
const B = createUser({ account: "B01", password: "test1234" });
const human = (id: string) => ({ userId: id, kind: "human" as const });
const ai = (id: string) => ({ userId: id, kind: "ai" as const });
const P = runAction<{ id: string }>("project.create", human(A), { name: "甲队" }).id;

function rejects(fn: () => unknown, status: number, re?: RegExp) {
  try { fn(); } catch (e) {
    assert.ok(e instanceof ActionError, (e as Error).message);
    assert.equal((e as InstanceType<typeof ActionError>).status, status, (e as Error).message);
    if (re) assert.match((e as Error).message, re);
    return;
  }
  assert.fail("应当失败");
}

let MID = "";
test("上传资料：必须由人、必须注明类型与出处、入库前脱敏、非成员不能传", () => {
  const raw = { project_id: P, name: "走访记录", kind: "interview", ref_note: "2026-11 走访 6 家材料厂", text: TEXT };
  rejects(() => runAction("material.add", ai(A), raw), 403);
  rejects(() => runAction("material.add", human(A), { ...raw, kind: "ai" }), 400, /资料类型/);
  rejects(() => runAction("material.add", human(A), { ...raw, ref_note: "" }), 400, /出处/);
  rejects(() => runAction("material.add", human(A), { ...raw, text: "太短" }), 400);
  rejects(() => runAction("material.add", human(B), raw), 403);
  const r = runAction<{ id: string; pii: Record<string, number> }>("material.add", human(A), raw);
  MID = r.id;
  assert.equal(r.pii["手机号"], 1);
  const saved = sqlite().prepare("select text from materials where id = ?").get(MID) as { text: string };
  assert.ok(!saved.text.includes("13812345678") && saved.text.includes("[手机号已隐去]"));
});

test("AI 草稿入库：全部为草稿、带建议来源与关系；用建议来源认证证据成功", () => {
  const { draft } = verifyDraft(TEXT, normalizeDraft({
    evidence: [{ ref: "e1", kind: "interview", content: "老板最怕漏检", quote: "退一次货损失上万，最怕漏检", sample_n: 6 }],
    hmw: [{ ref: "h1", text: "我们如何减少漏检带来的退货？", user_quote: "最怕漏检", based_on: ["e1"] }],
    track: { title: "材料加工 AI 质检", track: "智能制造", audience: "中小材料加工厂" },
  }));
  const r = runAction<{ created: Record<string, number> }>("draft.import", ai(A), { project_id: P, material_id: MID, draft });
  assert.deepEqual(r.created, { evidence: 1, hmw: 1, track_profile: 1, links: 2 });
  const ev = sqlite().prepare("select id, status, origin, source from evidence_items where project_id = ?").get(P) as { id: string; status: string; origin: string; source: string };
  assert.equal(ev.status, "draft");
  assert.equal(ev.origin, "ai");
  const src = JSON.parse(ev.source);
  assert.equal(src.kind, "ai");
  assert.equal(src.suggested.kind, "interview");
  assert.equal(src.verbatim, true);
  // 直接认证会被拒（来源是 AI）；带上建议来源（人确认）才通过
  rejects(() => runAction("object.certify", human(A), { type: "evidence", id: ev.id }), 400, /真实来源/);
  const ok = runAction<{ status: string }>("object.certify", human(A), { type: "evidence", id: ev.id, source: { kind: src.suggested.kind, ref: src.suggested.ref } });
  assert.equal(ok.status, "certified");
  rejects(() => runAction("draft.import", ai(B), { project_id: P, material_id: MID, draft }), 403);
});

test("原话被清空的 AI 证据：补上原话前不能认证", () => {
  const { draft } = verifyDraft(TEXT, normalizeDraft({ evidence: [{ ref: "e1", kind: "interview", content: "全都愿意付费", quote: "我们全部都愿意马上付钱" }] }));
  runAction("draft.import", ai(A), { project_id: P, material_id: MID, draft });
  const ev = sqlite().prepare("select id, source from evidence_items where project_id = ? and content = '全都愿意付费'").get(P) as { id: string; source: string };
  const sug = JSON.parse(ev.source).suggested;
  rejects(() => runAction("object.certify", human(A), { type: "evidence", id: ev.id, source: { kind: sug.kind, ref: sug.ref } }), 400, /补上原话/);
  runAction("object.update", human(A), { type: "evidence", id: ev.id, fields: { quote: "其中4家愿意先试用一个月" } });
  assert.equal(runAction<{ status: string }>("object.certify", human(A), { type: "evidence", id: ev.id, source: { kind: sug.kind, ref: sug.ref } }).status, "certified");
});

test("每日上传限额", () => {
  const raw = { project_id: P, name: "x", kind: "survey", ref_note: "问卷星 2026-11", text: TEXT };
  for (let i = 0; i < 19; i++) runAction("material.add", human(A), raw);
  rejects(() => runAction("material.add", human(A), raw), 429, /明天/);
});

test.after(() => {
  for (const f of [tmp, tmp + "-wal", tmp + "-shm"]) { try { fs.unlinkSync(f); } catch { /* 忽略 */ } }
});

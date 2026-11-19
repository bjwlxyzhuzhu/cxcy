// citesEvidence（“带证据回应”判定，决定 +1 计分）正反例单测。
// 运行：node --test scripts/test-cites-evidence.mts
//
// 用例按“应该怎么判”来写。如有暂时判不对的用例，可在第 4 项写 true 标为 todo（已知误判），
// 不会让测试失败，但会单独列出并计入误判统计。
// 改判定规则 = 改计分规则，需经课程负责人确认。
// 2026-11-17：旧规则在前 24 条上误判 10 条（漏判 3、误判 7）；经确认改为新规则后全部判对。
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

// 脱离 Next 运行：server-only 换成空模块，@/ 别名指向项目根目录
const root = pathToFileURL(path.resolve(import.meta.dirname, "..") + "/").href;
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    if (spec.startsWith("@/")) {
      const base = new URL(spec.slice(2), root).href;
      for (const ext of ["", ".ts", ".tsx", "/index.ts"]) {
        try { return next(base + ext, ctx); } catch { /* 试下一个扩展名 */ }
      }
    }
    return next(spec, ctx);
  },
});
const { citesEvidence } = await import("../lib/arena.ts");

type Case = [text: string, expected: boolean, why: string, knownGap?: true];

// ── 正例：确实拿出了证据（数据 / 访谈原话 / 实测 / 真实单据）──
const POSITIVE: Case[] = [
  ["我们访谈了12家工厂，其中8家愿意试用", true, "访谈 + 具体数字"],
  ["问卷 200 份里有 63% 愿意为定制纹样多付 20 元", true, "问卷 + 百分比"],
  ["实测 300 件样品，漏检率从 4% 降到 0.5%", true, "实测数据"],
  ["老板原话说“退一次货损失上万，愿意先试再谈价”", true, "访谈原话 + 说"],
  ["受访的班组长反馈：“夜班最容易漏检，经常出问题”", true, "原话 + 反馈"],
  ["我们拿到了一份意向订单，金额5万元", true, "订单 + 金额"],
  ["根据统计年鉴，2025 年该行业产值 1200 亿元", true, "公开统计数据"],
  ["试用两周，退货从 9 次降到 2 次", true, "试用结果 + 次数"],
  ["我们拿到了两家厂的报价单，最低一家每台 3.2 万", true, "报价 + 金额"],
  ["上周走访了三家厂，两家老板当场说要试用", true, "走访结果，但数字是汉字"],
  ["我们去了五个社区，跟八位团长聊过，有六位愿意每周开团", true, "实地访谈结果，汉字数字"],
  ["有个老板跟我说'只要不停产，我愿意试'", true, "原话但用单引号"],
  // 边界：同一句里先有结果、后有计划，结果照常计入
  ["我们访谈了 12 家，预计明年扩到 50 家", true, "先有调研结果，后有计划"],
  ["回访的 20 位用户里，有 15 位每周都在用", true, "回访 + 数字"],
  ["转化率从 2% 提升到 5%", true, "带单位的数字描述结果变化"],
  ["他们说“夜班最容易漏检”，我们准备下周再去一次", true, "原话 + 后续计划"],
];

// ── 反例：主张、计划、预测、假想，不算证据 ──
const NEGATIVE: Case[] = [
  ["我觉得这个市场很大，大家都需要", false, "纯主张"],
  ["我们的产品很有特色，用户一定喜欢", false, "纯主张"],
  ["我们计划在 2027 年上线", false, "计划（数字但无单位）"],
  ["大概有几百家工厂吧", false, "模糊估计、无数字"],
  ["这个问题我们还没想好", false, "承认不知道"],
  ["我们是 3 个人的团队，很有激情", false, "团队介绍，不是对质询的证据"],
  ["预计第一年能赚 100 万", false, "预测，不是证据"],
  ["我们打算做问卷调研 2 次", false, "调研计划，不是结果"],
  ["用户肯定会说“这个产品太好用了”", false, "假想的原话"],
  ["第 1 个问题我先回答一下", false, "序号"],
  ["我们的定价是每件 0.3 元", false, "自己的定价主张，不是付费意愿证据"],
  ["市场规模有 5000 亿元", false, "无出处的宏观数字"],
  // 边界：计划/假设的影响延续到句末
  ["如果有 100 家愿意，我们就能盈利", false, "假设条件"],
  ["我们准备做问卷调研，样本 200 份", false, "计划里的样本量"],
  ["老板说会考虑一下", false, "没有原话、没有数据"],
  ["我们一定会把调研做扎实的", false, "表态"],
  ["我们团队 5 人，分工明确", false, "团队介绍（无结果表述）"],
];

for (const [text, expected, why, gap] of [...POSITIVE, ...NEGATIVE]) {
  const name = `${expected ? "正例" : "反例"}｜${why}｜${text}`;
  if (gap) {
    test(name, { todo: "当前启发式判错（已知误判）" }, () => {
      assert.equal(citesEvidence(text), expected);
    });
  } else {
    test(name, () => assert.equal(citesEvidence(text), expected));
  }
}

// 汇总：当前规则在这组用例上的误判率（不影响通过与否）
test("汇总：当前规则误判统计", () => {
  const all = [...POSITIVE, ...NEGATIVE];
  const fn = POSITIVE.filter(([t]) => !citesEvidence(t)).length;
  const fp = NEGATIVE.filter(([t]) => citesEvidence(t)).length;
  const gaps = all.filter((c) => c[3]).length;
  console.log(`  正例 ${POSITIVE.length} 条，漏判 ${fn}；反例 ${NEGATIVE.length} 条，误判 ${fp}；合计误判 ${fn + fp}/${all.length}`);
  // 已知误判条数必须与标注一致：规则一旦变化（变好或变坏），这里会提醒更新用例标注
  assert.equal(fn + fp, gaps, "实际误判数与 todo 标注不一致，请检查是否有用例行为改变");
});

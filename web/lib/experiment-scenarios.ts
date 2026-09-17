/** 实验题材随课堂冻结；同一课堂前后测使用同一案例，不混合不同题材算总分。 */
export type Scenario = {
  id: string;
  title: string;
  caseText: string;
  plain: string;
  questions: string[];
};
const common = [
  "谁最需要这个产品或服务？请举一个他们遇到困难的具体场景。",
  "他们现在怎样解决这个问题？这个方案能在哪一点上帮得更多？",
  "你准备先找谁试用？怎样知道这个方案确实帮到了他们？",
  "谁可能愿意付钱？你会怎样确认他们真的愿意付钱？",
  "试用可能给谁带来什么风险？你准备怎样减少这种风险？",
];
export const SCENARIOS: Scenario[] = [
  {
    id: "ai-campus-v1",
    title: "实验一：AI学习与就业陪伴",
    caseText:
      "某大学生团队拟开发一款“AI学习与就业陪伴平台”，为大学生提供学习规划、职业方向分析、简历优化、模拟面试以及学习和情绪陪伴。团队认为学习压力和就业焦虑带来市场需求，准备采用会员订阅，并通过高校、自媒体和校园社群推广；系统会采集学习情况、求职信息及部分个人偏好数据。核心任务：形成初步商业方案，并判断是否值得进入正式创业验证阶段。",
    plain:
      "团队想做一个帮大学生学习和求职的AI助手。还不知道学生是否需要、愿不愿意付费，以及个人信息是否安全。请判断是否值得先做小范围试用。",
    questions: [
      "哪一类大学生最需要这个产品？请举一个他们遇到困难的具体场景。",
      "这些学生现在怎样解决这个问题？我们的产品能在哪一点上帮得更多？",
      "你准备先找谁试用？怎样知道这个产品确实帮到了他们？",
      "谁可能愿意付钱？你会怎样确认他们是真的愿意付钱？",
      "哪些个人信息可以少收集或不收集？你会怎样保护使用者？",
    ],
  },
  {
    id: "campus-reuse-v1",
    title: "实验二：校园闲置物品循环服务",
    caseText:
      "一个学生团队计划提供校内闲置教材、小家电和生活用品的交换与寄售服务。毕业生可预约回收，在校生可查看物品说明并购买。团队考虑收取少量服务费，先在一栋宿舍试点。物品质量、定价、交易纠纷、储存空间和取货安全尚未验证。请形成初步方案，判断是否值得开展小规模试点。所有需求和收入都只是待验证的想法。",
    plain:
      "把同学不用的东西交给需要的人。先想清楚谁会用、如何确认物品可用、谁承担保管和纠纷处理；不需要预测一个很大的市场。",
    questions: [
      ...common.slice(0, 4),
      "怎样检查旧物品的质量？买卖双方发生争议时，你准备怎么处理？",
    ],
  },
  {
    id: "farm-box-v1",
    title: "实验三：家乡农产品预订配送",
    caseText:
      "一个大学生团队想帮助家乡的小农户，把当季蔬果以预订箱的方式卖给附近社区家庭。团队准备通过社区群收集订单，与农户约定采摘时间，再集中配送。家庭需求、农户供货稳定性、损耗、配送成本和食品安全责任都还不明确。请设计一次小规模验证，而不是直接承诺销量或收益。",
    plain:
      "先问社区家庭是否需要，再试一次少量预订与配送。要弄清楚谁负责、运输和损耗花多少钱、食物如何保证安全。没有调查过的数字不要编造。",
    questions: [
      ...common.slice(0, 4),
      "如果蔬果损坏或配送延误，你准备怎样处理？怎样保证食品安全？",
    ],
  },
];
export function scenarioFor(value: unknown): Scenario {
  const s = value as Partial<Scenario> | null;
  if (
    s &&
    typeof s.caseText === "string" &&
    Array.isArray(s.questions) &&
    s.questions.length === 5
  )
    return s as Scenario;
  return SCENARIOS.find((x) => x.id === s?.id) || SCENARIOS[0];
}
export function createScenario(
  id: unknown,
  custom?: Record<string, unknown>,
): Scenario {
  if (id === "custom") {
    const title = String(custom?.title || "").trim();
    const caseText = String(custom?.caseText || "").trim();
    const plain = String(custom?.plain || "").trim();
    if (
      !title ||
      title.length > 100 ||
      caseText.length < 30 ||
      caseText.length > 6000 ||
      !plain ||
      plain.length > 1000
    )
      throw new Error(
        "自定义案例需填写名称（100字以内）、背景（30—6000字）和通俗说明（1000字以内）",
      );
    return { id: "custom-v1", title, caseText, plain, questions: common };
  }
  const found = SCENARIOS.find((s) => s.id === (id || SCENARIOS[0].id));
  if (!found) throw new Error("请选择有效实验题材");
  return found;
}
export const MODULE_PATHS: Record<string, string> = {
  cockpit: "/apply/cockpit?experiment=1",
  expert: "/apply/expert?experiment=1",
  defense: "/apply/defense?experiment=1",
};
export function experimentPath(stage: string) {
  return MODULE_PATHS[stage] || "/experiment";
}
export const GUIDES: Record<
  string,
  { goal: string; steps: string[]; result: string }
> = {
  t0: {
    goal: "记录学习前的真实想法，不考专业术语。",
    steps: [
      "先读本次案例，再选自己的判断。",
      "写两个还需确认的条件和一个担心；不知道可写“尚不确定”。",
      "选择1—5分把握程度，点击“提交并进入项目导读”。",
    ],
    result: "保存前测，自动进入项目导读；提交后不再修改前测。",
  },
  orient: {
    goal: "弄清楚谁有困难、方案怎样帮助、哪些信息还未知。",
    steps: [
      "阅读案例与通俗说明；术语可在下方展开查看。",
      "不需要读完整商业计划书。能用自己的话说出目标用户与问题即可。",
    ],
    result: "点击确认后进入驾驶舱的课堂实验模式。",
  },
  cockpit: {
    goal: "写出自己的初步方案 V0。",
    steps: [
      "用3—5句话写：我想帮助谁、解决什么问题、准备怎样小范围试用。",
      "还不知道的成本、需求、收入可写“待验证”，不要编数字。",
      "点击“保存 V0 并进入专家打磨”。",
    ],
    result: "V0自动带入专家打磨，不必复制粘贴。",
  },
  expert: {
    goal: "从5个角度检查初步方案，再形成 V1。",
    steps: [
      "每轮只答一个问题；看不懂可点解释或回答框架。",
      "不会时写明原因再点跳过，系统保留缺项，不计零分。",
      "完成5轮后，在 V0 基础上写修改后的 V1，或说明保留原方案的理由。",
    ],
    result: "V0、5轮记录与 V1 一并带入模拟答辩。",
  },
  defense: {
    goal: "用自己的话解释经过打磨的方案，共3题。",
    steps: [
      "先查看已带入的 V1 和打磨记录。",
      "逐题说明判断、验证办法和暂停条件；不需要长篇演讲。",
      "第三题提交后自动返回课堂实验后测。",
    ],
    result: "3题回答独立保存；AI建议不冒充学生答案。",
  },
  t1: {
    goal: "独立重新判断同一案例，观察自己的想法是否变化。",
    steps: [
      "不使用AI代答，按现在的理解填写。",
      "题目与前测一致；补充哪些信息影响了自己的想法。",
    ],
    result: "提交后进入学习反馈；系统按固定编号配对。",
  },
  survey: {
    goal: "告诉老师哪些操作有帮助、哪些地方还困难。",
    steps: [
      "在1—5分中选择操作体验，建议只按实际感受评分。",
      "可补充最困惑的地方，点击完成实验。",
    ],
    result: "进入完成页，检查记录并选择所需导出格式。",
  },
};

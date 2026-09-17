/** 可在客户端和服务端共同使用的实验协议。完成度不等于能力评分。 */
export const PROTOCOL = "guided-v2";
export const EXPERT_ROLES = [
  "教育科研专家",
  "产业行业专家",
  "企业专家",
  "投资人专家",
  "风险、伦理与证据专家",
] as const;
export const STEPS = [
  "t0",
  "orient",
  "cockpit",
  "expert",
  "defense",
  "t1",
  "survey",
  "completed",
] as const;
export type Stage = (typeof STEPS)[number];
export const STAGE_LABELS: Record<string, string> = {
  waiting: "等待老师开始",
  t0: "1 前测：独立判断",
  orient: "2 项目导读",
  cockpit: "3 我的初步方案 V0",
  expert: "4 专家打磨（5轮）",
  defense: "5 模拟答辩（3题）",
  t1: "6 后测：独立判断",
  survey: "7 学习反馈",
  completed: "完成与导出",
  closed: "实验已关闭",
};
export const CORE_ITEMS = [
  { key: "judgment", label: "你是否支持这个项目先做小规模验证？" },
  { key: "assumptions", label: "项目要成立，最需要确认的两个条件是什么？" },
  { key: "risk", label: "你最担心什么？为什么？" },
  {
    key: "confidence",
    label: "你对自己的判断有多大把握？（1完全没把握—5非常有把握）",
  },
] as const;
export const QUESTIONS = [
  "哪一类大学生最需要这个产品？请举一个他们遇到困难的具体场景。",
  "这些学生现在怎样解决这个问题？我们的产品能在哪一点上帮得更多？",
  "你准备先找谁试用？怎样知道这个产品确实帮到了他们？",
  "谁可能愿意付钱？你会怎样确认他们是真的愿意付钱？",
  "哪些个人信息可以少收集或不收集？你会怎样保护使用者？",
];
export const DEFENSE_QUESTIONS = [
  "你现在支持先试一试这个项目吗？请说一个理由，也可以说还缺哪些信息。",
  "如果只能先验证一件事，你会验证什么？你准备怎么做？",
  "出现什么结果时，你会暂停或修改这个项目？请给出一个可以观察的信号。",
];
export type ExpEvent = {
  id?: string;
  event_type: string;
  stage: string;
  payload: Record<string, unknown>;
  created_at?: string;
};
export function replies(events: ExpEvent[], stage: string) {
  return events.filter((e) => e.stage === stage && e.event_type === "reply");
}
export function validateCore(data: Record<string, unknown>) {
  if (
    !["支持", "有条件支持", "暂不支持", "尚不确定"].includes(
      String(data.judgment),
    )
  )
    throw new Error("请选择你的判断");
  for (const key of ["assumptions", "risk"])
    if (
      typeof data[key] !== "string" ||
      !String(data[key]).trim() ||
      String(data[key]).length > 6000
    )
      throw new Error("请填写关键条件和风险；不确定可以如实填写");
  if (
    typeof data.confidence !== "number" ||
    !Number.isInteger(data.confidence) ||
    data.confidence < 1 ||
    data.confidence > 5
  )
    throw new Error("把握程度必须选择1—5分");
  return {
    judgment: data.judgment,
    assumptions: String(data.assumptions).trim(),
    risk: String(data.risk).trim(),
    confidence: data.confidence,
  };
}
export function completionProblem(
  stage: string,
  events: ExpEvent[],
): string | null {
  const has = (type: string) =>
    events.some((e) => e.stage === stage && e.event_type === type);
  if (stage === "t0" || stage === "t1")
    return has("assessment") ? null : "请先提交本阶段的独立判断";
  if (stage === "orient")
    return has("orientation") ? null : "请先确认已读懂案例";
  if (stage === "cockpit") return has("plan") ? null : "请先保存自己的初步方案";
  if (stage === "expert")
    return replies(events, stage).length < 5
      ? "请完成5轮专家打磨；不会回答时可说明原因并跳过"
      : has("revision")
        ? null
        : "请保存修改后的方案或说明保留原方案的理由";
  if (stage === "defense")
    return replies(events, stage).length < 3
      ? "请处理全部3题；暂时不会可以说明原因并跳过"
      : null;
  if (stage === "survey") return has("survey") ? null : "请先提交学习反馈";
  return "当前阶段不能继续";
}
export function nextStage(stage: string) {
  return STEPS[STEPS.indexOf(stage as Stage) + 1];
}
export function summarize(events: ExpEvent[]) {
  const pre = events.find(
    (e) => e.stage === "t0" && e.event_type === "assessment",
  );
  const post = events.find(
    (e) => e.stage === "t1" && e.event_type === "assessment",
  );
  const answers = events.filter((e) => e.event_type === "reply");
  return {
    paired: !!(pre && post),
    pre: !!pre,
    post: !!post,
    answers: answers.filter((e) => e.payload.responseStatus === "answered")
      .length,
    skipped: answers.filter((e) => e.payload.responseStatus === "skipped")
      .length,
    help: events.filter((e) => e.event_type === "help").length,
    completed: events.some(
      (e) => e.event_type === "advance" && e.payload.next === "completed",
    ),
    abilityScore: null,
  };
}

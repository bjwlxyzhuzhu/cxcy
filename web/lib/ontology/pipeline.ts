// 产品线 8 步 · 步骤说明与模块挂接（前后端共用，不含服务端代码）
// 每步写清：AI 起草什么、学生认证什么、完成条件（与 lib/ontology/progress.ts 的判定规则一致）。

export type StepStatus = "done" | "doing" | "todo" | "soon";
export const STEP_STATUS_LABEL: Record<StepStatus, string> = { done: "已完成", doing: "进行中", todo: "未开始", soon: "即将上线" };

export type Tool = { label: string; href: string };
export type StepGuide = {
  step: number; key: string; label: string; goal: string;
  ai: string; you: string; doneWhen: string; tools: Tool[];
};

const ONTO = "/apply/ontology";

export const STEP_GUIDE: StepGuide[] = [
  {
    step: 1, key: "track", label: "赛道画像", goal: "看清你要进入的赛道和目标人群",
    ai: "根据政策库、案例库和你的调研资料起草赛道画像",
    you: "选定一个赛道画像，改成你们的判断后认证",
    doneWhen: "至少 1 个赛道画像已认证",
    tools: [{ label: "选题匹配", href: "/apply/topic" }, { label: "政策库", href: "/learn/policy" }, { label: "案例库", href: "/learn/cases" }, { label: "项目本体", href: ONTO }],
  },
  {
    step: 2, key: "hmw", label: "HMW 问题", goal: "从真实用户原话里找到值得解决的问题",
    ai: "从上传的访谈、问卷中抽取证据与“我们如何……”问题",
    you: "逐条核对原话出处，认证要做的 HMW 问题",
    doneWhen: "至少 1 个 HMW 问题已认证",
    tools: [{ label: "项目本体", href: ONTO }, { label: "分身工坊", href: "/apply/twin" }],
  },
  {
    step: 3, key: "brief", label: "产品任务书", goal: "写清做什么、怎么验证、有什么风险",
    ai: "起草功能清单、验证指标与风险",
    you: "删改到你们真正要做的范围，认证任务书",
    doneWhen: "至少 1 份产品任务书已认证",
    tools: [{ label: "创业星舰", href: "/apply/cockpit" }, { label: "项目本体", href: ONTO }],
  },
  {
    step: 4, key: "v01", label: "V0.1", goal: "做出能让真实用户试用的最小版本",
    ai: "生成原型说明与测试问卷",
    you: "确认版本内容后发布 V0.1（认证即发布）",
    doneWhen: "V0.1 已发布",
    tools: [{ label: "驾驶舱", href: "/apply/cockpit" }, { label: "技能商店", href: "/apply/skills" }, { label: "项目本体", href: ONTO }],
  },
  {
    step: 5, key: "test", label: "测试报告", goal: "用真实用户测试 V0.1，拿到证据",
    ai: "汇总问卷与访谈结果、标注证据、计算指标",
    you: "注明来源并认证证据，认证测试报告",
    doneWhen: "测试报告已认证，且至少 1 条证据已认证",
    tools: [{ label: "虚实对局", href: "/apply/arena" }, { label: "项目本体", href: ONTO }],
  },
  {
    step: 6, key: "v02", label: "V0.2", goal: "用证据决定保留、修改还是放弃",
    ai: "按证据给出“保留 / 修改 / 放弃”建议和变更清单",
    you: "逐条做决策（必须挂证据），再发布 V0.2",
    doneWhen: "V0.2 已发布（必须源于已认证的决策）",
    tools: [{ label: "专家打磨", href: "/apply/expert" }, { label: "项目本体", href: ONTO }],
  },
  {
    step: 7, key: "pitch", label: "路演 HTML", goal: "把证据链讲成一场路演",
    ai: "按已认证的本体自动生成离线可播的路演页（不调用模型、不扣积分）",
    you: "审阅路演页，确认无误后点“审阅确认”；内容有误就回到对应对象修改后重新生成",
    doneWhen: "路演页已审阅确认",
    tools: [{ label: "模拟答辩", href: "/apply/defense" }],
  },
  {
    step: 8, key: "archive", label: "项目档案", goal: "沉淀证据链、版本与决策日志",
    ai: "自动归档已认证的本体、版本、证据链、决策日志与操作统计",
    you: "点“生成项目档案”即可（自动归档，可撤回）",
    doneWhen: "项目档案已生成",
    tools: [{ label: "成长星图", href: "/me/growth" }],
  },
];

/** 每步的“AI 起草”对应的起草类型（第 2 步由“上传资料 → AI 自动建本体”完成） */
export const STEP_GEN: Record<number, string> = { 1: "track", 3: "brief", 4: "v01", 5: "test", 6: "v02" };
export const STEP_ARTIFACT: Record<number, "pitch" | "archive"> = { 7: "pitch", 8: "archive" };

/** 现有模块对应产品线第几步（页面顶部提示条用） */
export const MODULE_STEP: Record<string, number> = {
  "/apply/topic": 1, "/learn/policy": 1, "/learn/cases": 1,
  "/apply/twin": 2, "/apply/ontology": 2,
  "/apply/cockpit": 4, "/apply/skills": 4,
  "/apply/arena": 5,
  "/apply/expert": 6,
  "/apply/defense": 7,
  "/me/growth": 8,
};

/** 当前项目：每个浏览器记住上次选的项目（只是便利，不是权限依据） */
export const CURRENT_PROJECT_LS = "sx_current_project";
export function getCurrentProject(): string {
  try { return localStorage.getItem(CURRENT_PROJECT_LS) || ""; } catch { return ""; }
}
export function setCurrentProject(id: string) {
  try { localStorage.setItem(CURRENT_PROJECT_LS, id); window.dispatchEvent(new Event("sx-project")); } catch { /* 忽略 */ }
}

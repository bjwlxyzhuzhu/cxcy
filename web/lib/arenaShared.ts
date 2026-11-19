// 虚实对局 · 前后端共用的常量与类型（不含任何密钥，可在客户端导入）。

export type Stance = "challenge" | "support";

export type RoleType = {
  key: string;
  label: string;
  icon: string;
  stance: Stance;            // challenge=对抗方（质询、压测假设）；support=协作方（帮你修正、补证据）
  kind: "twin" | "role";     // twin=学生调研注入；role=教师注入的角色原型
  hint: string;
};

/** 学生调研可注入的分身类型 */
export const TWIN_TYPES: RoleType[] = [
  { key: "customer",   label: "目标用户",   icon: "🧑‍💼", stance: "challenge", kind: "twin", hint: "真实使用者：痛点、习惯、愿付多少钱" },
  { key: "buyer",      label: "采购决策者", icon: "🏭", stance: "challenge", kind: "twin", hint: "B 端买单的人：预算、审批流程、替代方案" },
  { key: "competitor", label: "竞品方",     icon: "⚔️", stance: "challenge", kind: "twin", hint: "已在做这件事的人：他们的优势与看法" },
  { key: "supplier",   label: "供应/合作方", icon: "🔗", stance: "support",   kind: "twin", hint: "上下游伙伴：能提供什么、合作条件" },
  { key: "expert",     label: "行业专家",   icon: "🎓", stance: "support",   kind: "twin", hint: "懂行的人：行业规律、常见坑" },
];

/** 教师注入的角色原型（按官方评审规则与团队教师分工设计，不仿真实的某位专家） */
export const ROLE_TYPES: RoleType[] = [
  { key: "judge",    label: "大赛评委",   icon: "⚖️", stance: "challenge", kind: "role", hint: "按中国国际大学生创新大赛评审维度连环追问" },
  { key: "investor", label: "天使投资人", icon: "💰", stance: "challenge", kind: "role", hint: "盯市场规模、单位经济、团队与退出" },
  { key: "mentor",   label: "创业导师",   icon: "🧭", stance: "support",   kind: "role", hint: "帮你把被证伪的假设改成更好的方案" },
  { key: "ethics",   label: "伦理审查官", icon: "🛡️", stance: "support",   kind: "role", hint: "技术向善、数据隐私、社会责任（思政教师把关）" },
  { key: "business", label: "商业分析师", icon: "📊", stance: "support",   kind: "role", hint: "商业模式、成本收入、定价（经管教师把关）" },
  { key: "legal",    label: "合规顾问",   icon: "📜", stance: "support",   kind: "role", hint: "知识产权、合同、数据合规（法学教师把关）" },
  { key: "industry", label: "产业导师",   icon: "🔩", stance: "support",   kind: "role", hint: "钛产业一线视角：真实工况、谁买单" },
];

export const ALL_TYPES: RoleType[] = [...TWIN_TYPES, ...ROLE_TYPES];
export const TYPE_BY_KEY: Record<string, RoleType> = Object.fromEntries(ALL_TYPES.map((t) => [t.key, t]));

export type PersonaCard = {
  identity?: string;         // 身份画像（角色原型，不含真实姓名）
  context?: string;          // 所处场景
  pains?: string[];          // 痛点
  goals?: string[];          // 目标/期望
  budget?: string;           // 预算/付费意愿
  decision_logic?: string;   // 决策逻辑
  objections?: string[];     // 常见异议/顾虑
  quotes?: string[];         // 访谈原话（≤5 条）
  source?: { method?: string; date?: string; n?: string };  // 调研方式/时间/样本数
  focus?: string;            // 角色原型：关注重点（教师注入用）
};

export type HypStatus = "pending" | "falsified" | "verifying" | "verified";
export const HYP_LABEL: Record<HypStatus, string> = {
  pending: "待验证", falsified: "已证伪", verifying: "待确认", verified: "已验证",
};
export const HYP_COLOR: Record<HypStatus, string> = {
  pending: "#fbbf24", falsified: "#f87171", verifying: "#a78bfa", verified: "#34d399",
};

/**
 * 积分规则：记在证据上，不按聊天轮数。
 * 虚拟交锋只能得小分；大分必须回到现实中验证（教师确认）。
 */
export const POINTS = {
  evidence_reply: 1,   // 回应质询时给出了具体证据（数据/访谈/实测）
  hypothesis: 1,       // 提出一条可检验的假设（每轮每队前 5 条计分）
  falsify: 3,          // 主动证伪自己的假设并写出修正
  verify: 5,           // 现实验证通过（教师确认）
  twin_hit: 1,         // 你队做的分身，让别队证伪了一条假设（奖励高质量调研）
  collab: 1,           // 采纳协作方建议形成修正
} as const;

export const RULES_TEXT = [
  `回应质询时拿出具体证据（数据 / 访谈原话 / 实测）：+${POINTS.evidence_reply}`,
  `提出一条可检验的假设：+${POINTS.hypothesis}（每轮每队前 5 条）`,
  `证伪自己的假设并写出修正：+${POINTS.falsify}`,
  `回到现实验证并经教师确认：+${POINTS.verify}`,
  `你队做的分身让别队证伪了假设：+${POINTS.twin_hit}（奖励扎实调研）`,
  `分身说"我的资料里没有"＝该去现实中问了：一键加入待验证假设`,
];

export const SOURCE_METHODS = ["深度访谈", "问卷调查", "实地观察", "企业走访", "公开资料"];

export const CONSENT_ITEMS = [
  "受访者已知情同意，知道访谈内容会用于课程中的角色模拟",
  "资料中不含真实姓名、手机号、身份证号等个人信息（系统会再次自动隐去）",
  "分身只代表一类角色原型，不冒充任何真实个人或企业",
];

/** 角色头像（public/avatars，AI 生成的虚拟形象，只代表角色原型） */
export const avatarOf = (roleType: string): string => `/avatars/${TYPE_BY_KEY[roleType] ? roleType : "customer"}.jpg`;

/** 学生战队的五个席位：入队时选择，大屏只显示席位与头像，不显示姓名 */
export const SEATS = ["队长", "调研", "产品", "财务", "路演"];
export const seatAvatar = (seat: number): string => `/avatars/s${(((seat % 5) + 5) % 5) + 1}.jpg`;

/** 对战条：假设护盾（说法拿不出证据就下降）与质疑值（拿出证据就下降） */
export const BAR = { doubtPerEvidence: 18, shieldPerMiss: 16, shieldPerUnknown: 12 } as const;

// 项目本体 · 定义层（前后端共用，不含任何服务端代码与密钥）
// 描述“项目里有什么”：对象类型、属性、认证规则，以及对象之间允许的关系。
// 动作引擎（lib/ontology/engine.ts）按这里的定义做校验；界面按这里的中文名渲染。

export type FieldKind = "text" | "longtext" | "list" | "int" | "date" | "enum" | "json";
export type FieldDef = { key: string; label: string; kind: FieldKind; options?: { value: string; label: string }[]; max?: number };

export type ObjectStatus = "draft" | "certified" | "confirmed" | "rejected";
export const STATUS_LABEL: Record<ObjectStatus, string> = {
  draft: "草稿", certified: "已认证", confirmed: "教师已确认", rejected: "已驳回",
};
export type Origin = "ai" | "human";
export const ORIGIN_LABEL: Record<Origin, string> = { ai: "AI 起草", human: "人工填写" };

/** 证据的真实来源类型（认证证据时必选其一；“AI 生成”不是来源） */
export const SOURCE_KINDS = [
  { value: "interview", label: "访谈记录" },
  { value: "survey", label: "问卷结果" },
  { value: "test", label: "实测 / 用户测试" },
  { value: "observation", label: "实地观察" },
  { value: "document", label: "文件 / 单据" },
  { value: "public_data", label: "公开数据（注明出处）" },
] as const;

export type ObjectTypeDef = {
  key: string;
  table: string;
  label: string;                 // 中文名
  step?: number;                 // 对应产品线第几步（1–8）
  titleField: string;            // 列表里显示哪个字段
  fields: FieldDef[];            // 可编辑字段（白名单）
  /** 认证前必须挂真实来源（AI 起草的内容不是证据） */
  requireSourceToCertify?: boolean;
  /** 是否走 草稿→认证→教师确认 的三态流程（假设、分身有自己的生命周期，不走） */
  certifiable: boolean;
};

const VERDICTS = [
  { value: "keep", label: "保留" }, { value: "modify", label: "修改" }, { value: "drop", label: "放弃" },
];
const EVIDENCE_KINDS = [
  { value: "interview", label: "访谈" }, { value: "survey", label: "问卷" }, { value: "test", label: "实测" },
  { value: "observation", label: "观察" }, { value: "document", label: "文档" }, { value: "data", label: "数据" },
];

export const OBJECT_TYPES: ObjectTypeDef[] = [
  {
    key: "track_profile", table: "track_profiles", label: "赛道画像", step: 1, titleField: "title", certifiable: true,
    fields: [
      { key: "title", label: "标题", kind: "text", max: 80 },
      { key: "track", label: "赛道", kind: "text", max: 60 },
      { key: "audience", label: "目标人群", kind: "text", max: 200 },
      { key: "summary", label: "画像概述", kind: "longtext", max: 2000 },
      { key: "trends", label: "趋势与变化", kind: "list" },
      { key: "opportunities", label: "机会点", kind: "list" },
    ],
  },
  {
    key: "hmw", table: "hmw_questions", label: "HMW 问题", step: 2, titleField: "text", certifiable: true,
    fields: [
      { key: "text", label: "我们如何……", kind: "text", max: 200 },
      { key: "user_quote", label: "引发问题的用户原话", kind: "longtext", max: 500 },
      { key: "rationale", label: "为什么值得做", kind: "longtext", max: 1000 },
    ],
  },
  {
    key: "task_brief", table: "task_briefs", label: "产品任务书", step: 3, titleField: "title", certifiable: true,
    fields: [
      { key: "title", label: "标题", kind: "text", max: 80 },
      { key: "goal", label: "要解决的问题与目标", kind: "longtext", max: 1000 },
      { key: "features", label: "功能清单", kind: "list" },
      { key: "metrics", label: "验证指标", kind: "list" },
      { key: "risks", label: "风险", kind: "list" },
    ],
  },
  {
    key: "product_version", table: "product_versions", label: "产品版本", step: 4, titleField: "label", certifiable: true,
    fields: [
      { key: "label", label: "版本号", kind: "text", max: 20 },
      { key: "summary", label: "版本说明", kind: "longtext", max: 2000 },
      { key: "changes", label: "相对上一版的改动", kind: "list" },
    ],
  },
  {
    key: "evidence", table: "evidence_items", label: "调研证据", step: 5, titleField: "content", certifiable: true, requireSourceToCertify: true,
    fields: [
      { key: "kind", label: "证据类型", kind: "enum", options: EVIDENCE_KINDS },
      { key: "content", label: "证据摘要", kind: "longtext", max: 1000 },
      { key: "quote", label: "原话 / 原始记录", kind: "longtext", max: 1000 },
      { key: "sample_n", label: "样本量", kind: "int" },
      { key: "collected_at", label: "采集日期", kind: "date" },
    ],
  },
  {
    key: "test_report", table: "test_reports", label: "测试报告", step: 5, titleField: "title", certifiable: true,
    fields: [
      { key: "title", label: "标题", kind: "text", max: 80 },
      { key: "summary", label: "结论摘要", kind: "longtext", max: 2000 },
      { key: "metrics", label: "指标结果", kind: "json" },
      { key: "findings", label: "主要发现", kind: "list" },
    ],
  },
  {
    key: "decision", table: "decisions", label: "迭代决策", step: 6, titleField: "subject", certifiable: true,
    fields: [
      { key: "verdict", label: "决定", kind: "enum", options: VERDICTS },
      { key: "subject", label: "针对什么", kind: "text", max: 200 },
      { key: "rationale", label: "依据与理由", kind: "longtext", max: 1000 },
    ],
  },
  {
    key: "glossary_term", table: "glossary_terms", label: "术语口径", titleField: "term", certifiable: true,
    fields: [
      { key: "term", label: "术语", kind: "text", max: 40 },
      { key: "definition", label: "定义 / 口径", kind: "longtext", max: 600 },
      { key: "formula", label: "怎么算", kind: "text", max: 200 },
      { key: "aliases", label: "同义说法", kind: "list" },
      { key: "examples", label: "例子 / 反例", kind: "list" },
    ],
  },
  // 以下对象有自己的生命周期（不走三态认证），只参与关系
  { key: "hypothesis", table: "hypotheses", label: "假设", titleField: "text", certifiable: false, fields: [] },
  { key: "persona", table: "personas", label: "用户分身", titleField: "label", certifiable: false, fields: [] },
];

export const TYPE_BY_KEY: Record<string, ObjectTypeDef> = Object.fromEntries(OBJECT_TYPES.map((t) => [t.key, t]));

/** 关系类型：方向、允许的起点与终点对象类型 */
export type LinkDef = { key: string; label: string; src: string[]; dst: string[] };
export const LINK_TYPES: LinkDef[] = [
  { key: "within", label: "属于赛道", src: ["hmw"], dst: ["track_profile"] },
  { key: "based_on", label: "基于", src: ["hmw", "persona"], dst: ["evidence"] },
  { key: "addresses", label: "回应", src: ["task_brief", "product_version"], dst: ["hmw"] },
  { key: "derived_from", label: "源自", src: ["hypothesis"], dst: ["hmw", "task_brief"] },
  { key: "supports", label: "支持", src: ["evidence"], dst: ["hypothesis"] },
  { key: "refutes", label: "反驳", src: ["evidence"], dst: ["hypothesis"] },
  { key: "part_of", label: "收录于", src: ["evidence"], dst: ["test_report"] },
  { key: "tests", label: "测试", src: ["test_report"], dst: ["product_version"] },
  { key: "cites", label: "依据", src: ["decision"], dst: ["evidence", "test_report"] },
  { key: "about", label: "针对", src: ["decision"], dst: ["hypothesis", "task_brief", "product_version"] },
  { key: "implements", label: "实现", src: ["product_version"], dst: ["task_brief"] },
  { key: "results_from", label: "源于决策", src: ["product_version"], dst: ["decision"] },
];
export const LINK_BY_KEY: Record<string, LinkDef> = Object.fromEntries(LINK_TYPES.map((l) => [l.key, l]));

/** 产品线 8 步（海报“LINE 01 数智产品开发”） */
export const PIPELINE = [
  { step: 1, key: "track", label: "赛道画像" },
  { step: 2, key: "hmw", label: "HMW 问题" },
  { step: 3, key: "brief", label: "产品任务书" },
  { step: 4, key: "v01", label: "V0.1" },
  { step: 5, key: "test", label: "测试报告" },
  { step: 6, key: "v02", label: "V0.2" },
  { step: 7, key: "pitch", label: "路演 HTML" },
  { step: 8, key: "archive", label: "项目档案" },
] as const;

import {
  STAGE_LABELS,
  STEPS,
  summarize,
  type ExpEvent,
} from "./experiment-protocol";
import { scenarioFor } from "./experiment-scenarios";
import type { Report } from "./report-export";
export type ExportRun = {
  id: string;
  title: string;
  protocol_version: string;
  scenario?: unknown;
  status?: string;
  starts_at?: unknown;
};
export type ExportParticipant = {
  id: string;
  run_id?: string;
  participant_code: string;
  cohort: string;
  stage: string;
  consent?: boolean;
  created_at?: unknown;
};
export type ExportEvent = ExpEvent & {
  participant_id?: string;
  run_id?: string;
};
export const cohortLabel = (cohort: string) =>
  cohort === "single"
    ? "A组（综合专家）"
    : cohort === "panel"
      ? "B组（五位专家）"
      : "分组待核对";
const phase = (stage: string) =>
  stage === "t0" ? "前测" : stage === "t1" ? "后测" : "过程/反馈";
const eventLabels: Record<string, string> = {
  assessment: "独立判断",
  orientation: "案例导读",
  plan: "初步方案V0",
  revision: "修改方案V1",
  question: "专家问题",
  reply: "学生作答",
  help: "AI帮助",
  help_requested: "求助请求",
  advance: "进入下一步",
  survey: "体验反馈",
  draft: "未提交草稿",
};
const timestamp = (v: unknown) => {
  if (!v) return null;
  const ms = new Date(v as string).getTime();
  return Number.isFinite(ms) ? ms : null;
};
export const utcTime = (v: unknown) => {
  const ms = timestamp(v);
  return ms === null ? null : new Date(ms).toISOString();
};
export const beijingTime = (v: unknown) => {
  const ms = timestamp(v);
  return ms === null
    ? null
    : new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }).format(ms);
};
export function learningReport(
  session: Record<string, unknown>,
  records: Record<string, unknown>[],
  studentNo?: string,
): Report {
  return {
    title: String(session.title),
    metadata: {
      session_id: session.id,
      module: session.module,
      ...(studentNo ? { 学号: studentNo } : {}),
      创建时间: beijingTime(session.created_at),
      最后更新时间: beijingTime(session.updated_at),
      时间口径:
        "北京时间（UTC+8）；普通练习未规定完成节点，不将最后更新称为完成时间。",
      测试类型: "普通练习，无实验分组和前后测",
    },
    rows: records.map((r) => ({
      ...r,
      提交时间: beijingTime(r.created_at),
      提交时间UTC: utcTime(r.created_at),
      发言方: r.role === "user" ? "学生" : "AI",
      分组: "不适用（普通练习）",
      测量阶段: "不适用（普通练习）",
    })),
  };
}
const elapsed = (start: unknown, end: unknown) => {
  const a = timestamp(start),
    b = timestamp(end);
  return a === null || b === null || b < a ? null : Math.round((b - a) / 1000);
};
const coreColumns = [
  "实验编号",
  "实验名称",
  "案例名称",
  "案例版本",
  "协议版本",
  "固定编号",
  "分组",
  "cohort",
  "测量阶段",
  "量表版本",
  "判断",
  "关键条件",
  "风险及理由",
  "把握程度1至5",
  "提交时间",
];
export function experimentReport(input: {
  title: string;
  runs: ExportRun[];
  participants: ExportParticipant[];
  events: ExportEvent[];
  drafts?: ExportEvent[];
  cohort?: string | null;
  stage?: string | null;
  audience?: "research" | "teaching" | "self";
}): Report {
  const runs = new Map(input.runs.map((r) => [r.id, r]));
  const people = input.participants.filter(
    (p) =>
      (input.audience === "teaching" ||
        input.audience === "self" ||
        p.consent !== false) &&
      (!input.cohort || p.cohort === input.cohort),
  );
  const base = (p: ExportParticipant) => {
    const run = runs.get(p.run_id || input.runs[0]?.id);
    const s = scenarioFor(run?.scenario);
    return {
      实验编号: run?.id,
      实验名称: run?.title,
      案例名称: s.title,
      案例版本: s.id,
      协议版本: run?.protocol_version,
      固定编号: p.participant_code,
      分组: cohortLabel(p.cohort),
      cohort: p.cohort,
    };
  };
  const byPerson = (p: ExportParticipant) =>
    input.events.filter((e) => e.participant_id === p.id);
  const started = (p: ExportParticipant) => {
    const join = timestamp(p.created_at),
      open = timestamp(runs.get(p.run_id || input.runs[0]?.id)?.starts_at);
    return join === null || open === null
      ? null
      : new Date(Math.max(join, open)).toISOString();
  };
  const measure = (e?: ExportEvent) => ({
    判断: e?.payload.judgment ?? null,
    关键条件: e?.payload.assumptions ?? null,
    风险及理由: e?.payload.risk ?? null,
    把握程度1至5: e?.payload.confidence ?? null,
    量表版本: e?.payload.instrument ?? "旧量表/待核对",
    提交时间: beijingTime(e?.created_at),
    提交时间UTC: utcTime(e?.created_at),
  });
  const summaries = people.map((p) => {
    const es = byPerson(p),
      s = summarize(es);
    const end = es.find(
      (e) => e.event_type === "advance" && e.payload.next === "completed",
    )?.created_at;
    return {
      ...base(p),
      加入时间: beijingTime(p.created_at),
      可开始时间: beijingTime(started(p)),
      最后记录时间: beijingTime(es.at(-1)?.created_at),
      完成时间: beijingTime(end),
      全程经过秒数: elapsed(started(p), end),
      当前步骤: STAGE_LABELS[p.stage] || p.stage,
      前测状态: s.pre ? "已提交" : "缺失",
      后测状态: s.post ? "已提交" : "缺失",
      完成状态: s.completed ? "已完成" : "未完成",
      独立回答条数: s.answers,
      跳过条数: s.skipped,
      求助条数: s.help,
      能力总分: null,
    };
  });
  const assessments = people.flatMap((p) =>
    byPerson(p)
      .filter(
        (e) =>
          e.event_type === "assessment" &&
          ["t0", "t1"].includes(e.stage) &&
          (!input.stage || e.stage === input.stage),
      )
      .map((e) => ({
        ...base(p),
        测量阶段: phase(e.stage),
        ...measure(e),
        观点变化: e.payload.change ?? null,
      })),
  );
  const pairs = people.map((p) => {
    const es = byPerson(p);
    const pre = es.find(
      (e) => e.stage === "t0" && e.event_type === "assessment",
    );
    const post = es.find(
      (e) => e.stage === "t1" && e.event_type === "assessment",
    );
    const compatible =
      pre?.payload.instrument === "core-v2" &&
      post?.payload.instrument === "core-v2";
    return {
      ...base(p),
      配对状态:
        !pre && !post
          ? "前后测均缺失"
          : !pre
            ? "缺前测"
            : !post
              ? "缺后测"
              : compatible
                ? "同量表已配对"
                : "前后测存在，量表待核对",
      ...Object.fromEntries(
        Object.entries(measure(pre)).map(([k, v]) => ["前测_" + k, v]),
      ),
      ...Object.fromEntries(
        Object.entries(measure(post)).map(([k, v]) => ["后测_" + k, v]),
      ),
      后测_观点变化: post?.payload.change ?? null,
      能力提升总分: null,
    };
  });
  const map = new Map(people.map((p) => [p.id, p]));
  const processRows = [...input.events, ...(input.drafts || [])]
    .filter(
      (e) =>
        map.has(e.participant_id || "") &&
        (!input.stage || e.stage === input.stage),
    )
    .map((e) => ({
      ...base(map.get(e.participant_id!)!),
      测量阶段: phase(e.stage),
      模块: STAGE_LABELS[e.stage] || e.stage,
      记录类型: eventLabels[e.event_type] || e.event_type,
      轮次: e.payload.round ?? null,
      专家角色: e.payload.role ?? null,
      回答状态:
        e.payload.responseStatus === "skipped"
          ? "跳过"
          : e.payload.responseStatus === "answered"
            ? "已回答"
            : null,
      内容: e.payload.text ?? null,
      记录时间: beijingTime(e.created_at),
      记录时间UTC: utcTime(e.created_at),
      题目生成至提交间隔秒:
        e.event_type === "reply"
          ? elapsed(
              input.events.find(
                (q) =>
                  q.participant_id === e.participant_id &&
                  q.stage === e.stage &&
                  q.event_type === "question" &&
                  q.payload.round === e.payload.round,
              )?.created_at,
              e.created_at,
            )
          : null,
      stage: e.stage,
      event_type: e.event_type,
      payload: e.payload,
    }));
  const groups = input.runs
    .flatMap((r) =>
      ["single", "panel"].map((cohort) => {
        const ps = summaries.filter(
          (s) => s.实验编号 === r.id && s.cohort === cohort,
        );
        return {
          实验编号: r.id,
          实验名称: r.title,
          案例名称: scenarioFor(r.scenario).title,
          分组: cohortLabel(cohort),
          纳入人数: ps.length,
          前测提交人数: ps.filter((p) => p.前测状态 === "已提交").length,
          后测提交人数: ps.filter((p) => p.后测状态 === "已提交").length,
          同量表配对人数: pairs.filter(
            (p) =>
              p.实验编号 === r.id &&
              p.cohort === cohort &&
              p.配对状态 === "同量表已配对",
          ).length,
          完成人数: ps.filter((p) => p.完成状态 === "已完成").length,
        };
      }),
    )
    .filter((g) => !input.cohort || g.分组 === cohortLabel(input.cohort));
  const timing = people.flatMap((p) =>
    STEPS.filter(
      (s) => s !== "completed" && (!input.stage || input.stage === s),
    ).map((stage) => {
      const es = byPerson(p);
      const start =
        stage === "t0"
          ? started(p)
          : es.find(
              (e) => e.event_type === "advance" && e.payload.next === stage,
            )?.created_at;
      const end = es.find(
        (e) => e.event_type === "advance" && e.stage === stage,
      )?.created_at;
      return {
        ...base(p),
        阶段: STAGE_LABELS[stage],
        阶段开始时间: beijingTime(start),
        阶段结束时间: beijingTime(end),
        阶段经过秒数: elapsed(start, end),
        首条记录时间: beijingTime(
          es.find((e) => e.stage === stage)?.created_at,
        ),
        最后记录时间: beijingTime(
          es.filter((e) => e.stage === stage).at(-1)?.created_at,
        ),
        口径: "北京时间；服务器记录的经过时间，包含离线与停留，非有效学习时长；缺失为NA",
      };
    }),
  );
  const sections = [
    { name: "分组汇总", rows: groups },
    { name: "参与者与缺项", rows: summaries },
    {
      name: "前测",
      rows: assessments.filter((a) => a.测量阶段 === "前测"),
      columns: coreColumns,
    },
    {
      name: "后测",
      rows: assessments.filter((a) => a.测量阶段 === "后测"),
      columns: coreColumns,
    },
    { name: "前后测配对", rows: pairs },
    { name: "阶段用时", rows: timing },
    { name: "过程记录", rows: processRows },
  ];
  return {
    title: input.title,
    metadata: {
      时间口径:
        "北京时间（Asia/Shanghai，UTC+8）；另保留原始UTC时间。经过时长包含离线和停留，不代表有效学习时长，缺失为NA。",
      导出时间: new Date().toISOString(),
      分组筛选: input.cohort ? cohortLabel(input.cohort) : "全部分组",
      阶段筛选: input.stage
        ? STAGE_LABELS[input.stage] || input.stage
        : "全部阶段",
      说明: "按实验编号+固定编号配对；分组汇总和配对表始终是本实验完整快照，前后测和过程表按阶段筛选。缺失为NA，不按0分计算，不合并不同题材或量表计算能力总分。A/B沿用实际cohort，不根据姓名或编号猜测。",
    },
    rows: sections.flatMap((s) =>
      s.rows.map((r) => ({ 数据表: s.name, ...r })),
    ),
    sections,
  };
}

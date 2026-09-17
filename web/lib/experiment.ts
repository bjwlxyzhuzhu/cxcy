import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { query, withTransaction } from "@/lib/db";
import { getSessionUser } from "@/lib/auth-local";

export const EXP_COOKIE = "cxcy_experiment_session";
export const CASE_TEXT =
  "某大学生团队拟开发一款“AI学习与就业陪伴平台”，为大学生提供学习规划、职业方向分析、简历优化、模拟面试以及学习和情绪陪伴。团队认为学习压力和就业焦虑带来市场需求，准备采用会员订阅，并通过高校、自媒体和校园社群推广；系统会采集学习情况、求职信息及部分个人偏好数据。核心任务：形成初步商业方案，并判断是否值得进入正式创业验证阶段。";
export const EXPERT_ROLES = [
  "教育科研专家",
  "产业行业专家",
  "企业专家",
  "投资人专家",
  "风险、伦理与证据专家",
] as const;
export const COCKPIT_ROLES = [
  "主执行者·熊猫主席",
  "市场专家",
  "产品专家",
  "财务专家",
  "风险专家",
] as const;
export type ExperimentParticipant = {
  id: string;
  run_id: string;
  participant_code: string;
  protocol_version: string;
  recovery_code: string;
  cohort: "single" | "panel";
  consent: boolean;
  stage: string;
  run_title: string;
  starts_at: string | null;
  status: string;
  duration_minutes: number;
};

export function makeCode(n = 8) {
  return randomBytes(8).toString("hex").slice(0, n).toUpperCase();
}
export function nowStage(pick: ExperimentParticipant) {
  if (pick.protocol_version === "guided-v2") {
    if (pick.status === "closed")
      return { key: "closed", label: "实验已关闭，仍可导出记录" };
    if (pick.status !== "active")
      return { key: "waiting", label: "等待教师开始" };
    return {
      key: pick.stage === "join" ? "t0" : pick.stage,
      label: pick.stage,
    };
  }
  if (!pick.starts_at) return { key: "waiting", label: "等待教师开始" };
  const mins = (Date.now() - new Date(pick.starts_at).getTime()) / 60000;
  if (mins < 4) return { key: "t0", label: "初始判断 T0" };
  if (mins < 22) return { key: "cockpit", label: "星舰驾驶舱" };
  if (mins < 34) return { key: "expert", label: "专家打磨" };
  if (mins < 44) return { key: "defense", label: "模拟答辩" };
  if (mins < 48) return { key: "t1", label: "最终判断 T1" };
  if (mins < 50) return { key: "survey", label: "问卷提交" };
  return { key: "closed", label: "实验已结束" };
}
export async function getParticipant() {
  const token = cookies().get(EXP_COOKIE)?.value;
  if (!token) return null;
  const { rows } = await query<ExperimentParticipant>(
    `select p.*, r.title as run_title, r.starts_at, r.status, r.duration_minutes, r.protocol_version from experiment_participants p join experiment_runs r on r.id=p.run_id where p.recovery_code=$1 limit 1`,
    [token],
  );
  return rows[0] || null;
}
export async function requireTeacher() {
  const u = await getSessionUser();
  if (!u || !["teacher", "admin"].includes(u.role))
    throw new Error("TEACHER_REQUIRED");
  return u;
}
export async function recordEvent(
  p: ExperimentParticipant,
  eventType: string,
  stage: string,
  payload: Record<string, unknown>,
) {
  await query(
    "insert into experiment_events(run_id,participant_id,event_type,stage,payload) values($1,$2,$3,$4,$5)",
    [p.run_id, p.id, eventType, stage, payload],
  );
}
export async function joinRun(joinCode: string, consent: boolean) {
  if (!consent) throw new Error("必须同意匿名科研使用说明后才能参加");
  const user = await getSessionUser();
  const result = await withTransaction(async (c) => {
    const run = (
      await c.query(
        "select * from experiment_runs where join_code=$1 for update",
        [joinCode.trim().toUpperCase()],
      )
    ).rows[0];
    if (!run) throw new Error("实验码无效或实验已关闭");
    if (user) {
      const old = (
        await c.query(
          "select * from experiment_participants where run_id=$1 and user_id=$2",
          [run.id, user.id],
        )
      ).rows[0];
      if (old)
        return {
          ...old,
          run_title: run.title,
          starts_at: run.starts_at,
          status: run.status,
          duration_minutes: run.duration_minutes,
          protocol_version: run.protocol_version,
        };
    }
    if (!["draft", "active"].includes(run.status))
      throw new Error("实验已关闭，不能新增参与；已有账号可以恢复记录");
    const count = Number(
      (
        await c.query(
          "select count(*) from experiment_participants where run_id=$1",
          [run.id],
        )
      ).rows[0].count,
    );
    const cohort = count % 2 === 0 ? "single" : "panel";
    const code = randomBytes(24).toString("hex").toUpperCase();
    const participantCode =
      (cohort === "single" ? "A" : "B") +
      "-" +
      randomBytes(8).toString("hex").toUpperCase();
    const p = (
      await c.query(
        "insert into experiment_participants(run_id,recovery_code,participant_code,cohort,consent,user_id) values($1,$2,$3,$4,true,$5) returning *",
        [run.id, code, participantCode, cohort, user?.id || null],
      )
    ).rows[0];
    return {
      ...p,
      run_title: run.title,
      starts_at: run.starts_at,
      status: run.status,
      duration_minutes: run.duration_minutes,
      protocol_version: run.protocol_version,
    };
  });
  cookies().set(EXP_COOKIE, result.recovery_code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return result as ExperimentParticipant;
}

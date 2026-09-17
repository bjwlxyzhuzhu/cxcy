import { requireAdmin } from "@/lib/admin";
import { query } from "@/lib/db";
import { reportResponse } from "@/lib/report-export";
import {
  experimentReport,
  beijingTime,
  type ExportRun,
  type ExportParticipant,
  type ExportEvent,
} from "@/lib/experiment-report";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Row = Record<string, unknown>;
/** 全体教学导出包含身份，仅管理员；与科研同意筛选出口分开。无列表页分页截断。 */
export async function GET(req: Request) {
  const user = await requireAdmin();
  if (!user || user.role !== "admin")
    return Response.json(
      { error: "全体教学数据导出需要管理员权限" },
      { status: 403 },
    );
  try {
    const [users, runs, participants, events, drafts, sessions, records] =
      await Promise.all([
        query("select id,name,student_no,role from users"),
        query<ExportRun>("select * from experiment_runs"),
        query<ExportParticipant & { user_id: string | null }>(
          "select * from experiment_participants",
        ),
        query<ExportEvent>("select * from experiment_events order by id"),
        query<ExportEvent>(
          "select participant_id,stage,payload,updated_at as created_at,'draft' as event_type from experiment_drafts",
        ),
        query("select * from learning_sessions order by created_at,id"),
        query("select * from learning_records order by id"),
      ]);
    const byUser = new Map(users.rows.map((u) => [u.id, u]));
    const identity = (id: unknown) => ({
      账号编号: id || null,
      学号: byUser.get(id)?.student_no ?? null,
      姓名: byUser.get(id)?.name ?? null,
      账号角色: byUser.get(id)?.role ?? "匿名/无关联账号",
    });
    const experiment = experimentReport({
      title: "全体教学测试数据",
      runs: runs.rows,
      participants: participants.rows,
      events: events.rows,
      drafts: drafts.rows,
      audience: "teaching",
    });
    const byCode = new Map(
      participants.rows.map((p) => [
        (p.run_id || "") + ":" + p.participant_code,
        p,
      ]),
    );
    const sections = (experiment.sections || []).map((s) => ({
      ...s,
      rows: s.rows.map((r) => {
        const p = byCode.get(String(r.实验编号) + ":" + String(r.固定编号));
        return p
          ? {
              ...r,
              ...identity(p.user_id),
              研究同意: p.consent ? "已同意" : "未同意/未记录",
            }
          : r;
      }),
    }));
    const sessionMap = new Map(sessions.rows.map((s) => [s.id, s]));
    sections.push({
      name: "普通练习汇总",
      rows: sessions.rows.map((s) => ({
        ...identity(s.user_id),
        练习编号: s.id,
        模块: s.module,
        标题: s.title,
        分组: "不适用（普通练习）",
        测量阶段: "不适用（普通练习）",
        创建时间: beijingTime(s.created_at),
        最后更新时间: beijingTime(s.updated_at),
        创建时间UTC: s.created_at,
        最后更新时间UTC: s.updated_at,
      })),
    });
    sections.push({
      name: "普通对话记录",
      rows: records.rows.map((r) => ({
        ...r,
        ...identity(sessionMap.get(r.session_id)?.user_id),
        模块: sessionMap.get(r.session_id)?.module,
        发言方: r.role === "user" ? "学生/用户原话" : "AI回复",
        提交时间: beijingTime(r.created_at),
        分组: "不适用（普通练习）",
        测量阶段: "不适用（普通练习）",
      })),
    });
    const tables = [
      ["evidence_events", "历史成长证据"],
      ["projects", "历史项目"],
      ["challenge_sessions", "历史答辩"],
      ["dialogue_turns", "历史对话"],
      ["plan_versions", "方案版本"],
      ["intervention_cards", "督导卡"],
    ] as const;
    const history = await Promise.all(
      tables.map(async ([table, name]) => ({
        name,
        rows: (await query(`select * from ${table}`)).rows.map((r: Row) => ({
          ...r,
          ...identity(r.user_id),
          分组: "未绑定课堂分组（保留原始字段待核对）",
          测量阶段: "未绑定课堂前后测（保留原始字段待核对）",
          创建时间: beijingTime(r.created_at),
          开始时间: beijingTime(r.started_at),
          结束时间: beijingTime(r.ended_at),
          更新时间: beijingTime(r.updated_at),
        })),
      })),
    );
    sections.push(...history);
    return await reportResponse(
      {
        title: "全体教学测试数据",
        metadata: {
          ...experiment.metadata,
          数据范围:
            "全部账号的已保存教学数据，含未同意科研使用的记录；仅供教学管理。科研发布请使用单独的研究出口。",
          账号数: users.rows.length,
          实验参与记录数: participants.rows.length,
          普通练习数: sessions.rows.length,
          说明: "包括匿名实验；每行有实际实验/分组/测量阶段。普通练习或无课堂关联的历史数据不猜测分组。身份信息只取账号表；恢复码及密码不导出。",
        },
        sections,
        rows: sections.flatMap((s) =>
          s.rows.map((r) => ({ 数据表: s.name, ...r })),
        ),
      },
      new URL(req.url).searchParams.get("format") || "xlsx",
    );
  } catch (e) {
    console.error(
      "Teaching export failed",
      e instanceof Error ? e.message : "unknown",
    );
    return Response.json(
      {
        error:
          "全体教学数据导出失败，请检查数据库迁移和中文字体；不会把读取失败伪装成空数据。",
      },
      { status: 503 },
    );
  }
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getParticipant,
  joinRun,
  makeCode,
  requireTeacher,
  nowStage,
  EXP_COOKIE,
} from "@/lib/experiment";
import { query, withTransaction } from "@/lib/db";
import {
  PROTOCOL,
  completionProblem,
  nextStage,
  validateCore,
  replies,
  DEFENSE_QUESTIONS,
  EXPERT_ROLES,
  type ExpEvent,
} from "@/lib/experiment-protocol";
import {
  createScenario,
  scenarioFor,
  experimentPath,
} from "@/lib/experiment-scenarios";
import { getSessionUser } from "@/lib/auth-local";
import { syncExperimentSupervision, trySupervision } from "@/lib/supervision";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const p = await getParticipant();
    if (!p) {
      const u = await getSessionUser();
      const myExperiments = u
        ? (
            await query(
              "select r.id,r.title,r.status,r.scenario,p.stage,p.participant_code from experiment_participants p join experiment_runs r on r.id=p.run_id where p.user_id=$1 order by r.created_at desc",
              [u.id],
            )
          ).rows
        : [];
      return NextResponse.json({ participant: null, myExperiments });
    }
    const events = (
      await query(
        "select id,event_type,stage,payload,created_at from experiment_events where participant_id=$1 order by id",
        [p.id],
      )
    ).rows;
    const drafts = (
      await query(
        "select stage,payload,updated_at from experiment_drafts where participant_id=$1",
        [p.id],
      )
    ).rows;
    return NextResponse.json(
      {
        participant: p,
        stage: nowStage(p),
        caseText: scenarioFor(p.scenario).caseText,
        scenario: scenarioFor(p.scenario),
        nextPath: experimentPath(nowStage(p).key),
        events,
        drafts,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "读取实验失败，请重试，已有记录不会清除" },
      { status: 503 },
    );
  }
}
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const action = String(b.action || "");
    if (action === "leave") {
      cookies().delete(EXP_COOKIE);
      return NextResponse.json({ ok: true });
    }
    if (action === "restore") {
      const code = String(b.recoveryCode || "")
        .trim()
        .toUpperCase();
      if (code.length < 10 || code.length > 64)
        throw new Error("恢复码格式不正确");
      const found = (
        await query(
          "select id from experiment_participants where recovery_code=$1",
          [code],
        )
      ).rows[0];
      if (!found)
        throw new Error("恢复码无效，请检查，勿重新加入生成第二个编号");
      cookies().set(EXP_COOKIE, code, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 2592000,
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "resume") {
      const u = await getSessionUser();
      if (!u)
        return NextResponse.json({ error: "请登录原账号" }, { status: 401 });
      const found = (
        await query(
          "select recovery_code from experiment_participants where user_id=$1 and run_id=$2",
          [u.id, b.runId],
        )
      ).rows[0];
      if (!found)
        return NextResponse.json(
          { error: "找不到属于你的实验记录" },
          { status: 404 },
        );
      cookies().set(EXP_COOKIE, found.recovery_code, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 2592000,
      });
      return NextResponse.json({ ok: true });
    }
    if (action === "join") {
      const existing = await getParticipant();
      if (existing) return NextResponse.json({ participant: existing });
      return NextResponse.json({
        participant: await joinRun(
          String(b.joinCode || ""),
          b.consent === true,
        ),
      });
    }
    if (action.startsWith("teacher_")) {
      const u = await requireTeacher();
      if (action === "teacher_create") {
        const scenario = createScenario(b.scenarioId, b.customScenario);
        return NextResponse.json(
          (
            await query(
              "insert into experiment_runs(join_code,title,created_by,protocol_version,scenario) values($1,$2,$3,$4,$5) returning *",
              [
                makeCode(6),
                String(b.title || "双创课堂练习").slice(0, 120),
                u.id,
                PROTOCOL,
                scenario,
              ],
            )
          ).rows[0],
        );
      }
      if (!["teacher_start", "teacher_close"].includes(action))
        throw new Error("未知教师操作");
      const result = await query(
        "update experiment_runs set status=$1,starts_at=case when $1='active' then coalesce(starts_at,now()) else starts_at end where id=$2 and (created_by=$3 or $4='admin') and status<> 'closed' returning *",
        [
          action === "teacher_start" ? "active" : "closed",
          String(b.runId),
          u.id,
          u.role,
        ],
      );
      if (!result.rows[0])
        return NextResponse.json(
          { error: "实验不存在、已关闭或无管理权限" },
          { status: 403 },
        );
      if (action === "teacher_close") {
        const participants = (
          await query(
            "select id from experiment_participants where run_id=$1",
            [b.runId],
          )
        ).rows;
        await trySupervision(async () => {
          for (const row of participants)
            await syncExperimentSupervision(row.id);
        });
      }
      return NextResponse.json(result.rows[0]);
    }
    const p = await getParticipant();
    if (!p)
      return NextResponse.json(
        { error: "请先加入或恢复实验" },
        { status: 401 },
      );
    if (p.protocol_version !== PROTOCOL)
      return NextResponse.json(
        { error: "旧版实验保留供查看和导出，请老师新建新版实验" },
        { status: 409 },
      );
    const result = await withTransaction(async (c) => {
      const run = (
        await c.query(
          "select status from experiment_runs where id=$1 for share",
          [p.run_id],
        )
      ).rows[0];
      const fresh = (
        await c.query(
          "select stage from experiment_participants where id=$1 for update",
          [p.id],
        )
      ).rows[0];
      const stage = fresh.stage === "join" ? "t0" : fresh.stage;
      const requestId = String(b.requestId || "");
      if (action !== "draft") {
        if (!/^[\w-]{8,80}$/.test(requestId))
          throw new Error("缺少提交编号，请重试");
        const duplicate = (
          await c.query(
            "select id from experiment_events where participant_id=$1 and request_id=$2",
            [p.id, requestId],
          )
        ).rows[0];
        if (duplicate) return { ok: true, duplicate: true };
      }
      if (run.status !== "active" || stage === "completed")
        throw new Error("当前实验尚未开始或已结束；仍可查看和导出");
      if (stage !== b.stage)
        throw new Error("阶段已变化，请刷新后继续；草稿仍保留");
      if (action === "draft") {
        const raw = JSON.stringify(b.payload || {});
        if (raw.length > 30000) throw new Error("草稿过长");
        await c.query(
          "insert into experiment_drafts(participant_id,stage,payload) values($1,$2,$3) on conflict(participant_id,stage) do update set payload=excluded.payload,updated_at=now()",
          [p.id, stage, b.payload || {}],
        );
        return { ok: true, savedAt: new Date().toISOString() };
      }
      const events = (
        await c.query<ExpEvent>(
          "select event_type,stage,payload from experiment_events where participant_id=$1 order by id",
          [p.id],
        )
      ).rows;
      let payload: Record<string, unknown> = {};
      const text = typeof b.text === "string" ? b.text.trim() : "";
      if (text.length > 12000) throw new Error("文字最多12000字，请精简后提交");
      if (action === "advance") {
        const problem = completionProblem(stage, events);
        if (problem) throw new Error(problem);
        const next = nextStage(stage);
        if (!next) throw new Error("阶段无效");
        payload = { next };
        await c.query(
          "update experiment_participants set stage=$1 where id=$2",
          [next, p.id],
        );
      } else if (action === "assessment" && ["t0", "t1"].includes(stage)) {
        if (events.some((e) => e.stage === stage && e.event_type === action))
          throw new Error("本次判断已提交，请继续下一步");
        payload = {
          ...validateCore(b.payload || {}),
          instrument: "core-v2",
          change:
            stage === "t1"
              ? String(b.payload?.change || "").slice(0, 6000)
              : null,
        };
      } else if (action === "orientation" && stage === "orient") {
        if (b.understood !== true)
          throw new Error("请确认读懂案例，或先查看下方术语解释");
        payload = { understood: true };
      } else if (
        (action === "plan" && stage === "cockpit") ||
        (action === "revision" && stage === "expert")
      ) {
        if (!text)
          throw new Error("请用自己的话填写；不确定可写明需要验证的信息");
        payload = {
          text,
          version: action === "plan" ? "V0" : "V1",
          source: "student",
        };
      } else if (action === "reply" && ["expert", "defense"].includes(stage)) {
        const round = replies(events, stage).length + 1;
        const total = stage === "expert" ? 5 : 3;
        if (round > total || b.round !== round)
          throw new Error("本轮已提交或题号已变化，请刷新");
        const q = events.find(
          (e) =>
            e.stage === stage &&
            e.event_type === "question" &&
            e.payload.round === round,
        );
        if (!q) throw new Error("请先查看本轮问题");
        if (!["answered", "skipped"].includes(b.responseStatus) || !text)
          throw new Error("请填写回答，或说明暂时不会的原因");
        payload = {
          text,
          round,
          question: q.payload.text,
          role: q.payload.role,
          responseStatus: b.responseStatus,
          helpUsed: events.some(
            (e) =>
              e.stage === stage &&
              e.event_type === "help" &&
              e.payload.round === round,
          ),
          source: "student",
          qualityScore: null,
        };
      } else if (
        action === "question" &&
        ["expert", "defense"].includes(stage)
      ) {
        const round = replies(events, stage).length + 1;
        const bank =
          stage === "expert"
            ? scenarioFor(p.scenario).questions
            : DEFENSE_QUESTIONS;
        if (round > bank.length) throw new Error("本模块的问题已全部处理");
        const old = events.find(
          (e) =>
            e.stage === stage &&
            e.event_type === "question" &&
            e.payload.round === round,
        );
        if (old) return { ok: true, question: old.payload };
        payload = {
          round,
          text: bank[round - 1],
          role:
            stage === "defense"
              ? "答辩练习评委"
              : p.cohort === "panel"
                ? EXPERT_ROLES[round - 1]
                : "综合创业专家",
          source: "protocol",
          protocol: PROTOCOL,
        };
      } else if (action === "survey" && stage === "survey") {
        const rating = b.rating;
        if (
          typeof rating !== "number" ||
          !Number.isInteger(rating) ||
          rating < 1 ||
          rating > 5
        )
          throw new Error("体验评分必须选择1—5分");
        if (events.some((e) => e.event_type === "survey"))
          throw new Error("反馈已提交，请完成实验");
        payload = { rating, text, scale: "1很困难—5很顺畅" };
      } else throw new Error("此操作与当前阶段不符");
      await c.query(
        "insert into experiment_events(run_id,participant_id,event_type,stage,payload,request_id) values($1,$2,$3,$4,$5,$6)",
        [p.run_id, p.id, action, stage, payload, requestId],
      );
      let destination = action === "advance" ? String(payload.next) : stage;
      if (b.advance === true && action !== "advance") {
        const updated = [...events, { event_type: action, stage, payload }];
        const problem = completionProblem(stage, updated);
        if (problem) throw new Error(problem);
        destination = nextStage(stage);
        await c.query(
          "update experiment_participants set stage=$1 where id=$2",
          [destination, p.id],
        );
        await c.query(
          "insert into experiment_events(run_id,participant_id,event_type,stage,payload,request_id) values($1,$2,'advance',$3,$4,$5)",
          [
            p.run_id,
            p.id,
            stage,
            { next: destination },
            requestId + ":advance",
          ],
        );
      }
      // Materialize the next question in the same transaction: no second click or lost transition.
      const questionStage = destination;
      if (
        ["expert", "defense"].includes(questionStage) &&
        (destination !== stage || action === "reply")
      ) {
        const round =
          destination !== stage ? 1 : replies(events, stage).length + 2;
        const bank =
          questionStage === "expert"
            ? scenarioFor(p.scenario).questions
            : DEFENSE_QUESTIONS;
        if (round <= bank.length) {
          const question = {
            round,
            text: bank[round - 1],
            role:
              questionStage === "defense"
                ? "答辩练习评委"
                : p.cohort === "panel"
                  ? EXPERT_ROLES[round - 1]
                  : "综合创业专家",
            source: "protocol",
            protocol: PROTOCOL,
          };
          await c.query(
            "insert into experiment_events(run_id,participant_id,event_type,stage,payload) values($1,$2,'question',$3,$4)",
            [p.run_id, p.id, questionStage, question],
          );
        }
      }
      return {
        ok: true,
        nextPath: experimentPath(destination),
        ...(action === "question" ? { question: payload } : {}),
      };
    });
    const supervisionSynced =
      action === "draft" ||
      (await trySupervision(() => syncExperimentSupervision(p.id)));
    return NextResponse.json({ ...result, supervisionSynced });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "提交失败";
    return NextResponse.json(
      { error: msg.includes("TEACHER") ? "需要教师或管理员登录" : msg },
      { status: msg.includes("TEACHER") ? 403 : 400 },
    );
  }
}

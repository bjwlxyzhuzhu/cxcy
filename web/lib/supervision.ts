import "server-only";
import { query, withTransaction } from "./db";
import { experimentSignals, type SupervisionSignal } from "./supervision-rules";
import { cohortLabel } from "./experiment-report";
import { scenarioFor } from "./experiment-scenarios";
import type { PoolClient } from "pg";
import type { ExpEvent } from "./experiment-protocol";
import { createHash } from "node:crypto";
async function save(
  c: PoolClient,
  scope: string,
  fingerprint: string,
  userId: string | null,
  context: Record<string, unknown>,
  link: string,
  signals: SupervisionSignal[],
) {
  for (const s of signals) {
    await c.query(
      `insert into intervention_cards(user_id,rule,sharp,evidence,advice,link_href,link_label,source_key,context)
      values($1,$2,$3,$4,$5,$6,'查看对应测试记录',$7,$8)
      on conflict(source_key) do update set sharp=excluded.sharp,evidence=excluded.evidence,advice=excluded.advice,context=excluded.context,updated_at=now(),resolved_at=null
      where intervention_cards.status <> 'retracted'`,
      [
        userId,
        s.rule,
        s.title,
        s.evidence,
        s.advice,
        link,
        scope + ":" + s.rule,
        { ...context, source: "saved-record-rules", scope },
      ],
    );
  }
  await c.query(
    "update intervention_cards set resolved_at=coalesce(resolved_at,now()) where context->>'scope'=$1 and source_key <> all($2::text[])",
    [scope, signals.map((s) => scope + ":" + s.rule)],
  );
  await c.query(
    "insert into supervision_checkpoints(source_key,fingerprint) values($1,$2) on conflict(source_key) do update set fingerprint=excluded.fingerprint,checked_at=now()",
    [scope, fingerprint],
  );
}
export async function syncExperimentSupervision(id: string) {
  await withTransaction(async (c) => {
    const p = (
      await c.query(
        `select p.*,r.title,r.status,r.scenario,u.role from experiment_participants p join experiment_runs r on r.id=p.run_id left join users u on u.id=p.user_id where p.id=$1 for update of p`,
        [id],
      )
    ).rows[0];
    if (!p || (p.user_id && p.role !== "student")) return;
    const events = (
      await c.query<ExpEvent>(
        "select id,event_type,stage,payload,created_at from experiment_events where participant_id=$1 order by id",
        [id],
      )
    ).rows;
    await save(
      c,
      "experiment:" + id,
      p.status + ":" + (events.at(-1)?.id || "0"),
      p.user_id,
      {
        kind: "experiment",
        participant_id: id,
        participant_code: p.participant_code,
        run_id: p.run_id,
        run_title: p.title,
        scenario: scenarioFor(p.scenario).title,
        cohort: p.cohort,
        group_label: cohortLabel(p.cohort),
        stage: p.stage,
      },
      "/experiment",
      experimentSignals(events, p.status === "closed"),
    );
  });
  const owner = (
    await query("select user_id from experiment_participants where id=$1", [id])
  ).rows[0];
  if (owner?.user_id) await syncStudentOverview(owner.user_id);
}
export async function syncLearningSupervision(id: string) {
  await withTransaction(async (c) => {
    const s = (
      await c.query(
        "select s.*,u.role from learning_sessions s join users u on u.id=s.user_id where s.id=$1 for update of s",
        [id],
      )
    ).rows[0];
    if (!s || s.role !== "student") return;
    const rows = (
      await c.query(
        "select role,id from learning_records where session_id=$1 order by id",
        [id],
      )
    ).rows;
    const submitted = rows.filter((r) => r.role === "user").length;
    const replied = rows.filter((r) => r.role === "assistant").length;
    const signals = replied
      ? [
          {
            rule: "learning_review",
            title: "新的练习记录可供复盘",
            evidence: `本次“${s.title}”保存了${submitted}次提交和${replied}条AI回复。此为过程记录提示，不是评分或问题判定。`,
            advice:
              "查看学生原话与AI建议，确认哪些想法由学生独立提出，再选择一个需要解释的问题进行交流。",
          },
        ]
      : [];
    await save(
      c,
      "learning:" + id,
      String(rows.at(-1)?.id || "0"),
      s.user_id,
      { kind: "learning", session_id: id, module: s.module, title: s.title },
      "/me/records?sessionId=" + id,
      signals,
    );
  });
}
/** 后台轮询补查历史/漏发记录，按指纹增量处理；每页最多100份，不依赖学生打开星图。 */
export async function syncPendingSupervision(
  userId: string | null = null,
  teacherId: string | null = null,
) {
  const pending = (
    await query(
      `select * from (
    select 'experiment' as kind,p.id,r.status||':'||coalesce(max(e.id),0)::text as fingerprint,'experiment:'||p.id as source_key
    from experiment_participants p join experiment_runs r on r.id=p.run_id left join users u on u.id=p.user_id left join experiment_events e on e.participant_id=p.id
    where r.protocol_version='guided-v2' and (p.user_id is null or u.role='student') and ($1::uuid is null or p.user_id=$1) and ($2::uuid is null or r.created_by=$2)
    group by p.id,r.status
    union all
    select 'learning',s.id,coalesce(max(l.id),0)::text,'learning:'||s.id from learning_sessions s join users u on u.id=s.user_id left join learning_records l on l.session_id=s.id
    where u.role='student' and ($1::uuid is null or s.user_id=$1) group by s.id
  ) src left join supervision_checkpoints c on c.source_key=src.source_key where c.fingerprint is distinct from src.fingerprint order by src.kind,src.id limit 101`,
      [userId, teacherId],
    )
  ).rows;
  for (const p of pending.slice(0, 100)) {
    if (p.kind === "experiment") await syncExperimentSupervision(p.id);
    else await syncLearningSupervision(p.id);
  }
  const students = (
    await query(
      "select id from users where role='student' and ($1::uuid is null or id=$1) order by id",
      [userId],
    )
  ).rows;
  let overviewUpdated = 0;
  for (const student of students)
    if (await syncStudentOverview(student.id)) overviewUpdated++;
  return {
    checked: Math.min(pending.length, 100),
    hasPending: pending.length > 100,
    overviewUpdated,
    studentsChecked: students.length,
  };
}
/** 每个账号一张综合卡，读取历史事实和原文片段；不按IP、姓名或问卷序号猜测归属。 */
export async function syncStudentOverview(userId: string) {
  const user = (await query("select role from users where id=$1", [userId]))
    .rows[0];
  if (user?.role !== "student") return false;
  const sources = [
    ["成长证据", "evidence_events t", "t.user_id=$1"],
    ["历史项目", "projects t", "t.user_id=$1"],
    ["方案版本", "plan_versions t", "t.user_id=$1"],
    ["历史答辩场次", "challenge_sessions t", "t.user_id=$1"],
    ["历史对话", "dialogue_turns t", "t.user_id=$1"],
    [
      "普通练习消息",
      "learning_records t join learning_sessions s on s.id=t.session_id",
      "s.user_id=$1",
    ],
    [
      "课堂实验事件",
      "experiment_events t join experiment_participants p on p.id=t.participant_id",
      "p.user_id=$1",
    ],
  ];
  const facts = await Promise.all(
    sources.map(async ([label, table, where]) => {
      const count = Number(
        (await query(`select count(*) from ${table} where ${where}`, [userId]))
          .rows[0].count,
      );
      const recent = (
        await query(
          `select to_jsonb(t)-'user_id' as data from ${table} where ${where} order by (coalesce(nullif(to_jsonb(t)->>'content',''),nullif(to_jsonb(t)->>'draft',''),nullif(to_jsonb(t)->>'text',''),nullif(to_jsonb(t)->>'content_md',''),nullif(to_jsonb(t)->'payload'->>'text',''),nullif(to_jsonb(t)->>'title',''),nullif(to_jsonb(t)->>'name','')) is not null) desc,coalesce(to_jsonb(t)->>'updated_at',to_jsonb(t)->>'created_at',to_jsonb(t)->>'started_at') desc nulls last,t.id desc limit 2`,
          [userId],
        )
      ).rows.map((r) => r.data);
      return { label, count, recent };
    }),
  );
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(facts))
    .digest("hex");
  const old = (
    await query(
      "select fingerprint from supervision_checkpoints where source_key=$1",
      ["overview:" + userId],
    )
  ).rows[0];
  if (old?.fingerprint === fingerprint) return false;
  const countText = facts.map((f) => f.label + f.count + "条").join("；");
  const excerpts = facts
    .flatMap((f) =>
      f.recent.map((r) => {
        const value =
          r.content ||
          r.draft ||
          r.text ||
          r.content_md ||
          r.payload?.text ||
          r.title ||
          r.name;
        return value
          ? f.label +
              (r.role
                ? "（" +
                  (r.role === "user"
                    ? "学生"
                    : r.role === "assistant"
                      ? "AI"
                      : r.role) +
                  "）"
                : "") +
              "：" +
              String(value).slice(0, 200)
          : "";
      }),
    )
    .filter(Boolean)
    .slice(0, 6);
  const hasAny = facts.some((f) => f.count > 0);
  const suggestion = hasAny
    ? "先查看下方历史原文片段，再核对学生当前方案与自己的回答。只有成稿或AI回复不能说明已经独立完成答辩；对缺少的记录先询问原因，再安排一次简短练习。"
    : "当前平台没有可归属此账号的已保存测试数据。请先核对是否使用了匿名实验或其他账号；不要据此判断学生未学习，也不要补造测试内容。";
  await withTransaction(async (c) => {
    await c.query("select id from users where id=$1 for update", [userId]);
    await save(
      c,
      "overview:" + userId,
      fingerprint,
      userId,
      {
        kind: "overview",
        title: "个人历史综合督导",
        history: facts.map((f) => ({ source: f.label, count: f.count })),
        excerpts,
      },
      "/me/records",
      [
        {
          rule: "student_overview",
          title: hasAny
            ? "个人历史测试综合督导"
            : "个人督导档案：等待可核对的测试记录",
          evidence: countText,
          advice: suggestion,
        },
      ],
    );
  });
  return true;
}
export async function trySupervision(fn: () => Promise<unknown>) {
  try {
    await fn();
    return true;
  } catch (e) {
    console.error(
      "Supervision sync failed",
      e instanceof Error ? e.message : "unknown",
    );
    return false;
  }
}

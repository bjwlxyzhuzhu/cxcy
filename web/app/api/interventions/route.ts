import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/db-client";
import { query } from "@/lib/db";
import { syncPendingSupervision } from "@/lib/supervision";
import { logEvidence } from "@/lib/evidence";

export const runtime = "nodejs";

async function isTeacher(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  return !!data && ["admin", "teacher"].includes(data.role);
}

/**
 * 干预卡片接口（P2 教师干预闭环）。
 * GET：学生 → 先对自己的证据链做实时体检（可能生成新卡），再返回自己的卡片；
 *      教师 → ?all=1 全量督导队列（含学生姓名/学号），或 ?user=<id> 看指定学生。
 * POST：学生回应 {id, action: accepted|improved|disputed, note?}（只能动自己的 open 卡）；
 *       教师裁决 {id, action: retract|note, note}。
 */
export async function GET(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const url = new URL(req.url);
  const admin = createAdminClient();

  if (url.searchParams.get("all") === "1") {
    if (!(await isTeacher(user.id)))
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    try {
      const sync = await syncPendingSupervision(
        null,
        user.role === "teacher" ? user.id : null,
      );
      const offset = Math.max(
        0,
        Math.floor(Number(url.searchParams.get("offset")) || 0),
      );
      const status = url.searchParams.get("status") || null;
      const cohort = url.searchParams.get("cohort") || null;
      const runId = url.searchParams.get("runId") || null;
      const kind = url.searchParams.get("kind") || null;
      const filter = `where ($1::text is null or c.status=$1) and ($2::text is null or c.context->>'cohort'=$2) and ($3::text is null or c.context->>'run_id'=$3) and ($4::uuid is null or coalesce(c.context->>'kind','')<>'experiment' or exists(select 1 from experiment_runs r where r.id::text=c.context->>'run_id' and r.created_by=$4)) and ($5::text is null or c.context->>'kind'=$5)`;
      const args = [
        status,
        cohort,
        runId,
        user.role === "teacher" ? user.id : null,
        kind,
      ];
      const total = Number(
        (
          await query(
            `select count(*) from intervention_cards c ${filter}`,
            args,
          )
        ).rows[0].count,
      );
      const cards = (
        await query(
          `select c.*,case when u.id is null then null else json_build_object('id',u.id,'name',u.name,'student_no',u.student_no) end as student from intervention_cards c left join users u on u.id=c.user_id ${filter} order by (c.status='disputed') desc,c.updated_at desc,c.id desc limit 100 offset $6`,
          [...args, offset],
        )
      ).rows;
      const runs = (
        await query(
          "select id,title from experiment_runs where ($1::uuid is null or created_by=$1) order by created_at desc",
          [user.role === "teacher" ? user.id : null],
        )
      ).rows;
      return NextResponse.json({
        cards,
        total,
        hasMore: offset + cards.length < total,
        ...sync,
        runs,
        refreshedAt: new Date().toISOString(),
      });
    } catch {
      return NextResponse.json(
        { error: "督导同步失败，请确认数据库迁移后重试；测试记录已保留" },
        { status: 503 },
      );
    }
  }

  const targetUser = url.searchParams.get("user");
  let uid = user.id;
  if (targetUser && targetUser !== user.id) {
    if (!(await isTeacher(user.id)))
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    uid = targetUser;
  }

  try {
    await syncPendingSupervision(uid);
  } catch {
    return NextResponse.json(
      { error: "督导记录同步失败，请稍后重试" },
      { status: 503 },
    );
  }

  const { data, error } = await admin
    .from("intervention_cards")
    .select(
      "id, rule, sharp, evidence, advice, link_href, link_label, status, student_note, teacher_note, created_at, responded_at, context, resolved_at",
    )
    .eq("user_id", uid)
    .neq("status", "retracted")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cards: data || [] });
}

const STUDENT_ACTIONS = new Set(["accepted", "improved", "disputed"]);
const STATUS_LABEL: Record<string, string> = {
  accepted: "接受",
  improved: "已改进",
  disputed: "不同意（申诉）",
};

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录" }, { status: 401 });

  let body: { id?: number; action?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式错误" }, { status: 400 });
  }
  const id = Number(body?.id);
  const action = (body?.action || "").trim();
  const note = (body?.note || "").toString().slice(0, 500);
  if (!Number.isFinite(id))
    return NextResponse.json({ error: "缺少卡片 id" }, { status: 400 });

  const admin = createAdminClient();
  const { data: card } = await admin
    .from("intervention_cards")
    .select("*")
    .eq("id", id)
    .single();
  if (!card) return NextResponse.json({ error: "卡片不存在" }, { status: 404 });

  // —— 学生回应：只能动自己的、且尚未回应的卡 ——
  if (STUDENT_ACTIONS.has(action)) {
    if (card.user_id !== user.id)
      return NextResponse.json(
        { error: "只能回应自己的卡片" },
        { status: 403 },
      );
    if (card.status !== "open")
      return NextResponse.json({ error: "该卡已回应过" }, { status: 409 });
    const { error } = await admin
      .from("intervention_cards")
      .update({
        status: action,
        student_note: note,
        responded_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    // 学生对督导的回应本身就是学习证据（元认知），写回证据链
    await logEvidence({
      userId: user.id,
      kind: "intervention_response",
      title: `回应督导卡 · ${STATUS_LABEL[action]}`,
      payload: { cardId: id, rule: card.rule, action, note, sharp: card.sharp },
    });
    return NextResponse.json({ ok: true });
  }

  // —— 教师裁决：撤回卡片 / 写裁决备注 ——
  if (action === "retract" || action === "note") {
    if (!(await isTeacher(user.id)))
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    if (user.role === "teacher" && card.context?.kind === "experiment") {
      const own = (
        await query(
          "select id from experiment_runs where id=$1 and created_by=$2",
          [card.context.run_id, user.id],
        )
      ).rows[0];
      if (!own)
        return NextResponse.json(
          { error: "无此实验管理权限" },
          { status: 403 },
        );
    }
    const patch: Record<string, unknown> = { teacher_note: note };
    if (action === "retract") patch.status = "retracted";
    const { error } = await admin
      .from("intervention_cards")
      .update(patch)
      .eq("id", id);
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "不支持的操作" }, { status: 400 });
}

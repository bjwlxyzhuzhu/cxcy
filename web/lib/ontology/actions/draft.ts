import "server-only";
import { defineAction, ActionError, requireMember, str } from "../engine";
import { SOURCE_KINDS } from "../schema";
import { piiScan, redact } from "@/lib/arena";
import type { Draft } from "../extract";

/** 每人每天最多上传多少份资料做自动抽取（抽取不扣积分，用次数防滥用） */
export const DAILY_MATERIAL_LIMIT = 20;

/** 北京时间今天 0 点对应的 UTC ISO 时间（数据库时间统一存 UTC） */
export function cnDayStartIso(): string {
  const now = new Date();
  const cn = new Date(now.getTime() + 8 * 3600_000);
  const start = Date.UTC(cn.getUTCFullYear(), cn.getUTCMonth(), cn.getUTCDate()) - 8 * 3600_000;
  return new Date(start).toISOString();
}

// ───────────────────────── 上传调研资料（人）─────────────────────────

defineAction({
  key: "material.add", label: "上传调研资料", humanOnly: true,
  parse: (r) => {
    const kind = str(r.kind, 30);
    if (!SOURCE_KINDS.some((k) => k.value === kind)) throw new ActionError(400, "请选择资料类型（访谈记录、问卷结果、实测等）");
    const text = typeof r.text === "string" ? r.text.trim().slice(0, 12000) : "";
    if (text.length < 50) throw new ActionError(400, "资料太短（至少 50 字）。AI 只能从资料里抽取，资料越完整，本体越扎实");
    const ref_note = str(r.ref_note, 300);
    if (ref_note.length < 4) throw new ActionError(400, "请写明出处：谁、什么时候、怎么采集的（如“2026-11 走访 6 家材料厂”）");
    return { project_id: str(r.project_id, 64), name: str(r.name, 120) || "未命名资料", kind, ref_note, text };
  },
  run: (ctx, p) => {
    requireMember(ctx, p.project_id);
    const used = ctx.c.prepare("select count(*) n from materials where created_by = ? and created_at >= ?").get(ctx.actor.userId, cnDayStartIso()) as { n: number };
    if (Number(used.n) >= DAILY_MATERIAL_LIMIT) throw new ActionError(429, `今天已上传 ${DAILY_MATERIAL_LIMIT} 份资料，明天再来`);
    // 入库前脱敏：身份证、手机号、邮箱、学号、姓名称呼
    const pii = piiScan(p.text);
    const clean = redact(p.text);
    const row = ctx.c.prepare(
      "insert into materials (project_id, name, kind, ref_note, text, chars, pii_flags, created_by) values (?, ?, ?, ?, ?, ?, ?, ?) returning id"
    ).get(p.project_id, p.name, p.kind, p.ref_note, clean, clean.length, JSON.stringify(pii), ctx.actor.userId) as { id: string };
    ctx.scope.targetType = "material";
    ctx.scope.targetId = row.id;
    return { id: row.id, pii, chars: clean.length };
  },
});

// ───────────────────────── AI 草稿批量入库（AI 可执行，只能生成草稿）─────────────────────────

type ImportParams = { project_id: string; material_id: string; draft: Draft };

defineAction({
  key: "draft.import", label: "AI 起草本体",
  parse: (r) => ({ project_id: str(r.project_id, 64), material_id: str(r.material_id, 64), draft: r.draft as Draft }),
  run: (ctx, p: ImportParams) => {
    requireMember(ctx, p.project_id);
    const m = ctx.c.prepare("select id, name, kind, ref_note, project_id from materials where id = ?").get(p.material_id) as
      { id: string; name: string; kind: string; ref_note: string; project_id: string } | undefined;
    if (!m || m.project_id !== p.project_id) throw new ActionError(404, "资料不存在");
    ctx.scope.targetType = "material";
    ctx.scope.targetId = m.id;
    const origin = ctx.actor.kind === "human" ? "human" : "ai";
    // 来源：标明是 AI 从哪份资料起草的，并给出建议来源（认证时预填，仍需学生确认）
    const source = (extra: Record<string, unknown>) => JSON.stringify({
      kind: "ai", material_id: m.id, material_name: m.name, suggested: { kind: m.kind, ref: `${m.name}：${m.ref_note}` }, ...extra,
    });

    const ids: Record<string, string> = {};
    const created = { evidence: 0, hmw: 0, track_profile: 0, links: 0 };
    const insEv = ctx.c.prepare(
      `insert into evidence_items (project_id, kind, content, quote, sample_n, collected_at, status, origin, source, created_by)
       values (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?) returning id`
    );
    for (const e of p.draft?.evidence || []) {
      const r = insEv.get(p.project_id, e.kind, e.content, e.quote, e.sample_n, e.collected_at || null, origin, source({ verbatim: e.verbatim, quote_removed: !!e.quote_removed }), ctx.actor.userId) as { id: string };
      ids[e.ref] = r.id;
      created.evidence++;
    }
    const insH = ctx.c.prepare(
      `insert into hmw_questions (project_id, text, user_quote, rationale, status, origin, source, created_by)
       values (?, ?, ?, ?, 'draft', ?, ?, ?) returning id`
    );
    const insL = ctx.c.prepare(
      `insert into onto_links (project_id, link_type, src_type, src_id, dst_type, dst_id, origin, created_by)
       values (?, ?, ?, ?, ?, ?, ?, ?) on conflict do nothing`
    );
    let trackId: string | null = null;
    const t = p.draft?.track;
    if (t) {
      trackId = (ctx.c.prepare(
        `insert into track_profiles (project_id, title, track, audience, summary, status, origin, source, created_by)
         values (?, ?, ?, ?, ?, 'draft', ?, ?, ?) returning id`
      ).get(p.project_id, t.title, t.track, t.audience, t.summary, origin, source({}), ctx.actor.userId) as { id: string }).id;
      created.track_profile++;
    }
    for (const h of p.draft?.hmw || []) {
      const r = insH.get(p.project_id, h.text, h.user_quote, h.rationale, origin, source({ verbatim: h.verbatim, quote_removed: !!h.quote_removed }), ctx.actor.userId) as { id: string };
      created.hmw++;
      for (const ref of h.based_on) {
        if (!ids[ref]) continue;
        insL.run(p.project_id, "based_on", "hmw", r.id, "evidence", ids[ref], origin, ctx.actor.userId);
        created.links++;
      }
      if (trackId) { insL.run(p.project_id, "within", "hmw", r.id, "track_profile", trackId, origin, ctx.actor.userId); created.links++; }
    }
    return { created };
  },
});

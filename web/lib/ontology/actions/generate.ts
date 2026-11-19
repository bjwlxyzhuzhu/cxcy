import "server-only";
import type { Sqlite } from "@/lib/db";
import { defineAction, ActionError, requireMember, str, type Ctx } from "../engine";
import type { GenPlan, GenStep, Ref } from "../generate";
import { GEN_STEPS } from "../generate";
import { renderArchive, renderPitch } from "../render";

// ───────────────────────── AI 起草本步：草稿与关系一次入库（AI 可执行，只能生成草稿）─────────────────────────

function link(c: Sqlite, projectId: string, kind: string, by: string, l: string, src: Ref, dst: Ref) {
  c.prepare(
    `insert into onto_links (project_id, link_type, src_type, src_id, dst_type, dst_id, origin, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)
     on conflict do nothing`
  ).run(projectId, l, src.type, src.id, dst.type, dst.id, kind, by);
}

/** 下一个可用版本号：V0.2、V0.3…（跳过已占用的） */
function nextLabel(c: Sqlite, projectId: string): string {
  const used = new Set((c.prepare("select label from product_versions where project_id = ?").all(projectId) as { label: string }[]).map((r) => r.label));
  for (let k = 2; k < 100; k++) if (!used.has(`V0.${k}`)) return `V0.${k}`;
  return `V${Date.now()}`;
}

defineAction({
  key: "draft.generate", label: "AI 起草本步",
  parse: (r) => {
    const step = str(r.step, 10) as GenStep;
    if (!GEN_STEPS.includes(step)) throw new ActionError(400, "未知步骤");
    return { project_id: str(r.project_id, 64), step, plan: (r.plan || {}) as GenPlan };
  },
  run: (ctx, p) => {
    requireMember(ctx, p.project_id);
    const c = ctx.c, pid = p.project_id, by = ctx.actor.userId;
    const origin = ctx.actor.kind === "human" ? "human" : "ai";
    const src = (extra: Record<string, unknown> = {}) => JSON.stringify({ kind: "ai", step: p.step, ...extra });
    const created: Record<string, number> = {};
    const add = (k: string) => { created[k] = (created[k] || 0) + 1; };
    const L = (l: string, a: Ref, b: Ref) => { link(c, pid, origin, by, l, a, b); add("links"); };

    if (p.step === "track" && p.plan.track) {
      const t = p.plan.track;
      c.prepare(`insert into track_profiles (project_id, title, track, audience, summary, trends, opportunities, status, origin, source, created_by)
                 values (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`)
        .run(pid, t.title, t.track, t.audience, t.summary, JSON.stringify(t.trends), JSON.stringify(t.opportunities), origin, src(), by);
      add("track_profile");
    }
    if (p.step === "brief" && p.plan.brief) {
      const b = p.plan.brief;
      const r = c.prepare(`insert into task_briefs (project_id, title, goal, features, metrics, risks, status, origin, source, created_by)
                           values (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?) returning id`)
        .get(pid, b.title, b.goal, JSON.stringify(b.features), JSON.stringify(b.metrics), JSON.stringify(b.risks), origin, src(), by) as { id: string };
      add("task_brief");
      for (const h of b.addresses) L("addresses", { type: "task_brief", id: r.id }, h);
    }
    if ((p.step === "v01" || p.step === "v02") && p.plan.version) {
      const v = p.plan.version;
      let label = "V0.1";
      if (p.step === "v01") {
        if (c.prepare("select 1 from product_versions where project_id = ? and label = 'V0.1' and status <> 'rejected'").get(pid))
          throw new ActionError(409, "已经有 V0.1 了，可以在项目本体里修改它");
        c.prepare("delete from product_versions where project_id = ? and label = 'V0.1' and status = 'rejected'").run(pid);
      } else label = nextLabel(c, pid);
      const r = c.prepare(`insert into product_versions (project_id, label, summary, changes, status, origin, source, created_by)
                           values (?, ?, ?, ?, 'draft', ?, ?, ?) returning id`)
        .get(pid, label, v.summary, JSON.stringify(v.changes), origin, src(v.questionnaire.length ? { questionnaire: v.questionnaire } : {}), by) as { id: string };
      add("product_version");
      const me: Ref = { type: "product_version", id: r.id };
      for (const b of v.implements) L("implements", me, b);
      for (const h of v.addresses) L("addresses", me, h);
      // V0.2：起草的决策都作为它的来源
      if (p.step === "v02") {
        for (const d of p.plan.decisions || []) {
          const dr = c.prepare(`insert into decisions (project_id, verdict, subject, rationale, status, origin, source, created_by)
                                values (?, ?, ?, ?, 'draft', ?, ?, ?) returning id`)
            .get(pid, d.verdict, d.subject, d.rationale, origin, src(), by) as { id: string };
          add("decision");
          const dref: Ref = { type: "decision", id: dr.id };
          for (const e of d.cites) L("cites", dref, e);
          for (const a of d.about) L("about", dref, a);
          L("results_from", me, dref);
        }
      }
    }
    if (p.step === "test" && p.plan.report) {
      const t = p.plan.report;
      const r = c.prepare(`insert into test_reports (project_id, title, summary, metrics, findings, status, origin, source, created_by)
                           values (?, ?, ?, ?, ?, 'draft', ?, ?, ?) returning id`)
        .get(pid, t.title, t.summary, JSON.stringify(t.metrics), JSON.stringify(t.findings), origin, src(), by) as { id: string };
      add("test_report");
      const rep: Ref = { type: "test_report", id: r.id };
      const ver = c.prepare("select id from product_versions where project_id = ? and status in ('certified','confirmed') order by created_at desc, rowid desc limit 1").get(pid) as { id: string } | undefined;
      if (ver) L("tests", rep, { type: "product_version", id: ver.id });
      for (const e of p.plan.evidence || []) {
        const m = c.prepare("select id, name, kind, ref_note from materials where project_id = ? and name = ? order by created_at desc limit 1").get(pid, e.material) as
          { id: string; name: string; kind: string; ref_note: string } | undefined;
        const er = c.prepare(`insert into evidence_items (project_id, kind, content, quote, sample_n, status, origin, source, created_by)
                              values (?, ?, ?, ?, ?, 'draft', ?, ?, ?) returning id`)
          .get(pid, e.kind, e.content, e.quote, e.sample_n, origin, JSON.stringify({
            kind: "ai", step: "test", verbatim: !!e.quote, quote_removed: false,
            ...(m ? { material_id: m.id, material_name: m.name, suggested: { kind: m.kind, ref: `${m.name}：${m.ref_note}` } } : {}),
          }), by) as { id: string };
        add("evidence");
        L("part_of", { type: "evidence", id: er.id }, rep);
      }
    }
    if (!Object.keys(created).length) throw new ActionError(422, "AI 没有起草出可用的内容，请补充资料后重试");
    return { created };
  },
});

// ───────────────────────── 第 7、8 步：路演页与项目档案（自动生成，可撤回）─────────────────────────

defineAction({
  key: "artifact.generate", label: "生成项目成果",
  parse: (r) => {
    const kind = str(r.kind, 10);
    if (kind !== "pitch" && kind !== "archive") throw new ActionError(400, "未知成果类型");
    return { project_id: str(r.project_id, 64), kind };
  },
  run: (ctx, p) => {
    requireMember(ctx, p.project_id);
    const out = p.kind === "pitch" ? renderPitch(ctx.c, p.project_id) : renderArchive(ctx.c, p.project_id);
    if (out.empty) throw new ActionError(400, p.kind === "pitch" ? "还没有已认证的内容，先认证赛道画像、HMW 问题与证据" : "项目里还没有已认证的内容可归档");
    // 项目档案生成即归档；路演页需学生审阅确认
    const status = p.kind === "archive" ? "certified" : "draft";
    const r = ctx.c.prepare(
      `insert into project_artifacts (project_id, kind, title, html, data, status, origin, created_by, certified_by, certified_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id`
    ).get(p.project_id, p.kind, out.title, out.html, JSON.stringify(out.data), status, ctx.actor.kind === "human" ? "human" : "ai",
      ctx.actor.userId, status === "certified" ? ctx.actor.userId : null, status === "certified" ? ctx.now : null) as { id: string };
    ctx.scope.targetType = "artifact";
    ctx.scope.targetId = r.id;
    return { id: r.id, status };
  },
});

function ownArtifact(ctx: Ctx, id: string) {
  const a = ctx.c.prepare("select project_id, kind, status from project_artifacts where id = ?").get(id) as { project_id: string; kind: string; status: string } | undefined;
  if (!a) throw new ActionError(404, "成果不存在");
  requireMember(ctx, a.project_id);
  ctx.scope.targetType = "artifact";
  ctx.scope.targetId = id;
  return a;
}

defineAction({
  key: "artifact.certify", label: "审阅确认路演页", humanOnly: true,
  parse: (r) => ({ id: str(r.id, 64) }),
  run: (ctx, p) => {
    const a = ownArtifact(ctx, p.id);
    if (a.status !== "draft") throw new ActionError(409, "只有待审阅的成果可以确认");
    ctx.c.prepare("update project_artifacts set status = 'certified', certified_by = ?, certified_at = ? where id = ?").run(ctx.actor.userId, ctx.now, p.id);
    return { id: p.id, status: "certified" };
  },
});

defineAction({
  key: "artifact.revoke", label: "撤回项目成果", humanOnly: true,
  parse: (r) => ({ id: str(r.id, 64) }),
  run: (ctx, p) => {
    const a = ownArtifact(ctx, p.id);
    if (a.status === "rejected") throw new ActionError(409, "已经撤回");
    ctx.c.prepare("update project_artifacts set status = 'rejected' where id = ?").run(p.id);
    return { id: p.id, status: "rejected" };
  },
});

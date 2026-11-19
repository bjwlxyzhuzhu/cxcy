import "server-only";
import { defineAction, ActionError, str } from "../engine";

// 智能引导师 · 教师给项目全体成员发干预卡（人执行；卡片内容由系统起草、教师修改）

defineAction({
  key: "intervention.send", label: "教师发干预卡", humanOnly: true,
  parse: (r) => {
    const sharp = str(r.sharp, 200), advice = str(r.advice, 600);
    if (!sharp || !advice) throw new ActionError(400, "请写清“一针见血”和“怎么改”");
    const href = str(r.link_href, 200);
    if (href && !href.startsWith("/")) throw new ActionError(400, "“去哪练”只能是平台内的链接");
    return {
      project_id: str(r.project_id, 64), rule: str(r.rule, 60) || "project:manual",
      sharp, evidence: str(r.evidence, 600), advice, link_href: href, link_label: str(r.link_label, 40),
    };
  },
  run: (ctx, p) => {
    if (!ctx.isTeacher) throw new ActionError(403, "只有教师可以发干预卡");
    ctx.scope.projectId = p.project_id;
    const members = ctx.c.prepare("select user_id from project_members where project_id = ?").all(p.project_id) as { user_id: string }[];
    if (!members.length) throw new ActionError(404, "项目不存在或没有成员");
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    const dup = ctx.c.prepare("select 1 from intervention_cards where user_id = ? and rule = ? and status <> 'retracted' and created_at >= ?");
    const ins = ctx.c.prepare(
      `insert into intervention_cards (user_id, rule, sharp, evidence, advice, link_href, link_label, teacher_note)
       values (?, ?, ?, ?, ?, ?, ?, '教师发送')`
    );
    let sent = 0, skipped = 0;
    for (const m of members) {
      if (dup.get(m.user_id, p.rule, since)) { skipped++; continue; }
      ins.run(m.user_id, p.rule, p.sharp, p.evidence, p.advice, p.link_href, p.link_label);
      sent++;
    }
    return { sent, skipped };
  },
});

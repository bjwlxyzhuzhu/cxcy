import "server-only";
import {
  defineAction, ActionError, requireMember, requireMemberOrTeacher, objectType, getObject, cleanFields, cleanSource,
  parseJson, str, type Ctx,
} from "../engine";
import { LINK_BY_KEY, SOURCE_KINDS, TYPE_BY_KEY } from "../schema";

// ───────────────────────── 项目 ─────────────────────────

defineAction({
  key: "project.create", label: "新建项目", humanOnly: true,
  parse: (r) => ({ name: str(r.name, 120) || "我的项目" }),
  run: (ctx, p) => {
    const row = ctx.c.prepare("insert into projects (user_id, name) values (?, ?) returning id").get(ctx.actor.userId, p.name) as { id: string };
    ctx.c.prepare("insert into project_members (project_id, user_id, role) values (?, ?, 'owner')").run(row.id, ctx.actor.userId);
    ctx.scope.projectId = row.id;
    return { id: row.id };
  },
});

defineAction({
  key: "project.add_member", label: "加入项目成员", humanOnly: true,
  parse: (r) => ({ project_id: str(r.project_id, 64), account: str(r.account, 64) }),
  run: (ctx, p) => {
    ctx.scope.projectId = p.project_id;
    const role = ctx.c.prepare("select role from project_members where project_id = ? and user_id = ?").get(p.project_id, ctx.actor.userId) as { role?: string } | undefined;
    if (role?.role !== "owner" && !ctx.isTeacher) throw new ActionError(403, "只有项目负责人或教师可以添加成员");
    const u = ctx.c.prepare("select id from users where account = ?").get(p.account) as { id: string } | undefined;
    if (!u) throw new ActionError(404, "找不到这个账号");
    ctx.c.prepare("insert or ignore into project_members (project_id, user_id, role) values (?, ?, 'member')").run(p.project_id, u.id);
    return { ok: true };
  },
});

// ───────────────────────── 对象：草稿 → 认证 → 教师确认 ─────────────────────────

type ObjRef = { type: string; id: string };
const ref = (r: Record<string, unknown>): ObjRef => ({ type: str(r.type, 40), id: str(r.id, 64) });

function loadOwned(ctx: Ctx, p: ObjRef, teacherOk = false) {
  const t = objectType(p.type);
  if (!t.certifiable) throw new ActionError(400, `${t.label}不走认证流程`);
  const row = getObject(ctx.c, p.type, p.id);
  if (!row) throw new ActionError(404, `${t.label}不存在`);
  if (teacherOk) requireMemberOrTeacher(ctx, String(row.project_id));
  else requireMember(ctx, String(row.project_id));
  ctx.scope.targetType = p.type;
  ctx.scope.targetId = p.id;
  return { t, row };
}

defineAction({
  key: "object.create", label: "新建对象（草稿）",
  parse: (r) => {
    const t = objectType(str(r.type, 40));
    if (!t.certifiable) throw new ActionError(400, `${t.label}不能用通用方式创建`);
    return { t, project_id: str(r.project_id, 64), fields: cleanFields(t, r.fields), source: cleanSource(r.source) };
  },
  run: (ctx, p) => {
    requireMember(ctx, p.project_id);
    const origin = ctx.actor.kind === "human" ? "human" : "ai";
    const cols = ["project_id", "status", "origin", "source", "created_by", ...Object.keys(p.fields)];
    const vals = [p.project_id, "draft", origin, JSON.stringify(p.source || (origin === "ai" ? { kind: "ai" } : {})), ctx.actor.userId, ...Object.values(p.fields)];
    if (p.t.key === "product_version" && !p.fields.label) throw new ActionError(400, "请填写版本号，如 V0.1");
    let row: { id: string };
    try {
      row = ctx.c.prepare(`insert into ${p.t.table} (${cols.map((x) => `"${x}"`).join(", ")}) values (${cols.map(() => "?").join(", ")}) returning id`).get(...vals) as { id: string };
    } catch (e) {
      if (/UNIQUE/.test((e as Error).message)) throw new ActionError(409, p.t.key === "glossary_term" ? "本队术语表里已有这个术语" : p.t.key === "product_version" ? "版本号已存在" : "内容重复");
      throw e;
    }
    ctx.scope.targetType = p.t.key;
    ctx.scope.targetId = row.id;
    return { id: row.id, status: "draft", origin };
  },
});

defineAction({
  key: "object.update", label: "修改对象",
  parse: (r) => {
    const o = ref(r);
    return { ...o, fields: cleanFields(objectType(o.type), r.fields), source: r.source === undefined ? undefined : cleanSource(r.source) };
  },
  run: (ctx, p) => {
    const { t, row } = loadOwned(ctx, p);
    const changed = Object.entries(p.fields).filter(([k, v]) => row[k] !== v);
    const sets: string[] = [], vals: unknown[] = [];
    for (const [k, v] of changed) { sets.push(`"${k}" = ?`); vals.push(v); }
    if (p.source !== undefined) { sets.push("source = ?"); vals.push(JSON.stringify(p.source || {})); }
    // 已认证 / 已确认 / 已驳回的内容一旦改动，退回草稿，需要重新认证
    let status = String(row.status);
    if ((changed.length || p.source !== undefined) && status !== "draft") {
      status = "draft";
      sets.push("status = 'draft'", "certified_by = null", "certified_at = null", "confirmed_by = null", "confirmed_at = null");
    }
    if (!sets.length) return { id: p.id, status, changed: 0 };
    try {
      ctx.c.prepare(`update ${t.table} set ${sets.join(", ")} where id = ?`).run(...vals, p.id);
    } catch (e) {
      if (/UNIQUE/.test((e as Error).message)) throw new ActionError(409, t.key === "glossary_term" ? "本队术语表里已有这个术语" : "内容重复");
      throw e;
    }
    return { id: p.id, status, changed: changed.length };
  },
});

defineAction({
  key: "object.certify", label: "认证对象", humanOnly: true,
  parse: (r) => ({ ...ref(r), source: r.source === undefined ? undefined : cleanSource(r.source) }),
  run: (ctx, p) => {
    const { t, row } = loadOwned(ctx, p);
    if (row.status !== "draft") throw new ActionError(409, `只有草稿可以认证（当前：${row.status}）`);
    let source = parseJson<Record<string, string>>(row.source, {});
    // AI 给出的原话在资料中查不到（已被清空）：必须由人补上原话或记录才能认证，查无此事请驳回
    if (t.key === "evidence" && (source as Record<string, unknown>).quote_removed && !String(row.quote || "").trim())
      throw new ActionError(400, "AI 给出的原话在资料中找不到。请对照原文补上原话或记录后再认证；查无此事请驳回");
    if (p.source) {
      source = p.source;
      ctx.c.prepare(`update ${t.table} set source = ? where id = ?`).run(JSON.stringify(source), p.id);
    }
    // AI 起草的内容不是证据：证据必须挂真实来源
    if (t.requireSourceToCertify) {
      if (!SOURCE_KINDS.some((k) => k.value === source.kind)) throw new ActionError(400, "请注明证据的真实来源类型（访谈、问卷、实测等），AI 生成的内容不能作为证据");
      if ((source.ref || "").length + (source.note || "").length < 4) throw new ActionError(400, "请写明来源出处（访谈对象类型与日期、问卷名称、记录位置等）");
      if (!String(row.content || "").trim()) throw new ActionError(400, "证据摘要不能为空");
    }
    // 决策必须挂已认证的证据或测试报告
    if (t.key === "decision") {
      const n = ctx.c.prepare(
        `select count(*) n from onto_links l
         left join evidence_items e on l.dst_type = 'evidence' and e.id = l.dst_id
         left join test_reports r on l.dst_type = 'test_report' and r.id = l.dst_id
         where l.link_type = 'cites' and l.src_type = 'decision' and l.src_id = ?
           and (e.status in ('certified','confirmed') or r.status in ('certified','confirmed'))`
      ).get(p.id) as { n: number };
      if (!Number(n.n)) throw new ActionError(400, "决策必须依据至少一条已认证的证据或测试报告");
    }
    // 发布新版本：第一个版本可直接发布；之后的版本必须源于至少一条已认证的决策
    if (t.key === "product_version") {
      const prior = ctx.c.prepare(
        "select count(*) n from product_versions where project_id = ? and status in ('certified','confirmed') and id <> ?"
      ).get(row.project_id, p.id) as { n: number };
      if (Number(prior.n) > 0) {
        const d = ctx.c.prepare(
          `select count(*) n from onto_links l join decisions d on d.id = l.dst_id
           where l.link_type = 'results_from' and l.src_type = 'product_version' and l.src_id = ? and d.status in ('certified','confirmed')`
        ).get(p.id) as { n: number };
        if (!Number(d.n)) throw new ActionError(400, "新版本必须源于至少一条已认证的迭代决策（保留 / 修改 / 放弃）");
      }
    }
    if (t.key === "glossary_term" && !String(row.definition || "").trim()) throw new ActionError(400, "请先写清这个术语的定义（口径），再认证");
    ctx.c.prepare(`update ${t.table} set status = 'certified', certified_by = ?, certified_at = ? where id = ?`).run(ctx.actor.userId, ctx.now, p.id);
    // 术语：对齐并认证后，清空之前发现的口径冲突
    if (t.key === "glossary_term") ctx.c.prepare("update glossary_terms set conflicts = '[]' where id = ?").run(p.id);
    return { id: p.id, status: "certified" };
  },
});

defineAction({
  key: "object.confirm", label: "教师确认", humanOnly: true,
  parse: ref,
  run: (ctx, p) => {
    if (!ctx.isTeacher) throw new ActionError(403, "只有教师可以确认");
    const { t, row } = loadOwned(ctx, p, true);
    if (row.status !== "certified") throw new ActionError(409, "只有学生已认证的内容可以确认");
    ctx.c.prepare(`update ${t.table} set status = 'confirmed', confirmed_by = ?, confirmed_at = ? where id = ?`).run(ctx.actor.userId, ctx.now, p.id);
    return { id: p.id, status: "confirmed" };
  },
});

defineAction({
  key: "object.reject", label: "驳回对象", humanOnly: true,
  parse: (r) => ({ ...ref(r), reason: str(r.reason, 300) }),
  run: (ctx, p) => {
    const { t, row } = loadOwned(ctx, p, true);
    if (!["draft", "certified"].includes(String(row.status))) throw new ActionError(409, "该状态不能驳回");
    if (row.status === "certified" && !ctx.isTeacher) throw new ActionError(403, "已认证的内容只能由教师驳回；学生请直接修改");
    ctx.c.prepare(`update ${t.table} set status = 'rejected' where id = ?`).run(p.id);
    return { id: p.id, status: "rejected" };
  },
});

// ───────────────────────── 关系 ─────────────────────────

/** 取对象所属项目；分身没有项目，返回作者以便另行校验 */
function projectOf(ctx: Ctx, type: string, id: string): { projectId: string | null; ownerId?: string } {
  if (type === "persona") {
    const r = ctx.c.prepare("select owner_id from personas where id = ?").get(id) as { owner_id: string } | undefined;
    if (!r) throw new ActionError(404, "分身不存在");
    return { projectId: null, ownerId: r.owner_id };
  }
  const row = getObject(ctx.c, type, id);
  if (!row) throw new ActionError(404, `${TYPE_BY_KEY[type]?.label || type}不存在`);
  if (!row.project_id) throw new ActionError(400, `该${TYPE_BY_KEY[type]?.label || "对象"}不属于任何项目`);
  return { projectId: String(row.project_id) };
}

defineAction({
  key: "link.create", label: "建立关系",
  parse: (r) => {
    const def = LINK_BY_KEY[str(r.link, 40)];
    if (!def) throw new ActionError(400, "未知关系类型");
    const src = ref((r.src || {}) as Record<string, unknown>), dst = ref((r.dst || {}) as Record<string, unknown>);
    if (!def.src.includes(src.type) || !def.dst.includes(dst.type))
      throw new ActionError(400, `“${def.label}”关系不能连接 ${TYPE_BY_KEY[src.type]?.label || src.type} → ${TYPE_BY_KEY[dst.type]?.label || dst.type}`);
    return { def, src, dst };
  },
  run: (ctx, p) => {
    const a = projectOf(ctx, p.src.type, p.src.id), b = projectOf(ctx, p.dst.type, p.dst.id);
    const projectId = a.projectId || b.projectId;
    if (!projectId) throw new ActionError(400, "关系两端至少有一端属于项目");
    if (a.projectId && b.projectId && a.projectId !== b.projectId) throw new ActionError(400, "不能连接不同项目的对象");
    requireMember(ctx, projectId);
    // 分身一端：必须是本项目成员做的分身
    for (const side of [a, b]) {
      if (side.ownerId && !ctx.c.prepare("select 1 from project_members where project_id = ? and user_id = ?").get(projectId, side.ownerId))
        throw new ActionError(403, "只能关联本项目成员制作的分身");
    }
    const origin = ctx.actor.kind === "human" ? "human" : "ai";
    const r = ctx.c.prepare(
      `insert into onto_links (project_id, link_type, src_type, src_id, dst_type, dst_id, origin, created_by) values (?, ?, ?, ?, ?, ?, ?, ?)
       on conflict (link_type, src_type, src_id, dst_type, dst_id) do nothing returning id`
    ).get(projectId, p.def.key, p.src.type, p.src.id, p.dst.type, p.dst.id, origin, ctx.actor.userId) as { id: number } | undefined;
    ctx.scope.targetType = p.src.type;
    ctx.scope.targetId = p.src.id;
    return { id: r ? Number(r.id) : null, existed: !r };
  },
});

defineAction({
  key: "link.remove", label: "删除关系",
  parse: (r) => ({ id: Math.floor(Number(r.id)) }),
  run: (ctx, p) => {
    const l = ctx.c.prepare("select project_id from onto_links where id = ?").get(p.id) as { project_id: string } | undefined;
    if (!l) throw new ActionError(404, "关系不存在");
    requireMember(ctx, l.project_id);
    ctx.c.prepare("delete from onto_links where id = ?").run(p.id);
    return { ok: true };
  },
});


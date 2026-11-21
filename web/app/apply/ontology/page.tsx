"use client";
// 项目本体工作台：上传调研资料 → AI 自动建本体（草稿）→ 学生逐条认证 → 教师确认
// 人判断 / AI 执行：AI 只起草，认证、驳回、确认都由人点。
import { useCallback, useEffect, useMemo, useState } from "react";
import LearnChrome from "../../learn/LearnChrome";
import { box, field, lab, Btn, Tag, api } from "@/components/arena/ui";
import { uploadAttachment, ACCEPT } from "@/lib/attach";
import { getCurrentProject, setCurrentProject } from "@/lib/ontology/pipeline";
import { TYPE_BY_KEY, LINK_BY_KEY, LINK_TYPES, SOURCE_KINDS, STATUS_LABEL, type ObjectStatus } from "@/lib/ontology/schema";

type Obj = Record<string, unknown> & { id: string; status: ObjectStatus; origin: "ai" | "human"; source: Record<string, unknown> };
type Link = { id: number; link_type: string; src_type: string; src_id: string; dst_type: string; dst_id: string; origin: string };
type Material = { id: string; name: string; kind: string; ref_note: string; chars: number; created_at: string; text: string; pii_flags: Record<string, number> };
type ProjectView = { project: { id: string; name: string }; role: string | null; teacher: boolean; members: number; objects: Record<string, Obj[]>; links: Link[]; materials: Material[] };
type ProjectItem = { id: string; name: string; role: string; members: number };
type Conflict = { meaning: string; where: string; quote: string };
type ClassTerm = { id: string; term: string; definition: string; formula: string; aliases: string[]; status: string };
type Audit = { id: number; action: string; actor_kind: string; ok: boolean; error: string | null; created_at: string; target_type: string | null; mine: boolean };

const STATUS_COLOR: Record<ObjectStatus, string> = { draft: "#B45309", certified: "#15803D", confirmed: "#0E7490", rejected: "#475569" };
const ORDER = ["track_profile", "hmw", "evidence", "task_brief", "product_version", "test_report", "decision"];
const kindLabel = (k: string) => SOURCE_KINDS.find((x) => x.value === k)?.label || k;
const listText = (v: unknown) => (Array.isArray(v) ? v.join("\n") : String(v ?? ""));
const ACTION_LABEL: Record<string, string> = {
  "material.add": "上传资料", "draft.import": "AI 起草本体", "object.create": "新建", "object.update": "修改", "object.certify": "认证",
  "object.confirm": "教师确认", "object.reject": "驳回", "link.create": "建立关系", "link.remove": "删除关系",
  "project.create": "新建项目", "project.add_member": "添加成员",
  "draft.glossary_import": "AI 检查口径", "glossary.resolve": "确认口径已对齐",
  "class.term_upsert": "维护课堂口径", "class.term_retire": "停用课堂口径", "class.seed_terms": "导入推荐口径",
};

export default function OntologyPage() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [pid, setPid] = useState("");
  const [view, setView] = useState<ProjectView | null>(null);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "draft" | "done">("all");
  const [tab, setTab] = useState<"objects" | "glossary" | "materials" | "audit">("objects");
  const [gMsg, setGMsg] = useState<string[]>([]);
  // 上传表单
  const [mName, setMName] = useState("");
  const [mKind, setMKind] = useState<string>(SOURCE_KINDS[0].value);
  const [mRef, setMRef] = useState("");
  const [mText, setMText] = useState("");
  const [result, setResult] = useState<{ created: Record<string, number>; warnings: string[]; pii: Record<string, number> } | null>(null);
  const [newName, setNewName] = useState("");
  const [account, setAccount] = useState("");

  const loadProjects = useCallback(async () => {
    try {
      const r = await api<{ items: ProjectItem[] }>("/api/ontology/project");
      setProjects(r.items);
      // ?project= 指定项目（教师从工作台跳转查看学生项目时用）；否则用本浏览器记住的当前项目
      const fromUrl = new URLSearchParams(window.location.search).get("project") || "";
      const saved = getCurrentProject();
      setPid((p) => p || fromUrl || r.items.find((x) => x.id === saved)?.id || r.items[0]?.id || "");
    } catch (e) { setMsg((e as Error).message); }
  }, []);
  const loadView = useCallback(async () => {
    if (!pid) { setView(null); return; }
    try {
      setView(await api<ProjectView>(`/api/ontology/project?id=${pid}`));
      setAudit((await api<{ items: Audit[] }>(`/api/ontology/audit?project_id=${pid}`)).items);
    } catch (e) { setMsg((e as Error).message); }
  }, [pid]);
  useEffect(() => { loadProjects(); }, [loadProjects]);
  // 支持 ?tab=glossary / audit / materials 直接打开对应页签（从工作台跳转）
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "glossary" || t === "audit" || t === "materials") setTab(t);
    if (new URLSearchParams(window.location.search).get("filter") === "draft") setFilter("draft");
  }, []);
  useEffect(() => { loadView(); }, [loadView]);

  async function act(body: Record<string, unknown>, ok?: string) {
    setBusy(true); setMsg("");
    try { await api("/api/ontology/action", { body }); if (ok) setMsg("✓ " + ok); await loadView(); return true; }
    catch (e) { setMsg("✗ " + (e as Error).message); return false; }
    finally { setBusy(false); }
  }
  async function createProject() {
    setBusy(true); setMsg("");
    try {
      const r = await api<{ id: string }>("/api/ontology/action", { body: { action: "project.create", name: newName || "我的项目" } });
      setNewName(""); setCurrentProject(r.id); await loadProjects(); setPid(r.id);
    } catch (e) { setMsg("✗ " + (e as Error).message); } finally { setBusy(false); }
  }
  async function onFile(fl: FileList | null) {
    if (!fl?.length) return;
    setMsg("正在解析文件…");
    try {
      for (const file of Array.from(fl)) {
        const a = await uploadAttachment(file);
        if (a.kind === "text" && a.text) { setMText((t) => (t ? t + "\n\n" : "") + a.text); setMName((n) => n || file.name); }
        else setMsg("图片请先整理成文字再上传");
      }
      setMsg("");
    } catch (e) { setMsg("✗ " + (e as Error).message); }
  }
  async function extract() {
    setBusy(true); setMsg("AI 正在从资料中起草本体，约需几十秒…"); setResult(null);
    try {
      const r = await api<{ created: Record<string, number>; warnings: string[]; pii: Record<string, number> }>("/api/ontology/extract", {
        body: { project_id: pid, name: mName, kind: mKind, ref_note: mRef, text: mText },
      });
      setResult(r); setMText(""); setMName(""); setMsg(""); setFilter("draft"); setTab("objects");
      await loadView();
    } catch (e) { setMsg("✗ " + (e as Error).message); await loadView(); }
    finally { setBusy(false); }
  }

  const titleOf = useCallback((type: string, id: string) => {
    const t = TYPE_BY_KEY[type];
    const o = view?.objects[type]?.find((x) => x.id === id);
    return `${t?.label || type}：${String(o?.[t?.titleField || "id"] ?? "").slice(0, 24) || "（已删除）"}`;
  }, [view]);

  const counts = useMemo(() => {
    const c = { draft: 0, certified: 0, confirmed: 0, rejected: 0 };
    for (const list of Object.values(view?.objects || {})) for (const o of list) if (o.status in c) c[o.status]++;
    return c;
  }, [view]);

  const canEdit = !!view?.role;
  const isTeacher = !!view?.teacher;

  return (
    <LearnChrome emoji="🧭" title="项目本体 · AI 起草，你来认证" subtitle="人判断 / AI 执行：把调研资料变成可追溯的证据、问题与赛道画像">
      <div style={{ ...box, borderColor: "#0E749055", marginBottom: 16, fontSize: 14.5, lineHeight: 1.8 }}>
        <b style={{ color: "#0E7490" }}>使用原则</b>：AI 只从你上传的资料里<b>起草</b>，所有内容都先是草稿；
        原话必须能在资料原文里找到，找不到的已自动清空。<b>AI 起草的不是证据</b>——证据要由你注明真实来源并逐条认证，才能用于决策与计分。
      </div>

      {/* —— 项目选择 —— */}
      <div style={{ ...box, marginBottom: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ minWidth: 220 }}>
          <span style={lab}>当前项目</span>
          <select value={pid} onChange={(e) => { setPid(e.target.value); setCurrentProject(e.target.value); }} style={field}>
            {projects.length === 0 && <option value="" style={{ background: "#fff" }}>还没有项目</option>}
            {projects.map((p) => <option key={p.id} value={p.id} style={{ background: "#fff" }}>{p.name}（{p.role === "owner" ? "负责人" : "成员"} · {p.members} 人）</option>)}
            {view && !projects.some((p) => p.id === view.project.id) && <option value={view.project.id} style={{ background: "#fff" }}>{view.project.name}（查看中）</option>}
          </select>
        </div>
        <div style={{ minWidth: 180 }}><span style={lab}>新建项目</span><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="项目名称" style={field} /></div>
        <Btn ghost onClick={createProject} disabled={busy}>新建</Btn>
        {view?.role === "owner" && <>
          <div style={{ minWidth: 160 }}><span style={lab}>添加队友（填学号）</span><input value={account} onChange={(e) => setAccount(e.target.value)} style={field} /></div>
          <Btn ghost onClick={async () => { if (await act({ action: "project.add_member", project_id: pid, account }, "已添加队友")) setAccount(""); }} disabled={busy || !account}>添加</Btn>
        </>}
        {view && <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(Object.keys(counts) as ObjectStatus[]).map((k) => <Tag key={k} color={STATUS_COLOR[k]}>{STATUS_LABEL[k]} {counts[k]}</Tag>)}
        </div>}
      </div>

      {msg && <div style={{ fontSize: 14.5, marginBottom: 12, color: msg.startsWith("✗") ? "#B91C1C" : msg.startsWith("✓") ? "#15803D" : "var(--mut)" }}>{msg}</div>}

      {view && canEdit && (
        <div style={{ ...box, marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>上传调研资料 → AI 自动建本体 <span style={{ fontSize: 15, color: "var(--mut)", fontWeight: 400 }}>不扣积分 · 每人每天 20 次</span></h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10 }}>
            <div><span style={lab}>资料名称</span><input value={mName} onChange={(e) => setMName(e.target.value)} placeholder="如：材料厂走访记录" style={field} /></div>
            <div><span style={lab}>资料类型（真实来源）</span>
              <select value={mKind} onChange={(e) => setMKind(e.target.value)} style={field}>
                {SOURCE_KINDS.map((k) => <option key={k.value} value={k.value} style={{ background: "#fff" }}>{k.label}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "span 2" }}><span style={lab}>出处说明（谁、何时、怎么采集）</span><input value={mRef} onChange={(e) => setMRef(e.target.value)} placeholder="如：2026-11 走访 6 家中小材料加工厂，访谈采购负责人" style={field} /></div>
          </div>
          <div style={{ marginTop: 10 }}>
            <span style={lab}>资料原文（至少 50 字；可上传 docx / pdf / txt / xlsx；上传前请去掉真实姓名，系统也会自动隐去手机号等信息）</span>
            <textarea rows={7} value={mText} onChange={(e) => setMText(e.target.value)} style={{ ...field, resize: "vertical" }}
              placeholder={"例：\n问：现在怎么做表面质检？\n答：两个老师傅拿灯照，夜班最容易漏检，退一次货损失上万……"} />
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
              <label style={{ fontSize: 14, color: "var(--cyan)", cursor: "pointer" }}>📎 上传文件<input type="file" accept={ACCEPT} multiple hidden onChange={(e) => onFile(e.target.files)} /></label>
              <span style={{ fontSize: 15, color: "var(--mut)" }}>{mText.length} 字</span>
              <span style={{ marginLeft: "auto" }}><Btn onClick={extract} disabled={busy || mText.trim().length < 50 || mRef.trim().length < 4}>{busy ? "处理中…" : "AI 自动建本体"}</Btn></span>
            </div>
          </div>
          {result && (
            <div style={{ marginTop: 12, fontSize: 14.5, lineHeight: 1.8, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              <div>AI 起草了：证据 {result.created.evidence} 条 · HMW 问题 {result.created.hmw} 条 · 赛道画像 {result.created.track_profile} 个 · 关系 {result.created.links} 条。请在下方逐条认证。</div>
              {Object.keys(result.pii || {}).length > 0 && <div style={{ color: "#B45309" }}>已自动隐去：{Object.entries(result.pii).map(([k, v]) => `${k} ${v} 处`).join("、")}</div>}
              {result.warnings.map((w, i) => <div key={i} style={{ color: "#B45309" }}>⚠ {w}</div>)}
            </div>
          )}
        </div>
      )}

      {view && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            {([["objects", "本体对象"], ["glossary", `术语口径（${(view.objects.glossary_term || []).length}）`], ["materials", `调研资料（${view.materials.length}）`], ["audit", "操作记录"]] as const).map(([k, l]) => (
              <Btn key={k} small ghost={tab !== k} onClick={() => setTab(k)}>{l}</Btn>
            ))}
            {tab === "objects" && <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {([["all", "全部"], ["draft", "待认证"], ["done", "已认证"]] as const).map(([k, l]) => <Btn key={k} small ghost={filter !== k} color="#6D28D9" onClick={() => setFilter(k)}>{l}</Btn>)}
            </span>}
          </div>

          {tab === "objects" && canEdit && <NewObject busy={busy} onCreate={(type, fields) => act({ action: "object.create", type, project_id: pid, fields }, `已新建${TYPE_BY_KEY[type].label}（草稿），补全内容后认证`)} />}
          {tab === "objects" && ORDER.map((type) => {
            const t = TYPE_BY_KEY[type];
            const list = (view.objects[type] || []).filter((o) => filter === "all" || (filter === "draft" ? o.status === "draft" : o.status === "certified" || o.status === "confirmed"));
            if (!list.length) return null;
            return (
              <div key={type} style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: "4px 0 8px" }}>{t.label} <span style={{ color: "var(--mut)", fontWeight: 400, fontSize: 14 }}>{list.length}</span></h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 12 }}>
                  {list.map((o) => (
                    <ObjCard key={o.id} type={type} o={o} links={view.links} objects={view.objects} titleOf={titleOf} canEdit={canEdit} isTeacher={isTeacher} busy={busy} act={act} />
                  ))}
                </div>
              </div>
            );
          })}
          {tab === "objects" && Object.values(view.objects).every((l) => !l.length) && (
            <div style={{ ...box, fontSize: 14.5, color: "var(--mut)" }}>本体还是空的。上传一份调研资料，让 AI 先起草。</div>
          )}

          {tab === "materials" && (
            <div style={{ display: "grid", gap: 10 }}>
              {view.materials.length === 0 && <div style={{ ...box, fontSize: 14.5, color: "var(--mut)" }}>还没有上传资料。</div>}
              {view.materials.map((m) => (
                <details key={m.id} style={box}>
                  <summary style={{ cursor: "pointer", fontSize: 15 }}>
                    <b>{m.name}</b> <Tag color="#6D28D9">{kindLabel(m.kind)}</Tag> <span style={{ color: "var(--mut)", fontSize: 15 }}>{m.ref_note} · {m.chars} 字 · {new Date(m.created_at).toLocaleString("zh-CN", { hour12: false })}</span>
                    {canEdit && <span style={{ marginLeft: 10 }}><Btn small ghost disabled={busy} onClick={async () => {
                      setBusy(true); setMsg("AI 正在重新抽取…");
                      try { const r = await api<{ created: Record<string, number>; warnings: string[]; pii: Record<string, number> }>("/api/ontology/extract", { body: { project_id: pid, material_id: m.id } }); setResult(r); setMsg(""); setTab("objects"); setFilter("draft"); await loadView(); }
                      catch (e) { setMsg("✗ " + (e as Error).message); } finally { setBusy(false); }
                    }}>重新抽取</Btn></span>}
                  </summary>
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.7, marginTop: 10, color: "var(--mut)", fontFamily: "inherit" }}>{m.text}</pre>
                </details>
              ))}
            </div>
          )}

          {tab === "glossary" && (
            <div style={{ display: "grid", gap: 14 }}>
              <ClassGlossary />
              <div style={box}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 800 }}>本队术语</h3>
                  <span style={{ fontSize: 15, color: "var(--mut)" }}>同一个词，队里每个人、每份资料说的要是一回事</span>
                  {canEdit && <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                    <Btn small disabled={busy} onClick={async () => {
                      setBusy(true); setMsg("AI 正在通读本队资料，检查口径…"); setGMsg([]);
                      try {
                        const r = await api<{ created: number; flagged: number; warnings: string[] }>("/api/ontology/glossary", { body: { project_id: pid } });
                        setMsg(`✓ 新起草术语 ${r.created} 个，发现口径不一致 ${r.flagged} 处`); setGMsg(r.warnings || []); await loadView();
                      } catch (e) { setMsg("✗ " + (e as Error).message); } finally { setBusy(false); }
                    }}>AI 检查口径冲突</Btn>
                    <Btn small ghost disabled={busy} onClick={async () => {
                      const term = window.prompt("要添加的术语（如：付费意愿）");
                      if (term) await act({ action: "object.create", type: "glossary_term", project_id: pid, fields: { term } }, "已添加，请补全定义后认证");
                    }}>手动添加</Btn>
                  </span>}
                </div>
                {gMsg.map((w, i) => <div key={i} style={{ fontSize: 14, color: "#B45309" }}>⚠ {w}</div>)}
                {(view.objects.glossary_term || []).length === 0 ? (
                  <div style={{ fontSize: 14.5, color: "var(--mut)" }}>还没有术语。上传资料后点“AI 检查口径冲突”，AI 会起草术语并标出说法不一致的地方。</div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 12, marginTop: 8 }}>
                    {(view.objects.glossary_term || []).map((o) => (
                      <ObjCard key={o.id} type="glossary_term" o={o} links={view.links} objects={view.objects} titleOf={titleOf} canEdit={canEdit} isTeacher={isTeacher} busy={busy} act={act} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "audit" && (
            <div style={box}>
              {audit.length === 0 && <div style={{ fontSize: 14.5, color: "var(--mut)" }}>暂无记录</div>}
              {audit.map((a) => (
                <div key={a.id} style={{ display: "flex", gap: 10, fontSize: 14, padding: "6px 0", borderBottom: "1px solid var(--line)", alignItems: "center" }}>
                  <span style={{ color: "var(--mut)", width: 150 }}>{new Date(a.created_at).toLocaleString("zh-CN", { hour12: false })}</span>
                  <Tag color={a.actor_kind === "ai" ? "#6D28D9" : "#0E7490"}>{a.actor_kind === "ai" ? "AI" : a.mine ? "我" : "队友 / 教师"}</Tag>
                  <span>{ACTION_LABEL[a.action] || a.action}{a.target_type ? ` · ${TYPE_BY_KEY[a.target_type]?.label || (a.target_type === "material" ? "资料" : a.target_type)}` : ""}</span>
                  {!a.ok && <span style={{ color: "#B91C1C" }}>未通过：{a.error}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {!view && projects.length === 0 && <div style={{ ...box, fontSize: 14.5, color: "var(--mut)", marginBottom: 14 }}>先新建一个项目，再上传调研资料。</div>}
      {!view && <ClassGlossary />}
    </LearnChrome>
  );
}

function ObjCard({ type, o, links, objects, titleOf, canEdit, isTeacher, busy, act }: {
  type: string; o: Obj; links: Link[]; objects: Record<string, Obj[]>; titleOf: (t: string, id: string) => string; canEdit: boolean; isTeacher: boolean; busy: boolean;
  act: (b: Record<string, unknown>, ok?: string) => Promise<boolean>;
}) {
  const t = TYPE_BY_KEY[type];
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [certifying, setCertifying] = useState(false);
  const sug = (o.source?.suggested || {}) as { kind?: string; ref?: string };
  const [srcKind, setSrcKind] = useState(sug.kind || (o.source?.kind !== "ai" ? String(o.source?.kind || "") : "") || SOURCE_KINDS[0].value);
  const [srcRef, setSrcRef] = useState(sug.ref || String(o.source?.ref || ""));
  const [linking, setLinking] = useState(false);
  const out = links.filter((l) => l.src_type === type && l.src_id === o.id);
  const inc = links.filter((l) => l.dst_type === type && l.dst_id === o.id);

  function startEdit() {
    const f: Record<string, string> = {};
    for (const fd of t.fields) f[fd.key] = fd.kind === "list" ? listText(o[fd.key]) : String(o[fd.key] ?? "");
    setForm(f); setEditing(true);
  }
  async function save() {
    const fields: Record<string, unknown> = {};
    for (const fd of t.fields) fields[fd.key] = fd.kind === "list" ? form[fd.key].split(/\n+/).filter(Boolean) : form[fd.key];
    if (await act({ action: "object.update", type, id: o.id, fields }, "已保存（如原先已认证，需要重新认证）")) setEditing(false);
  }
  async function certify() {
    const body: Record<string, unknown> = { action: "object.certify", type, id: o.id };
    if (t.requireSourceToCertify) body.source = { kind: srcKind, ref: srcRef };
    if (await act(body, "已认证")) setCertifying(false);
  }

  return (
    <div style={{ ...box, borderColor: STATUS_COLOR[o.status] + "66", opacity: o.status === "rejected" ? 0.55 : 1 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <Tag color={STATUS_COLOR[o.status]}>{STATUS_LABEL[o.status]}</Tag>
        <Tag color={o.origin === "ai" ? "#6D28D9" : "#475569"}>{o.origin === "ai" ? "AI 起草" : "人工填写"}</Tag>
        {o.source?.material_name ? <span style={{ fontSize: 14.5, color: "var(--mut)" }}>出自《{String(o.source.material_name)}》</span> : null}
      </div>
      {Array.isArray(o.conflicts) && (o.conflicts as Conflict[]).length > 0 ? (
        <div style={{ fontSize: 14, color: "#B45309", marginBottom: 8, lineHeight: 1.7 }}>
          ⚠ 同一个词有不同说法，请先对齐：
          {(o.conflicts as Conflict[]).map((c, i) => (
            <div key={i} style={{ color: "var(--ink)" }}>· {c.meaning} <span style={{ color: "var(--mut)" }}>— {c.where}：“{c.quote}”</span></div>
          ))}
          <div style={{ color: "var(--mut)" }}>改好定义后重新认证，即完成对齐；核对后认为现有定义无误，也可直接确认。</div>
          {canEdit && (o.status === "certified" || o.status === "confirmed") && (
            <div style={{ marginTop: 6 }}><Btn small ghost color="#15803D" disabled={busy} onClick={() => act({ action: "glossary.resolve", id: o.id }, "已确认口径对齐")}>现有定义无误，标记已对齐</Btn></div>
          )}
        </div>
      ) : null}
      {o.source?.quote_removed && o.status === "draft" ? (
        <div style={{ fontSize: 15, color: "#B45309", marginBottom: 8 }}>⚠ AI 给出的原话在资料中找不到，已清空。请对照原文核实，查无此事请驳回。</div>
      ) : null}

      {!editing ? (
        <div style={{ fontSize: 14.5, lineHeight: 1.75 }}>
          {t.fields.map((fd) => {
            const v = o[fd.key];
            if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) return null;
            const isQuote = fd.key === "quote" || fd.key === "user_quote";
            const shown = fd.kind === "enum" ? fd.options?.find((x) => x.value === v)?.label || String(v) : Array.isArray(v) ? v.join("；") : String(v);
            return (
              <div key={fd.key}>
                <span style={{ color: "var(--mut)" }}>{fd.label}：</span>
                {isQuote ? <span style={{ color: "#fde68a" }}>“{shown}”{o.source?.verbatim ? <span style={{ color: "#15803D", fontSize: 14.5 }}> ✓原文可查</span> : null}</span> : shown}
              </div>
            );
          })}
          {Array.isArray(o.source?.questionnaire) && (o.source.questionnaire as string[]).length > 0 && (
            <div style={{ marginTop: 6 }}>
              <span style={{ color: "var(--mut)" }}>AI 起草的测试问卷：</span>
              <ol style={{ margin: "4px 0 0 18px", fontSize: 14 }}>{(o.source.questionnaire as string[]).map((q, i) => <li key={i}>{q}</li>)}</ol>
            </div>
          )}
          {(out.length > 0 || inc.length > 0) && (
            <div style={{ marginTop: 6, fontSize: 15, color: "var(--mut)" }}>
              {out.map((l) => <div key={l.id}>→ {LINK_BY_KEY[l.link_type]?.label || l.link_type} {titleOf(l.dst_type, l.dst_id)}</div>)}
              {inc.map((l) => <div key={l.id}>← 被 {titleOf(l.src_type, l.src_id)} {LINK_BY_KEY[l.link_type]?.label || l.link_type}</div>)}
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {t.fields.map((fd) => (
            <div key={fd.key}>
              <span style={lab}>{fd.label}{fd.kind === "list" ? "（每行一条）" : ""}</span>
              {fd.kind === "enum" ? (
                <select value={form[fd.key]} onChange={(e) => setForm({ ...form, [fd.key]: e.target.value })} style={field}>
                  {fd.options?.map((x) => <option key={x.value} value={x.value} style={{ background: "#fff" }}>{x.label}</option>)}
                </select>
              ) : fd.kind === "longtext" || fd.kind === "list" ? (
                <textarea rows={3} value={form[fd.key]} onChange={(e) => setForm({ ...form, [fd.key]: e.target.value })} style={{ ...field, resize: "vertical" }} />
              ) : (
                <input value={form[fd.key]} onChange={(e) => setForm({ ...form, [fd.key]: e.target.value })} style={field} />
              )}
            </div>
          ))}
        </div>
      )}

      {certifying && t.requireSourceToCertify && (
        <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "rgba(52,211,153,.08)", display: "grid", gap: 8 }}>
          <div style={{ fontSize: 14, color: "#15803D" }}>请确认这条证据的真实来源（已按资料预填，可修改）</div>
          <select value={srcKind} onChange={(e) => setSrcKind(e.target.value)} style={field}>
            {SOURCE_KINDS.map((k) => <option key={k.value} value={k.value} style={{ background: "#fff" }}>{k.label}</option>)}
          </select>
          <input value={srcRef} onChange={(e) => setSrcRef(e.target.value)} placeholder="出处：访谈对象类型与日期、问卷名称、记录位置" style={field} />
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {canEdit && !editing && o.status === "draft" && !certifying && (
          <Btn small color="#15803D" disabled={busy} onClick={() => (t.requireSourceToCertify ? setCertifying(true) : certify())}>认证</Btn>
        )}
        {certifying && <><Btn small color="#15803D" disabled={busy} onClick={certify}>确认认证</Btn><Btn small ghost color="#475569" onClick={() => setCertifying(false)}>取消</Btn></>}
        {canEdit && !editing && !certifying && o.status !== "confirmed" && <Btn small ghost disabled={busy} onClick={startEdit}>修改</Btn>}
        {canEdit && !editing && !certifying && LINK_TYPES.some((l) => l.src.includes(type)) && <Btn small ghost color="#6D28D9" disabled={busy} onClick={() => setLinking((v) => !v)}>建立关系</Btn>}
        {editing && <><Btn small disabled={busy} onClick={save}>保存</Btn><Btn small ghost color="#475569" onClick={() => setEditing(false)}>取消</Btn></>}
        {!editing && !certifying && o.status === "draft" && canEdit && (
          <Btn small ghost color="#B91C1C" disabled={busy} onClick={() => act({ action: "object.reject", type, id: o.id }, "已驳回")}>驳回</Btn>
        )}
        {isTeacher && o.status === "certified" && <>
          <Btn small color="#0E7490" disabled={busy} onClick={() => act({ action: "object.confirm", type, id: o.id }, "已确认")}>教师确认</Btn>
          <Btn small ghost color="#B91C1C" disabled={busy} onClick={() => act({ action: "object.reject", type, id: o.id }, "已驳回")}>驳回</Btn>
        </>}
      </div>
      {linking && <LinkForm type={type} id={o.id} objects={objects} busy={busy} onDone={() => setLinking(false)} act={act} />}
    </div>
  );
}

/** 新建对象：选类型 → 建草稿（人工填写），再在卡片上补全内容 */
function NewObject({ busy, onCreate }: { busy: boolean; onCreate: (type: string, fields: Record<string, unknown>) => Promise<boolean> }) {
  const [type, setType] = useState("task_brief");
  const [title, setTitle] = useState("");
  const t = TYPE_BY_KEY[type];
  const first = t.fields[0];
  return (
    <div style={{ ...box, marginBottom: 14, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div><span style={lab}>新建对象</span>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...field, width: 160 }}>
          {ORDER.map((k) => <option key={k} value={k} style={{ background: "#fff" }}>{TYPE_BY_KEY[k].label}</option>)}
        </select>
      </div>
      <div style={{ flex: 1, minWidth: 220 }}><span style={lab}>{first.label}{type === "product_version" ? "（如 V0.1）" : ""}</span>
        {first.kind === "enum"
          ? <select value={title} onChange={(e) => setTitle(e.target.value)} style={field}>{first.options?.map((x) => <option key={x.value} value={x.value} style={{ background: "#fff" }}>{x.label}</option>)}</select>
          : <input value={title} onChange={(e) => setTitle(e.target.value)} style={field} />}
      </div>
      <Btn ghost disabled={busy || (!title && first.kind !== "enum")} onClick={async () => {
        const v = first.kind === "enum" ? title || first.options?.[0]?.value : title;
        if (await onCreate(type, { [first.key]: v })) setTitle("");
      }}>新建草稿</Btn>
    </div>
  );
}

/** 建立关系：只列出这类对象允许的关系与可连的目标对象 */
function LinkForm({ type, id, objects, busy, onDone, act }: {
  type: string; id: string; objects: Record<string, Obj[]>; busy: boolean; onDone: () => void;
  act: (b: Record<string, unknown>, ok?: string) => Promise<boolean>;
}) {
  const defs = LINK_TYPES.filter((l) => l.src.includes(type));
  const [lk, setLk] = useState(defs[0]?.key || "");
  const def = LINK_BY_KEY[lk];
  const targets = (def?.dst || []).flatMap((dt) => (objects[dt] || []).filter((x) => x.status !== "rejected").map((x) => ({ type: dt, o: x })));
  const [dst, setDst] = useState("");
  return (
    <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "rgba(167,139,250,.08)", display: "grid", gap: 8 }}>
      <select value={lk} onChange={(e) => { setLk(e.target.value); setDst(""); }} style={field}>
        {defs.map((d) => <option key={d.key} value={d.key} style={{ background: "#fff" }}>{d.label}（→ {d.dst.map((x) => TYPE_BY_KEY[x]?.label).join(" / ")}）</option>)}
      </select>
      <select value={dst} onChange={(e) => setDst(e.target.value)} style={field}>
        <option value="" style={{ background: "#fff" }}>{targets.length ? "选择目标对象" : "本项目还没有可连接的对象"}</option>
        {targets.map(({ type: dt, o }) => (
          <option key={o.id} value={`${dt}|${o.id}`} style={{ background: "#fff" }}>
            {TYPE_BY_KEY[dt].label}：{String(o[TYPE_BY_KEY[dt].titleField] ?? "").slice(0, 30)}（{STATUS_LABEL[o.status]}）
          </option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 6 }}>
        <Btn small color="#6D28D9" disabled={busy || !dst} onClick={async () => {
          const [dt, did] = dst.split("|");
          if (await act({ action: "link.create", link: lk, src: { type, id }, dst: { type: dt, id: did } }, "已建立关系")) onDone();
        }}>确定</Btn>
        <Btn small ghost color="#475569" onClick={onDone}>取消</Btn>
      </div>
    </div>
  );
}


/** 课堂口径：学生只读；教师可新增、修改、停用、导入推荐口径 */
function ClassGlossary() {
  const [terms, setTerms] = useState<ClassTerm[]>([]);
  const [teacher, setTeacher] = useState(false);
  const [f, setF] = useState({ id: "", term: "", definition: "", formula: "", aliases: "" });
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    try { const r = await api<{ teacher: boolean; terms: ClassTerm[] }>("/api/ontology/glossary"); setTerms(r.terms); setTeacher(r.teacher); }
    catch (e) { setMsg((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function act(body: Record<string, unknown>, ok: string) {
    setMsg("");
    try { await api("/api/ontology/action", { body }); setMsg("✓ " + ok); await load(); return true; }
    catch (e) { setMsg("✗ " + (e as Error).message); return false; }
  }
  const active = terms.filter((t) => t.status !== "rejected");
  if (!teacher && !active.length) return null;
  return (
    <div style={{ ...box, borderColor: "#0E749055" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <h3 style={{ fontSize: 15, fontWeight: 800 }}>课堂口径</h3>
        <Tag color="#0E7490">教师确认 · 全班统一</Tag>
        {teacher && <span style={{ marginLeft: "auto" }}><Btn small ghost onClick={() => act({ action: "class.seed_terms" }, "已导入推荐口径（已有的不重复）")}>导入推荐口径</Btn></span>}
      </div>
      {msg && <div style={{ fontSize: 14, marginBottom: 6, color: msg.startsWith("✗") ? "#B91C1C" : "#15803D" }}>{msg}</div>}
      {teacher && active.length === 0 && <div style={{ fontSize: 14.5, color: "var(--mut)" }}>还没有课堂口径。可以导入推荐口径（带证据回应、假设、证伪、现实验证等），再按本课需要修改。</div>}
      <div style={{ display: "grid", gap: 6 }}>
        {terms.map((t) => (
          <div key={t.id} style={{ fontSize: 14.5, lineHeight: 1.7, opacity: t.status === "rejected" ? 0.45 : 1, borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
            <b>{t.term}</b>：{t.definition}
            {t.formula && <span style={{ color: "var(--mut)" }}>（怎么算：{t.formula}）</span>}
            {t.aliases?.length > 0 && <span style={{ color: "var(--mut)" }}>（也叫：{t.aliases.join("、")}）</span>}
            {t.status === "rejected" && <span style={{ color: "var(--mut)" }}>（已停用）</span>}
            {teacher && t.status !== "rejected" && <span style={{ marginLeft: 8, display: "inline-flex", gap: 6 }}>
              <Btn small ghost onClick={() => setF({ id: t.id, term: t.term, definition: t.definition, formula: t.formula, aliases: (t.aliases || []).join("\n") })}>修改</Btn>
              <Btn small ghost color="#B91C1C" onClick={() => act({ action: "class.term_retire", id: t.id }, "已停用")}>停用</Btn>
            </span>}
          </div>
        ))}
      </div>
      {teacher && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 8, marginTop: 10 }}>
          <div><span style={lab}>术语</span><input value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })} style={field} /></div>
          <div style={{ gridColumn: "span 2" }}><span style={lab}>定义 / 口径</span><input value={f.definition} onChange={(e) => setF({ ...f, definition: e.target.value })} style={field} /></div>
          <div><span style={lab}>怎么算（可空）</span><input value={f.formula} onChange={(e) => setF({ ...f, formula: e.target.value })} style={field} /></div>
          <div><span style={lab}>同义说法（每行一个）</span><textarea rows={1} value={f.aliases} onChange={(e) => setF({ ...f, aliases: e.target.value })} style={{ ...field, resize: "vertical" }} /></div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            <Btn small onClick={async () => {
              if (await act({ action: "class.term_upsert", id: f.id || undefined, term: f.term, definition: f.definition, formula: f.formula, aliases: f.aliases.split(/\n+/).filter(Boolean) }, f.id ? "已修改" : "已添加"))
                setF({ id: "", term: "", definition: "", formula: "", aliases: "" });
            }}>{f.id ? "保存修改" : "添加课堂口径"}</Btn>
            {f.id && <Btn small ghost color="#475569" onClick={() => setF({ id: "", term: "", definition: "", formula: "", aliases: "" })}>取消</Btn>}
          </div>
        </div>
      )}
    </div>
  );
}

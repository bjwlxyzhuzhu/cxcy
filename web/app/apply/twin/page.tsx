"use client";
import { useCallback, useEffect, useState } from "react";
import LearnChrome from "../../learn/LearnChrome";
import { box, field, lab, Btn, Tag, api } from "@/components/arena/ui";
import { Avatar, Fighter, Speech, Stage, C, ARCADE, MONO, useNarrow } from "@/components/arena/battle";
import { TWIN_TYPES, ROLE_TYPES, TYPE_BY_KEY, SOURCE_METHODS, CONSENT_ITEMS, avatarOf, seatAvatar, type PersonaCard } from "@/lib/arenaShared";
import { uploadAttachment, ACCEPT } from "@/lib/attach";

type Persona = {
  id: string; owner_id: string; kind: string; role_type: string; label: string; team_code: string;
  card: PersonaCard; visibility: string; enabled: boolean; pii_flags: Record<string, number>; updated_at: string;
};

const lines = (a?: string[]) => (a || []).join("\n");
const toArr = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

function CardView({ p }: { p: Persona }) {
  const c = p.card || {};
  const row = (k: string, v?: string | string[]) => {
    const t = Array.isArray(v) ? v.filter(Boolean) : v;
    if (!t || (Array.isArray(t) && !t.length)) return null;
    return (
      <div style={{ fontSize: 14, lineHeight: 1.7, marginTop: 4 }}>
        <span style={{ color: "var(--mut)" }}>{k}：</span>
        {Array.isArray(t) ? t.join("；") : t}
      </div>
    );
  };
  return (
    <div>
      {row("身份", c.identity)}{row("场景", c.context)}{row("痛点", c.pains)}{row("目标", c.goals)}
      {row("预算", c.budget)}{row("决策逻辑", c.decision_logic)}{row("顾虑", c.objections)}{row("关注重点", c.focus)}
      {c.quotes?.length ? <div style={{ fontSize: 14, marginTop: 6, color: "#B45309" }}>{c.quotes.map((q, i) => <div key={i}>“{q}”</div>)}</div> : null}
      {c.source && (c.source.method || c.source.date) ? (
        <div style={{ fontSize: 14.5, color: "var(--mut)", marginTop: 6 }}>来源：{[c.source.method, c.source.date, c.source.n ? `样本 ${c.source.n}` : ""].filter(Boolean).join(" · ")}</div>
      ) : null}
    </div>
  );
}

function Editor({ p, onSaved, onCancel }: { p: Persona; onSaved: () => void; onCancel: () => void }) {
  const c = p.card || {};
  const [f, setF] = useState({
    label: p.label, identity: c.identity || "", context: c.context || "", pains: lines(c.pains), goals: lines(c.goals),
    budget: c.budget || "", decision_logic: c.decision_logic || "", objections: lines(c.objections), quotes: lines(c.quotes), focus: c.focus || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true);
    try {
      await api("/api/persona", { method: "PATCH", body: { id: p.id, label: f.label, card: {
        identity: f.identity, context: f.context, pains: toArr(f.pains), goals: toArr(f.goals), budget: f.budget,
        decision_logic: f.decision_logic, objections: toArr(f.objections), quotes: toArr(f.quotes), focus: f.focus,
      } } });
      onSaved();
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }
  const ta = (k: keyof typeof f, label: string, rows = 2) => (
    <div style={{ marginTop: 8 }}><span style={lab}>{label}</span><textarea rows={rows} value={f[k]} onChange={set(k)} style={{ ...field, resize: "vertical" }} /></div>
  );
  return (
    <div>
      <div><span style={lab}>角色名</span><input value={f.label} onChange={set("label")} style={field} /></div>
      {p.kind === "role" ? <>{ta("identity", "身份说明")}{ta("focus", "关注重点（追问方向）", 3)}</> : <>
        {ta("identity", "身份画像")}{ta("context", "所处场景")}{ta("pains", "痛点（每行一条）", 3)}{ta("goals", "目标（每行一条）")}
        {ta("budget", "预算/付费意愿", 1)}{ta("decision_logic", "决策逻辑")}{ta("objections", "顾虑（每行一条）")}{ta("quotes", "访谈原话（每行一条，只能是真实原话）", 3)}
      </>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <Btn onClick={save} disabled={busy}>保存</Btn><Btn ghost onClick={onCancel}>取消</Btn>
      </div>
    </div>
  );
}

/** 角色卡逐项校对：分身开口复述，学生确认或修改 */
const WALK: { k: keyof PersonaCard; label: string; say: (v: string) => string }[] = [
  { k: "identity", label: "身份", say: (v) => `我是这样一个人：${v}。对吗？` },
  { k: "context", label: "场景", say: (v) => `我平时的处境是：${v}。对吗？` },
  { k: "pains", label: "痛点", say: (v) => `最让我头疼的是：${v}。我说得对吗？` },
  { k: "budget", label: "预算", say: (v) => `说到钱：${v}。这点对吗？` },
  { k: "decision_logic", label: "决策逻辑", say: (v) => `我做决定的方式是：${v}。对吗？` },
  { k: "objections", label: "顾虑", say: (v) => `我的顾虑是：${v}。对吗？` },
  { k: "quotes", label: "原话", say: (v) => `我在访谈里说过：${v}。这些是我的原话吗？` },
];
const val = (c: PersonaCard, k: keyof PersonaCard): string => {
  const v = c[k];
  return Array.isArray(v) ? v.filter(Boolean).join("；") : typeof v === "string" ? v : "";
};

function TwinStage({ p, onEdit }: { p: Persona; onEdit: () => void }) {
  const narrow = useNarrow();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<Record<string, boolean>>({});
  useEffect(() => { setStep(0); setDone({}); }, [p.id]);
  const c = p.card || {};
  const t = TYPE_BY_KEY[p.role_type];
  const role = p.kind === "role";
  const filled = WALK.filter((w) => val(c, w.k)).length;
  const quotes = (c.quotes || []).length;
  const solid = Math.min(100, Math.round((filled / WALK.length) * 70 + Math.min(quotes, 5) * 6));
  const cur = WALK[Math.min(step, WALK.length - 1)];
  const finished = step >= WALK.length;
  const v = val(c, cur.k);
  const line = role ? `我是${p.label}。${c.focus ? "对战时我会盯住：" + c.focus : ""}`
    : finished ? "校对完了。对战时我只说资料里有的话；资料里没有的，我会请对方去现实中问。"
    : v ? cur.say(v) : `关于“${cur.label}”，你的调研资料里没有提到。对战时遇到这类问题，我会请对方去现实中问。`;
  const stat = (l: string, txt: string, pct: number, col: string) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
      <span style={{ width: 78, color: C.mut }}>{l}</span>
      <svg width="120" height="10" aria-hidden="true"><rect width="120" height="10" rx="5" fill={C.line} /><rect width={Math.round(120 * Math.max(0, Math.min(1, pct)))} height="10" rx="5" fill={col} /></svg>
      <span style={{ ...MONO, whiteSpace: "nowrap" }}>{txt}</span>
    </div>
  );
  const col = role ? (t?.stance === "support" ? C.green : C.orange) : C.violet;
  return (
    <Stage tint={role ? "#1B2B6B" : "#3D1A7A"} floorBottom={120} floorH={150} style={{ padding: narrow ? 10 : "16px 20px", marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ ...ARCADE, fontSize: 24 }}>{p.label}</span>
        <Tag color={col}>{t?.label}</Tag>
        <Tag color={t?.stance === "support" ? C.green : C.orange}>{t?.stance === "support" ? "协作方" : "对抗方"}</Tag>
        {p.team_code && <Tag color={C.cyan}>{p.team_code} 队调研</Tag>}
        {c.source && (c.source.method || c.source.date) && <span style={{ marginLeft: "auto", fontSize: 14, color: C.mut }}>来源：{[c.source.method, c.source.date, c.source.n ? `样本 ${c.source.n}` : ""].filter(Boolean).join(" · ")}</span>}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
        {!role && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignSelf: "center", width: 290 }}>
            <div style={{ ...ARCADE, fontSize: 16, color: C.amber }}>角色属性</div>
            {stat("调研扎实度", String(solid), solid / 100, C.cyan)}
            {stat("访谈原话", `${quotes} 条`, quotes / 5, C.amber)}
            {stat("资料覆盖", `${filled} / ${WALK.length}`, filled / WALK.length, C.violet)}
            <div style={{ fontSize: 14.5, color: C.mut, lineHeight: 1.6 }}>别的队伍和它交锋后证伪了假设，你的战队 +1</div>
          </div>
        )}
        <Fighter src={avatarOf(p.role_type)} size={narrow ? 130 : 200} color={col} side="l" talking lunge title={p.label}
          sub={`${t?.label || ""} · ${role ? "教师注入角色" : "学生调研分身"}`} colW={narrow ? 300 : 400} topH={120}
          top={<Speech key={`${p.id}:${step}`} color={col} name={role ? p.label : finished ? "校对完成" : `正在向你确认 ${step + 1} / ${WALK.length}`} fs={narrow ? 15 : 18}>{line}</Speech>} />
        <Fighter src={seatAvatar(1)} size={narrow ? 90 : 130} color={C.cyan} side="r" second title="我 · 调研员" sub="学生战队" colW={narrow ? 130 : 180} />
      </div>
      {!role && (
        <div style={{ border: `2px solid ${C.ink}`, borderRadius: 8, background: C.panel, padding: "12px 16px", marginTop: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {!finished && <>
            <button onClick={() => { setDone({ ...done, [cur.k]: true }); setStep(step + 1); }} style={{ fontFamily: "inherit", fontSize: 15, fontWeight: 700, minHeight: 44, padding: "0 22px", borderRadius: 10, border: "none", background: C.green, color: "#06241A", cursor: "pointer" }}>{v ? "对，访谈里就是这么说的" : "知道了，下一项"}</button>
            <button onClick={onEdit} style={{ fontFamily: "inherit", fontSize: 15, minHeight: 44, padding: "0 22px", borderRadius: 10, border: `1px solid ${C.orange}`, background: "transparent", color: C.orange, cursor: "pointer" }}>不对，我来改</button>
          </>}
          {finished && <button onClick={() => { setStep(0); setDone({}); }} style={{ fontFamily: "inherit", fontSize: 14, minHeight: 44, padding: "0 18px", borderRadius: 10, border: `1px solid ${C.cyan}`, background: "transparent", color: C.cyan, cursor: "pointer" }}>重新校对</button>}
          <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {WALK.map((w, i) => {
              const has = !!val(c, w.k);
              const colr = !has ? C.orange : done[w.k] ? C.green : i === step ? C.amber : C.mut;
              return <Tag key={w.k} color={colr}>{w.label}{!has ? " 资料未提及" : done[w.k] ? " 已确认" : i === step ? " 确认中" : ""}</Tag>;
            })}
          </span>
        </div>
      )}
    </Stage>
  );
}

export default function TwinPage() {
  const [mine, setMine] = useState<Persona[]>([]);
  const [all, setAll] = useState<Persona[]>([]);
  const [teacher, setTeacher] = useState(false);
  const [teamCode, setTeamCode] = useState("");
  const [rt, setRt] = useState(TWIN_TYPES[0].key);
  const [label, setLabel] = useState("");
  const [method, setMethod] = useState(SOURCE_METHODS[0]);
  const [date, setDate] = useState("");
  const [n, setN] = useState("");
  const [text, setText] = useState("");
  const [vis, setVis] = useState("class");
  const [consent, setConsent] = useState<boolean[]>(CONSENT_ITEMS.map(() => false));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [selId, setSelId] = useState<string>("");
  const [role, setRole] = useState({ role_type: ROLE_TYPES[0].key, label: "", identity: "", focus: "" });

  const load = useCallback(async () => {
    try {
      const a = await api<{ personas: Persona[]; teacher: boolean }>("/api/persona?scope=mine");
      setMine(a.personas); setTeacher(a.teacher);
      if (a.teacher) setAll((await api<{ personas: Persona[] }>("/api/persona?scope=all")).personas);
      const ar = await api<{ myTeam?: { team_code: string } | null }>("/api/arena").catch(() => ({ myTeam: null }));
      if (ar.myTeam?.team_code) setTeamCode((t) => t || ar.myTeam!.team_code);
    } catch (e) { setMsg((e as Error).message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function onFile(fl: FileList | null) {
    if (!fl?.length) return;
    setMsg("正在解析文件…");
    try {
      for (const file of Array.from(fl)) {
        const a = await uploadAttachment(file);
        if (a.kind === "text" && a.text) setText((t) => (t ? t + "\n\n" : "") + `【${file.name}】\n` + a.text);
        else setMsg("图片请先整理成文字再上传");
      }
      setMsg("");
    } catch (e) { setMsg((e as Error).message); }
  }

  async function build() {
    setBusy(true); setMsg("正在根据你的调研生成角色卡…");
    try {
      const r = await api<{ pii: Record<string, number>; persona: Persona }>("/api/persona", { body: { role_type: rt, label, team_code: teamCode, method, date, n, text, consent, visibility: vis } });
      const flags = Object.entries(r.pii || {});
      setMsg(flags.length ? `已生成。系统自动隐去了：${flags.map(([k, v]) => `${k}×${v}`).join("、")}` : "已生成。请核对角色卡：只能保留调研里真实出现的内容。");
      setText(""); setLabel(""); setConsent(CONSENT_ITEMS.map(() => false));
      if (r.persona?.id) setSelId(r.persona.id);
      load();
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  async function del(id: string) {
    if (!confirm("删除后该分身不再参与任何对局，确定？")) return;
    try { await api(`/api/persona?id=${id}`, { method: "DELETE" }); load(); } catch (e) { alert((e as Error).message); }
  }
  async function toggle(p: Persona) {
    try { await api("/api/persona", { method: "PATCH", body: { id: p.id, enabled: !p.enabled } }); load(); } catch (e) { alert((e as Error).message); }
  }
  async function seed() {
    try { const r = await api<{ added: number }>("/api/persona", { body: { action: "seed_roles" } }); setMsg(`已注入 ${r.added} 个角色原型`); load(); } catch (e) { setMsg((e as Error).message); }
  }
  async function addRole() {
    try { await api("/api/persona", { body: { kind: "role", ...role } }); setRole({ ...role, label: "", identity: "", focus: "" }); load(); } catch (e) { alert((e as Error).message); }
  }

  const sel = [...mine, ...all].find((p) => p.id === selId) || mine.find((p) => p.kind === "twin") || null;
  const ready = consent.every(Boolean) && text.trim().length >= 80 && !busy;

  const list = (ps: Persona[], showOwner = false) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 12 }}>
      {ps.map((p) => {
        const t = TYPE_BY_KEY[p.role_type];
        return (
          <div key={p.id} style={{ ...box, opacity: p.enabled ? 1 : 0.55 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Avatar src={avatarOf(p.role_type)} size={44} /><b>{p.label}</b>
              <Tag color={t?.stance === "challenge" ? "#B91C1C" : "#15803D"}>{t?.stance === "challenge" ? "对抗方" : "协作方"}</Tag>
              {p.kind === "twin" && p.team_code && <Tag color="#6D28D9">{p.team_code}</Tag>}
              {showOwner && <Tag color="#475569">{p.kind === "role" ? "教师角色" : "学生分身"}</Tag>}
            </div>
            {editing === p.id ? <div style={{ marginTop: 10 }}><Editor p={p} onSaved={() => { setEditing(null); load(); }} onCancel={() => setEditing(null)} /></div> : <CardView p={p} />}
            {editing !== p.id && (
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                <Btn small onClick={() => { setSelId(p.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>上台校对</Btn>
                <Btn small ghost onClick={() => setEditing(p.id)}>修改</Btn>
                <Btn small ghost color="#B45309" onClick={() => toggle(p)}>{p.enabled ? "停用" : "启用"}</Btn>
                <Btn small ghost color="#B91C1C" onClick={() => del(p.id)}>删除</Btn>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <LearnChrome emoji="🧬" title="分身工坊 · 创建角色" subtitle="把真实调研注入数字分身 · 分身是假设，不是证据">
      {sel && <TwinStage p={sel} onEdit={() => setEditing(sel.id)} />}
      <div style={{ ...box, borderColor: "#B4530966", marginBottom: 16, fontSize: 14.5, lineHeight: 1.8 }}>
        <b style={{ color: "#B45309" }}>虚实闭环原则</b>：分身只会说你调研里真实出现过的话；资料没有的，它会直说“我的资料里没有，去现实中问问”。
        在对局里，分身“同意”不等于验证通过——所有结论都要回到现实中验证，经老师确认才计高分。你做的分身越扎实，越能让别的队伍证伪假设，你的队伍也会得分。
      </div>

      <div style={{ ...box, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 12 }}>① 选择分身类型</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TWIN_TYPES.map((t) => (
            <button key={t.key} onClick={() => setRt(t.key)} style={{
              padding: "8px 12px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              border: `1px solid ${rt === t.key ? "#0E7490" : "var(--line)"}`, background: rt === t.key ? "rgba(34,211,238,.12)" : "#F1F5F9", color: "var(--ink)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 15 }}><Avatar src={avatarOf(t.key)} size={40} />{t.label}</div>
              <div style={{ fontSize: 14.5, color: "var(--mut)" }}>{t.hint}</div>
            </button>
          ))}
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 800, margin: "18px 0 10px" }}>② 注入调研资料</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
          <div><span style={lab}>角色名（原型，不写真名）</span><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="如：钛材厂采购经理A" style={field} /></div>
          <div><span style={lab}>所在队伍编号</span><input value={teamCode} onChange={(e) => setTeamCode(e.target.value.toUpperCase())} placeholder="T1" style={field} /></div>
          <div><span style={lab}>调研方式</span><select value={method} onChange={(e) => setMethod(e.target.value)} style={field}>{SOURCE_METHODS.map((m) => <option key={m} style={{ background: "#fff" }}>{m}</option>)}</select></div>
          <div><span style={lab}>调研时间</span><input value={date} onChange={(e) => setDate(e.target.value)} placeholder="2026-11" style={field} /></div>
          <div><span style={lab}>样本数</span><input value={n} onChange={(e) => setN(e.target.value)} placeholder="如：3人" style={field} /></div>
          <div><span style={lab}>可见范围</span><select value={vis} onChange={(e) => setVis(e.target.value)} style={field}><option value="class" style={{ background: "#fff" }}>全班（可被别队挑战）</option><option value="team" style={{ background: "#fff" }}>仅本队预演</option></select></div>
        </div>
        <div style={{ marginTop: 10 }}>
          <span style={lab}>访谈记录 / 问卷结果 / 观察笔记（至少 80 字；也可上传 docx/pdf/txt）</span>
          <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} style={{ ...field, resize: "vertical" }}
            placeholder={"例：\n问：你们现在怎么做钛棒表面质检？\n答：两个老师傅拿灯照，一班下来眼睛受不了，漏检大概每月有十几根……"} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <label style={{ fontSize: 14, color: "var(--cyan)", cursor: "pointer" }}>📎 上传文件<input type="file" accept={ACCEPT} multiple hidden onChange={(e) => onFile(e.target.files)} /></label>
            <span style={{ fontSize: 15, color: "var(--mut)" }}>{text.length} 字</span>
          </div>
        </div>

        <h3 style={{ fontSize: 16, fontWeight: 800, margin: "18px 0 8px" }}>③ 逐条确认</h3>
        {CONSENT_ITEMS.map((c, i) => (
          <label key={i} style={{ display: "flex", gap: 8, fontSize: 14.5, marginTop: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={consent[i]} onChange={(e) => setConsent(consent.map((x, j) => (j === i ? e.target.checked : x)))} />{c}
          </label>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
          <Btn onClick={build} disabled={!ready}>{busy ? "生成中…" : "生成数字分身"}</Btn>
          {msg && <span style={{ fontSize: 14, color: "var(--mut)" }}>{msg}</span>}
        </div>
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 800, margin: "8px 0 10px" }}>我做的分身（{mine.filter((p) => p.kind === "twin").length}）</h3>
      {mine.filter((p) => p.kind === "twin").length ? list(mine.filter((p) => p.kind === "twin")) : <p style={{ fontSize: 14.5, color: "var(--mut)" }}>还没有。先去做一次真实访谈吧。</p>}

      {teacher && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>教师 · 角色原型注入</h3>
          <div style={{ ...box, marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <Btn onClick={seed}>一键注入默认角色（评委 / 投资人 / 导师 / 伦理 / 商业 / 合规 / 钛产业）</Btn>
              <span style={{ fontSize: 15, color: "var(--mut)" }}>已有的不会重复注入；注入后可逐个修改关注重点。</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr 1fr 1.4fr auto", gap: 8, marginTop: 12, alignItems: "end" }}>
              <div><span style={lab}>类型</span><select value={role.role_type} onChange={(e) => setRole({ ...role, role_type: e.target.value })} style={field}>{ROLE_TYPES.map((t) => <option key={t.key} value={t.key} style={{ background: "#fff" }}>{t.label}</option>)}</select></div>
              <div><span style={lab}>角色名</span><input value={role.label} onChange={(e) => setRole({ ...role, label: e.target.value })} style={field} /></div>
              <div><span style={lab}>身份说明</span><input value={role.identity} onChange={(e) => setRole({ ...role, identity: e.target.value })} style={field} /></div>
              <div><span style={lab}>关注重点</span><input value={role.focus} onChange={(e) => setRole({ ...role, focus: e.target.value })} style={field} /></div>
              <Btn onClick={addRole}>新增</Btn>
            </div>
          </div>
          <h4 style={{ fontSize: 14, fontWeight: 800, margin: "12px 0 8px" }}>全部分身与角色（{all.length}）</h4>
          {list(all, true)}
        </div>
      )}
    </LearnChrome>
  );
}

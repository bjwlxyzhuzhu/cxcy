"use client";
// 学期与课程：管理员设学期起止日期、建课程并勾选上课班级；教师只读。成长报告按这里的学期切分时间窗口。
import { useCallback, useEffect, useState } from "react";

type Term = { id: string; name: string; start_date: string; end_date: string };
type Course = { id: string; term_id: string; name: string; term: string; classes: string[] };
type Data = { terms: Term[]; courses: Course[]; classes: { class: string; students: number }[]; canEdit: boolean };

const card: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 16, background: "rgba(255,255,255,.04)", padding: 18 };
const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "rgba(255,255,255,.05)", color: "var(--ink)", fontSize: 13.5, outline: "none", fontFamily: "inherit" };
const btn: React.CSSProperties = { padding: "8px 16px", borderRadius: 10, border: "none", fontWeight: 800, fontSize: 13, color: "#05060f", cursor: "pointer", fontFamily: "inherit", background: "linear-gradient(120deg,var(--cyan),var(--violet))" };
const ghost: React.CSSProperties = { padding: "4px 10px", borderRadius: 8, border: "1px solid var(--line)", background: "none", color: "var(--mut)", cursor: "pointer", fontFamily: "inherit", fontSize: 12 };

export default function TermCourse() {
  const [d, setD] = useState<Data | null>(null);
  const [msg, setMsg] = useState("");
  const [t, setT] = useState({ id: "", name: "", start_date: "", end_date: "" });
  const [co, setCo] = useState<{ id: string; term_id: string; name: string; classes: string[] }>({ id: "", term_id: "", name: "创新创业基础", classes: [] });

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/terms"); const j = await r.json().catch(() => ({}));
    if (r.ok) { setD(j); setCo((x) => ({ ...x, term_id: x.term_id || j.terms[0]?.id || "" })); } else setMsg("✗ " + (j.error || r.status));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function post(body: Record<string, unknown>, ok: string) {
    setMsg("");
    const r = await fetch("/api/admin/terms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg("✗ " + (j.error || r.status)); return false; }
    setMsg("✓ " + ok); await load(); return true;
  }

  if (!d) return <div style={card}>{msg || "加载中…"}</div>;
  const edit = d.canEdit;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {msg && <div style={{ fontSize: 13, color: msg.startsWith("✗") ? "#ff7a8a" : "#34d399" }}>{msg}</div>}
      {!edit && <div style={{ fontSize: 13, color: "var(--mut)" }}>学期与课程由管理员设置，教师可查看。</div>}

      <div style={card}>
        <b style={{ fontSize: 15 }}>学期</b>
        <div style={{ display: "grid", gap: 6, margin: "10px 0" }}>
          {d.terms.length === 0 && <div style={{ fontSize: 13, color: "var(--mut)" }}>还没有学期。</div>}
          {d.terms.map((x) => (
            <div key={x.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5, flexWrap: "wrap" }}>
              <b>{x.name}</b><span style={{ color: "var(--mut)" }}>{x.start_date} — {x.end_date}</span>
              {edit && <><button style={ghost} onClick={() => setT(x)}>修改</button>
                <button style={{ ...ghost, color: "#ff7a8a" }} onClick={() => confirm(`删除学期「${x.name}」？其下课程与教师评语会一并删除`) && post({ action: "term.delete", id: x.id }, "已删除")}>删除</button></>}
            </div>
          ))}
        </div>
        {edit && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input placeholder="学期名称，如 2026–2027 学年第一学期" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} style={{ ...inp, minWidth: 260 }} />
            <input type="date" value={t.start_date} onChange={(e) => setT({ ...t, start_date: e.target.value })} style={inp} />
            <span style={{ color: "var(--mut)" }}>至</span>
            <input type="date" value={t.end_date} onChange={(e) => setT({ ...t, end_date: e.target.value })} style={inp} />
            <button style={btn} onClick={async () => { if (await post({ action: "term.save", ...t }, t.id ? "学期已修改" : "学期已新建")) setT({ id: "", name: "", start_date: "", end_date: "" }); }}>{t.id ? "保存修改" : "新建学期"}</button>
            {t.id && <button style={ghost} onClick={() => setT({ id: "", name: "", start_date: "", end_date: "" })}>取消</button>}
          </div>
        )}
      </div>

      <div style={card}>
        <b style={{ fontSize: 15 }}>课程</b>
        <div style={{ display: "grid", gap: 8, margin: "10px 0" }}>
          {d.courses.length === 0 && <div style={{ fontSize: 13, color: "var(--mut)" }}>还没有课程。</div>}
          {d.courses.map((x) => (
            <div key={x.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5, flexWrap: "wrap" }}>
              <b>{x.name}</b><span style={{ color: "var(--mut)" }}>{x.term}</span>
              <span style={{ fontSize: 12.5 }}>班级：{x.classes.length ? x.classes.join("、") : "未关联"}</span>
              {edit && <><button style={ghost} onClick={() => setCo({ id: x.id, term_id: x.term_id, name: x.name, classes: x.classes })}>修改</button>
                <button style={{ ...ghost, color: "#ff7a8a" }} onClick={() => confirm(`删除课程「${x.name}」？该课程的教师评语会一并删除`) && post({ action: "course.delete", id: x.id }, "已删除")}>删除</button></>}
            </div>
          ))}
        </div>
        {edit && (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select value={co.term_id} onChange={(e) => setCo({ ...co, term_id: e.target.value })} style={inp}>
                {d.terms.length === 0 && <option value="">先新建学期</option>}
                {d.terms.map((x) => <option key={x.id} value={x.id} style={{ background: "#0a0e22" }}>{x.name}</option>)}
              </select>
              <input placeholder="课程名称" value={co.name} onChange={(e) => setCo({ ...co, name: e.target.value })} style={{ ...inp, minWidth: 200 }} />
              <button style={btn} onClick={async () => { if (await post({ action: "course.save", ...co }, co.id ? "课程已修改" : "课程已新建")) setCo({ id: "", term_id: co.term_id, name: "创新创业基础", classes: [] }); }}>{co.id ? "保存修改" : "新建课程"}</button>
              {co.id && <button style={ghost} onClick={() => setCo({ id: "", term_id: co.term_id, name: "创新创业基础", classes: [] })}>取消</button>}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--mut)" }}>上课班级（来自已导入的学生名单）：</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {d.classes.length === 0 && <span style={{ fontSize: 13, color: "var(--mut)" }}>还没有班级，请先在“名单导入”导入学生。</span>}
              {d.classes.map((k) => {
                const on = co.classes.includes(k.class);
                return (
                  <label key={k.class} style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 13, padding: "4px 10px", borderRadius: 999, border: `1px solid ${on ? "var(--cyan)" : "var(--line)"}`, cursor: "pointer" }}>
                    <input type="checkbox" checked={on} onChange={() => setCo({ ...co, classes: on ? co.classes.filter((x) => x !== k.class) : [...co.classes, k.class] })} />
                    {k.class}<span style={{ color: "var(--mut)" }}>{k.students} 人</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--mut)", lineHeight: 1.7 }}>任课教师与班级的关联在“名单导入”里建立（教师行填授课班级，或学生行填任课教师工号）。成长报告按学期起止日期切分时间：开课第 2 周末作为增值性评价的基线，学期结束日作为终结性评价的时间点。</div>
    </div>
  );
}

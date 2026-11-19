"use client";
// 学生成长报告（管理端，显示真实姓名）：学生列表 → 单人报告（过程性 / 增值性 / 终结性评价）。
// 所有数字来自数据库真实记录，AI 不打分；教师评语只存文字。可打印 / 另存为 PDF。
import { useCallback, useEffect, useState } from "react";
import RadarChart from "@/app/apply/RadarChart";

type Course = { id: string; name: string; term: string; classes: string[] };
type Row = { id: string; account: string; name: string; class: string; project: string; activeDays: number; evidence: number; stepsBase: number; stepsNow: number; gain: number; abilities: number; citeFirst: number | null; citeLast: number | null; hasComment: boolean };
type Report = {
  student: { id: string; account: string; name: string; class: string };
  course: { id: string; name: string; term: string; start: string; end: string } | null;
  window: { start: string; end: string; baseline: string; finished: boolean };
  project: { id: string; name: string; members: number } | null;
  process: { weeks: { week: number; from: string; evidence: number; ai: number; certified: number; arena: number }[]; activeDays: number; milestones: { step: number; label: string; at: string | null }[]; totals: { evidence: number; ai: number; certified: number; arena: number } };
  valueAdded: { stepsBase: number; stepsNow: number; abilities: { key: string; label: string; base: number; now: number; gain: number; basis: { label: string; n: number }[] }[]; citeFirst: number | null; citeLast: number | null; rounds: number };
  summative: { stepsDone: number; steps: { step: number; label: string; status: string }[]; verified: number; pitch: boolean; archive: boolean; abilities: { key: string; label: string; count: number; score: number }[]; comment: string; commentAt: string | null };
};

const card: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 16, background: "rgba(255,255,255,.04)", padding: 16 };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 12, color: "var(--mut)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,.05)" };
const SERIES = [
  { key: "evidence", label: "学习证据", color: "#22d3ee" }, { key: "ai", label: "AI 使用", color: "#a78bfa" },
  { key: "certified", label: "项目认证", color: "#34d399" }, { key: "arena", label: "对局带证据回应", color: "#fbbf24" },
] as const;
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("zh-CN") : "—");
const pct = (v: number | null) => (v === null ? "—" : `${v}%`);

export default function GrowthReports() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState("");
  const [klass, setKlass] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [rep, setRep] = useState<Report | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    setErr("");
    const p = new URLSearchParams(); if (course) p.set("course", course); if (klass) p.set("class", klass);
    const r = await fetch("/api/admin/growth?" + p); const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error || String(r.status)); return; }
    setCourses(j.courses); setRows(j.items);
  }, [course, klass]);
  useEffect(() => { load(); }, [load]);

  async function open(id: string) {
    const r = await fetch(`/api/admin/growth?user=${id}${course ? `&course=${course}` : ""}`); const j = await r.json().catch(() => ({}));
    if (!r.ok) setErr(j.error || String(r.status)); else setRep(j);
  }

  if (rep) return <ReportView rep={rep} onBack={() => { setRep(null); load(); }} />;
  const cur = courses.find((c) => c.id === course);
  const list = (rows || []).filter((r) => !q || `${r.name}${r.account}${r.class}${r.project}`.includes(q));
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ ...card, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select value={course} onChange={(e) => { setCourse(e.target.value); setKlass(""); }} style={sel}>
          <option value="" style={{ background: "#0a0e22" }}>全部学生（按各自课程）</option>
          {courses.map((c) => <option key={c.id} value={c.id} style={{ background: "#0a0e22" }}>{c.term} · {c.name}</option>)}
        </select>
        {cur && <select value={klass} onChange={(e) => setKlass(e.target.value)} style={sel}>
          <option value="" style={{ background: "#0a0e22" }}>本课程全部班级</option>
          {cur.classes.map((k) => <option key={k} value={k} style={{ background: "#0a0e22" }}>{k}</option>)}
        </select>}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 搜姓名 / 学号 / 项目" style={{ ...sel, minWidth: 200 }} />
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--mut)" }}>三类评价都由真实记录计算，AI 不打分；点学生看完整报告</span>
      </div>
      {err && <div style={{ color: "#ff7a8a", fontSize: 13 }}>{err}</div>}
      {courses.length === 0 && <div style={{ fontSize: 13, color: "#fbbf24" }}>还没有设置学期与课程，报告暂按最近 16 周计算。建议先到“学期与课程”设置。</div>}
      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead><tr>{["姓名", "学号", "班级", "项目", "活跃天数", "学习证据", "8 步（基线→现在）", "五力增量", "证据引用率（首轮→末轮）", "评语", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {rows === null && <tr><td style={td} colSpan={11}>加载中…</td></tr>}
            {rows?.length === 0 && <tr><td style={td} colSpan={11}>没有学生。</td></tr>}
            {list.map((r) => (
              <tr key={r.id}>
                <td style={{ ...td, fontWeight: 700 }}>{r.name}</td><td style={td}>{r.account}</td><td style={td}>{r.class || "—"}</td>
                <td style={td}>{r.project || <span style={{ color: "var(--mut)" }}>未加入</span>}</td>
                <td style={td}>{r.activeDays}</td><td style={td}>{r.evidence}</td>
                <td style={td}>{r.stepsBase} → <b>{r.stepsNow}</b></td>
                <td style={{ ...td, color: r.gain > 0 ? "#34d399" : "var(--mut)" }}>{r.gain > 0 ? `+${r.gain}` : r.gain}</td>
                <td style={td}>{pct(r.citeFirst)} → {pct(r.citeLast)}</td>
                <td style={td}>{r.hasComment ? "✓" : "—"}</td>
                <td style={td}><button onClick={() => open(r.id)} style={linkBtn}>成长报告 →</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportView({ rep, onBack }: { rep: Report; onBack: () => void }) {
  const [comment, setComment] = useState(rep.summative.comment);
  const [msg, setMsg] = useState("");
  const max = Math.max(1, ...rep.process.weeks.map((w) => w.evidence + w.ai + w.certified + w.arena));
  async function save() {
    if (!rep.course) return;
    const r = await fetch("/api/admin/growth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: rep.student.id, course_id: rep.course.id, comment }) });
    const j = await r.json().catch(() => ({})); setMsg(r.ok ? "✓ 已保存" : "✗ " + (j.error || r.status));
  }
  const gainMax = Math.max(1, ...rep.valueAdded.abilities.map((a) => a.now));
  return (
    <div style={{ display: "grid", gap: 12 }} className="growth-report">
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }} className="no-print">
        <button onClick={onBack} style={linkBtn}>← 返回列表</button>
        <button onClick={() => window.print()} style={linkBtn}>🖨 打印 / 另存为 PDF</button>
      </div>
      <div style={card}>
        <div style={{ fontSize: 20, fontWeight: 900 }}>{rep.student.name} 的成长报告</div>
        <div style={{ fontSize: 13, color: "var(--mut)", marginTop: 4, lineHeight: 1.8 }}>
          学号 {rep.student.account} · 班级 {rep.student.class || "—"} · {rep.course ? `${rep.course.term} · ${rep.course.name}（${rep.course.start} — ${rep.course.end}）` : "未设置课程（按最近 16 周）"}
          <br />项目：{rep.project ? `${rep.project.name}（团队 ${rep.project.members} 人，五力与 8 步按团队项目计算）` : "还没加入项目"} · 统计截至 {day(rep.window.end)}{rep.window.finished ? "（学期已结束）" : "（学期进行中）"}
        </div>
      </div>

      {/* 过程性评价 */}
      <div style={card}>
        <Head n="一" t="过程性评价" d="每周留下了什么学习痕迹，8 步分别在哪天完成" c="#22d3ee" />
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13, margin: "6px 0 10px" }}>
          <span>活跃天数 <b>{rep.process.activeDays}</b></span>
          {SERIES.map((s) => <span key={s.key}><span style={{ color: s.color }}>■</span> {s.label} <b>{rep.process.totals[s.key]}</b></span>)}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 140, borderBottom: "1px solid var(--line)" }}>
          {rep.process.weeks.map((w) => (
            <div key={w.week} title={`第 ${w.week} 周（${w.from} 起）：证据 ${w.evidence} · AI ${w.ai} · 认证 ${w.certified} · 对局 ${w.arena}`} style={{ flex: 1, display: "flex", flexDirection: "column-reverse", height: "100%" }}>
              {SERIES.map((s) => <div key={s.key} style={{ height: `${(w[s.key] / max) * 100}%`, background: s.color, minHeight: w[s.key] ? 2 : 0 }} />)}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, fontSize: 10.5, color: "var(--mut)" }}>{rep.process.weeks.map((w) => <span key={w.week} style={{ flex: 1, textAlign: "center" }}>{w.week}</span>)}</div>
        <div style={{ fontSize: 12, color: "var(--mut)", margin: "2px 0 10px" }}>横轴：教学周</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {rep.process.milestones.map((m) => (
            <div key={m.step} style={{ flex: "1 1 110px", borderRadius: 10, padding: "6px 8px", border: `1px solid ${m.at ? "#34d39988" : "var(--line)"}`, background: m.at ? "rgba(52,211,153,.1)" : "transparent" }}>
              <div style={{ fontSize: 11.5, color: "var(--mut)" }}>第 {m.step} 步</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{m.label}</div>
              <div style={{ fontSize: 11.5, color: m.at ? "#34d399" : "var(--mut)" }}>{m.at ? `完成于 ${day(m.at)}` : "未完成"}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 增值性评价 */}
      <div style={card}>
        <Head n="二" t="增值性评价" d={`和自己比：基线（开课第 2 周末，${day(rep.window.baseline)}）→ 现在`} c="#a78bfa" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 14, marginTop: 8 }}>
          <div>
            {rep.valueAdded.abilities.map((a) => (
              <div key={a.key} style={{ marginBottom: 8 }} title={a.basis.map((b) => `${b.label} ${b.n}`).join(" · ")}>
                <div style={{ display: "flex", fontSize: 13 }}><span>{a.label}</span><span style={{ marginLeft: "auto" }}>{a.base} → <b>{a.now}</b> <span style={{ color: a.gain > 0 ? "#34d399" : "var(--mut)" }}>（{a.gain > 0 ? "+" : ""}{a.gain}）</span></span></div>
                <div style={{ position: "relative", height: 10, borderRadius: 5, background: "rgba(255,255,255,.08)", marginTop: 3 }}>
                  <div style={{ position: "absolute", inset: 0, width: `${(a.now / gainMax) * 100}%`, borderRadius: 5, background: "#a78bfa" }} />
                  <div style={{ position: "absolute", inset: 0, width: `${(a.base / gainMax) * 100}%`, borderRadius: 5, background: "#64748b" }} />
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: "var(--mut)" }}>灰色 = 基线，紫色 = 现在；数的是已认证的记录条数（鼠标悬停看明细）</div>
          </div>
          <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
            <Stat label="产品线完成步数" a={`${rep.valueAdded.stepsBase} 步`} b={`${rep.valueAdded.stepsNow} 步`} />
            <Stat label="对局中引用证据的比例" a={pct(rep.valueAdded.citeFirst)} b={pct(rep.valueAdded.citeLast)} note={rep.valueAdded.rounds > 1 ? `首轮 → 第 ${rep.valueAdded.rounds} 轮` : "对局轮次不足两轮，暂无对比"} />
          </div>
        </div>
      </div>

      {/* 终结性评价 */}
      <div style={card}>
        <Head n="三" t="终结性评价" d={`学期结束时（${rep.window.finished ? "已结束" : "截至今天"}）的最终结果`} c="#f472b6" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 14, marginTop: 8 }}>
          <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {rep.summative.steps.map((s) => <span key={s.step} title={`${s.step} ${s.label}`} style={{ flex: 1, textAlign: "center", fontSize: 11, padding: "6px 0", borderRadius: 6, background: s.status === "done" ? "#34d399" : s.status === "doing" ? "#a78bfa55" : "rgba(255,255,255,.06)", color: s.status === "done" ? "#04121c" : "var(--mut)" }}>{s.step}</span>)}
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.9 }}>
              <div>产品线完成 <b>{rep.summative.stepsDone} / 8</b> 步</div>
              <div>教师确认的现实验证 <b>{rep.summative.verified}</b> 条</div>
              <div>路演页 {rep.summative.pitch ? "✓ 已审阅确认" : "—"} · 项目档案 {rep.summative.archive ? "✓ 已归档" : "—"}</div>
            </div>
          </div>
          <div>
            <RadarChart size={240} accent="#f472b6" axes={rep.summative.abilities.map((a) => ({ label: a.label, score: a.score, max: 100 }))} valueText={(i) => `${rep.summative.abilities[i].count} 条`} />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>教师评语</div>
          {rep.course ? (
            <>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} placeholder="结合以上记录写评语（只存文字，不折算分数）" style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--line)", background: "rgba(255,255,255,.05)", color: "var(--ink)", fontFamily: "inherit", fontSize: 13.5, resize: "vertical" }} />
              <div className="no-print" style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
                <button onClick={save} style={linkBtn}>保存评语</button>
                {msg && <span style={{ fontSize: 12.5, color: msg.startsWith("✗") ? "#ff7a8a" : "#34d399" }}>{msg}</span>}
                {rep.summative.commentAt && <span style={{ fontSize: 12, color: "var(--mut)" }}>上次保存 {day(rep.summative.commentAt)}</span>}
              </div>
            </>
          ) : <div style={{ fontSize: 13, color: "var(--mut)" }}>先在“学期与课程”里把这个学生的班级加入某门课程，才能写评语。</div>}
        </div>
      </div>
      <style>{`@media print { .no-print, nav, header { display: none !important; } .growth-report { color: #000; } }`}</style>
    </div>
  );
}

function Head({ n, t, d, c }: { n: string; t: string; d: string; c: string }) {
  return <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}><b style={{ fontSize: 16, color: c }}>{n}、{t}</b><span style={{ fontSize: 12.5, color: "var(--mut)" }}>{d}</span></div>;
}
function Stat({ label, a, b, note }: { label: string; a: string; b: string; note?: string }) {
  return (
    <div style={{ borderRadius: 12, padding: 12, border: "1px solid var(--line)" }}>
      <div style={{ fontSize: 12.5, color: "var(--mut)" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900 }}>{a} <span style={{ color: "#a78bfa" }}>→</span> {b}</div>
      {note && <div style={{ fontSize: 11.5, color: "var(--mut)" }}>{note}</div>}
    </div>
  );
}
const sel: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "rgba(255,255,255,.05)", color: "var(--ink)", fontSize: 13.5, fontFamily: "inherit" };
const linkBtn: React.CSSProperties = { padding: "6px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "rgba(255,255,255,.06)", color: "var(--ink)", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5 };

"use client";
// 课程教学记录（管理端）：8 次课教学设计、授课打点时间轴、教学成效统计。全部来自课程表与数据库真实记录。
import { useEffect, useState } from "react";
import { UNITS, LESSON_MARKS } from "@/lib/course";

type Lesson = { id: string; class: string; unit_no: number; started_at: string; ended_at: string | null; marks: { key: string; label: string; at: string }[] };
type Data = { scope: string; at: string; lessons: Lesson[]; stepReach: number[]; abilities: { key: string; label: string; avg: number }[]; stats: Record<string, number | null> };

const card: React.CSSProperties = { border: "1px solid var(--line)", borderRadius: 16, background: "#F1F5F9", padding: 16 };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 13.5, color: "var(--mut)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid #F1F5F9", verticalAlign: "top", lineHeight: 1.6, fontSize: 14 };
const sub: React.CSSProperties = { fontSize: 13, color: "var(--mut)", marginTop: 3 };
const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

export default function TeachingRecord() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  useEffect(() => { fetch("/api/admin/teaching-record").then(async (r) => { const j = await r.json(); if (r.ok) setD(j); else setErr(j.error || String(r.status)); }).catch(() => setErr("加载失败")); }, []);
  const s = d?.stats || {};
  const v = (k: string, suf = "") => (s[k] === null || s[k] === undefined ? "暂无" : `${s[k]}${suf}`);
  const timeline = (l: Lesson) => {
    const t0 = Date.parse(l.started_at), end = l.ended_at ? Date.parse(l.ended_at) : Date.now();
    return l.marks.map((m, i) => `${mmss(Date.parse(m.at) - t0)}–${mmss((l.marks[i + 1] ? Date.parse(l.marks[i + 1].at) : end) - t0)} ${m.label}`).join("\n");
  };

  if (err) return <div style={{ ...card, color: "#B91C1C" }}>{err}</div>;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ fontSize: 14, color: "var(--mut)" }}>统计范围：{d?.scope || "…"} · 截至 {d ? new Date(d.at).toLocaleString("zh-CN", { hour12: false }) : "…"} · 全部来自数据库真实记录</div>

      <div style={card}>
        <b style={{ fontSize: 15 }}>教学成效统计</b>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginTop: 10 }}>
          {[["参与学生", v("students", " 人")], ["学生项目", v("projects", " 个")], ["已认证证据", v("evidence", " 条")], ["带用户原话的证据", v("quotes", " 条")], ["挂证据的决策", v("decisions", " 条")],
            ["发布 V0.2 的项目", v("versions2", " 个")], ["证伪并修正的假设", v("falsified", " 条")], ["教师确认的现实验证", v("verified", " 条")], ["AI 使用次数", v("aiUses", " 次")],
            ["学生核对认证", v("certifies", " 次")], ["驳回 AI 草稿", v("rejects", " 次")], ["干预卡回应率", v("cardRate", "%")]].map(([l, x]) => (
            <div key={l} style={{ borderRadius: 12, padding: 10, border: "1px solid var(--line)" }}><div style={{ fontSize: 13.5, color: "var(--mut)" }}>{l}</div><div style={{ fontSize: 18, fontWeight: 900 }}>{x}</div></div>
          ))}
        </div>
        <div style={{ fontSize: 14, marginTop: 10, lineHeight: 1.8 }}>
          对局中引用证据的比例：第 {v("roundFirst")} 轮 {v("citeFirst", "%")} → 第 {v("roundLast")} 轮 {v("citeLast", "%")}
          <br />五力（各项目平均条数）：{d?.abilities.map((a) => `${a.label} ${a.avg}`).join(" · ") || "暂无"}
        </div>
      </div>

      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <div style={{ padding: "14px 16px 4px" }}><b style={{ fontSize: 15 }}>教学设计 · 8 次课贯穿一个项目</b></div>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead><tr>{["次", "单元", "课前", "课中", "课后", "五力", "区域产业", "课程思政", "完成项目数"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {UNITS.map((u) => (
              <tr key={u.no}>
                <td style={{ ...td, color: u.color, fontWeight: 900 }}>{u.no}</td><td style={{ ...td, fontWeight: 700 }}>{u.title}</td>
                <td style={td}>{u.pre.task}<div style={sub}>{u.pre.ai}</div></td>
                <td style={td}>{u.inClass.task}<div style={sub}>{u.inClass.ai}</div></td>
                <td style={td}>{u.post.task}<div style={sub}>{u.post.ai}</div></td>
                <td style={td}>{u.ability}</td><td style={td}>{u.region}</td><td style={td}>{u.values}</td>
                <td style={{ ...td, textAlign: "center" }}>{d ? `${d.stepReach[u.no - 1]} / ${s.projects ?? 0}` : "…"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={card}>
        <b style={{ fontSize: 15 }}>授课记录与环节时间轴</b>
        <span style={{ fontSize: 13.5, color: "var(--mut)", marginLeft: 8 }}>在授课工作台上课时按环节打点生成</span>
        {d?.lessons.length === 0 && <div style={{ fontSize: 14.5, color: "var(--mut)", marginTop: 8 }}>还没有授课记录。</div>}
        <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
          {d?.lessons.map((l) => (
            <div key={l.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 14.5 }}>
                <b>第 {l.unit_no} 次课</b><span style={{ color: "var(--mut)" }}>{l.class || "未指定班级"} · {new Date(l.started_at).toLocaleString("zh-CN", { hour12: false })}</span>
                {!l.ended_at && <span style={{ color: "#B45309" }}>上课中</span>}
                <button onClick={async () => { try { await navigator.clipboard.writeText(timeline(l)); setCopied(l.id); setTimeout(() => setCopied(""), 1500); } catch { /* 忽略 */ } }}
                  style={{ marginLeft: "auto", fontSize: 13.5, background: "none", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)", cursor: "pointer", padding: "2px 8px", fontFamily: "inherit" }}>{copied === l.id ? "已复制" : "复制时间轴"}</button>
              </div>
              <div style={{ display: "flex", height: 12, borderRadius: 4, overflow: "hidden", marginTop: 4 }}>
                {l.marks.map((m, i) => {
                  const end = l.ended_at ? Date.parse(l.ended_at) : Date.now();
                  const w = (l.marks[i + 1] ? Date.parse(l.marks[i + 1].at) : end) - Date.parse(m.at);
                  return <div key={i} title={m.label} style={{ flex: Math.max(1, w), minWidth: 2, background: LESSON_MARKS.find((x) => x.key === m.key)?.color || "#64748b" }} />;
                })}
              </div>
              <pre style={{ fontSize: 13, color: "var(--mut)", margin: "4px 0 0", whiteSpace: "pre-wrap", fontFamily: "monospace" }}>{timeline(l)}</pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

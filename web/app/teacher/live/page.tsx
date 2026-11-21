"use client";
// 授课工作台（上课投屏）：虚拟教室席位 + 实时学情 + 本节课流程与打点 + 对局状态 + 功能坞。
// 屏幕上只出现席位号与虚拟头像，不出现学生姓名；所有数字来自数据库真实记录，每 8 秒刷新。
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import RadarChart from "../../apply/RadarChart";
import { api } from "@/components/arena/ui";
import { UNITS, LESSON_MARKS, unitOf } from "@/lib/course";

type Seat = { seat: number; avatar: number; online: boolean; hasProject: boolean; done: number; current: number; evidenceToday: number; aiToday: number; openCards: number; inArena: boolean };
type Mark = { key: string; label: string; at: string };
type Live = {
  classes: string[]; pick: string; seats: Seat[]; stepDist: number[]; abilities: { key: string; label: string; avg: number }[];
  lesson: { id: string; class: string; unit_no: number; started_at: string; marks: Mark[] } | null;
  arena: { id: string; title: string; status: string; round: number; rounds: number; code: string; turns: number; evidence: number; verifying: number } | null;
  summary: { size: number; online: number; withProject: number; projects: number; evidenceToday: number; aiToday: number; openCards: number };
};
const AV = ["🐼", "🐯", "🦊", "🐰", "🐻", "🐶", "🐱", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦆", "🦉", "🦅", "🦄", "🐝"];
const panel: React.CSSProperties = { borderRadius: 14, background: "#fff", border: "1px solid #E2E8F0", padding: 14, boxShadow: "0 1px 2px rgba(15,23,42,.04),0 4px 14px rgba(15,23,42,.05)" };
const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

export default function LivePage() {
  const [d, setD] = useState<Live | null>(null);
  const [klass, setKlass] = useState("");
  const [unit, setUnit] = useState(1);
  const [err, setErr] = useState("");
  const [now, setNow] = useState(0); // 0 = 尚未挂载，避免服务端与浏览器时间不一致导致水合报错
  const [pickSeat, setPickSeat] = useState<Seat | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<Live>(`/api/teacher/live${klass ? `?class=${encodeURIComponent(klass)}` : ""}`);
      setD(r); setErr("");
      if (!klass && r.pick) setKlass(r.pick);
      if (r.lesson) setUnit(r.lesson.unit_no);
    } catch (e) { setErr((e as Error).message); }
  }, [klass]);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    try { await api("/api/teacher/live", { body }); await load(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  const u = unitOf(d?.lesson?.unit_no || unit);
  const marks = d?.lesson?.marks || [];
  const started = d?.lesson ? new Date(d.lesson.started_at).getTime() : 0;
  const cols = useMemo(() => Math.min(10, Math.max(4, Math.ceil(Math.sqrt((d?.seats.length || 1) * 1.6)))), [d?.seats.length]);
  const s = d?.summary;

  return (
    <div style={{ minHeight: "100vh", background: "var(--page)", color: "#1F2937", padding: "12px 14px 96px", fontFamily: "inherit" }}>
      {/* 顶栏 */}
      <div style={{ ...panel, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "10px 14px" }}>
        <Link href="/teacher" style={{ color: "#1E3A8A", textDecoration: "none", fontSize: 14.5 }}>← 教师工作台</Link>
        <b style={{ fontSize: 18 }}>🏫 授课工作台</b>
        <select value={klass} onChange={(e) => setKlass(e.target.value)} style={sel}>
          {(d?.classes || []).length === 0 && <option value="">（还没有班级，请先导入名单）</option>}
          {(d?.classes || []).map((c) => <option key={c} value={c} style={{ background: "#fff" }}>{c}</option>)}
        </select>
        <select value={unit} onChange={(e) => setUnit(Number(e.target.value))} disabled={!!d?.lesson} style={sel}>
          {UNITS.map((x) => <option key={x.no} value={x.no} style={{ background: "#fff" }}>第 {x.no} 次课 · {x.title}</option>)}
        </select>
        {d?.lesson
          ? <button disabled={busy} onClick={() => act({ action: "end", id: d.lesson!.id })} style={{ ...btn, background: "#B91C1C" }}>下课</button>
          : <button disabled={busy || !klass} onClick={() => act({ action: "start", class: klass, unit_no: unit })} style={{ ...btn, background: "linear-gradient(120deg,#0E7490,#6D28D9)", color: "#fff" }}>开始上课</button>}
        <span style={{ marginLeft: "auto", fontFamily: "monospace", fontSize: 22, fontWeight: 900, color: "#0369A1" }}>{now ? new Date(now).toLocaleTimeString("zh-CN", { hour12: false }) : "--:--:--"}</span>
        {d?.lesson && now > 0 && <span style={{ fontSize: 14.5, color: "#B45309" }}>已上课 {mmss(now - started)}</span>}
      </div>
      {err && <div style={{ color: "#B91C1C", margin: "8px 4px" }}>{err}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(200px,250px) minmax(0,1fr) minmax(230px,290px)", gap: 12, marginTop: 12 }} className="live-grid">
        {/* 左：班级概况与学情 */}
        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          <div style={panel}>
            <div style={ph}>班级概况</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6, textAlign: "center" }}>
              {[["总人数", s?.size], ["今日在线", s?.online], ["有项目", s?.withProject]].map(([l, v]) => (
                <div key={l as string}><div style={{ fontSize: 22, fontWeight: 900, color: "#0369A1" }}>{v ?? "—"}</div><div style={{ fontSize: 13, color: "#5B6577" }}>{l}</div></div>
              ))}
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "#E2E8F0", marginTop: 8, overflow: "hidden" }}>
              <div style={{ width: `${s?.size ? (s.online / s.size) * 100 : 0}%`, height: "100%", background: "#15803D" }} />
            </div>
          </div>
          <div style={panel}>
            <div style={ph}>今日学情</div>
            {[["🤖 AI 使用次数", s?.aiToday, "#6D28D9"], ["📎 留下的学习证据", s?.evidenceToday, "#0E7490"], ["📮 待回应干预卡", s?.openCards, "#B45309"], ["📁 班级项目数", s?.projects, "#BE185D"]].map(([l, v, c]) => (
              <div key={l as string} style={{ display: "flex", justifyContent: "space-between", fontSize: 14.5, padding: "4px 0" }}><span>{l}</span><b style={{ color: c as string }}>{v ?? 0}</b></div>
            ))}
          </div>
          <div style={panel}>
            <div style={ph}>项目进度分布（完成步数）</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 90 }}>
              {(d?.stepDist || Array(9).fill(0)).map((n, k) => {
                const max = Math.max(1, ...(d?.stepDist || [1]));
                return <div key={k} title={`完成 ${k} 步：${n} 个项目`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                  <span style={{ fontSize: 10, color: "#1F2937" }}>{n || ""}</span>
                  <div style={{ width: "100%", height: `${(n / max) * 70}%`, minHeight: n ? 4 : 1, borderRadius: 3, background: k === 0 ? "#475569" : UNITS[k - 1].color }} />
                  <span style={{ fontSize: 10, color: "#5B6577" }}>{k}</span>
                </div>;
              })}
            </div>
          </div>
        </div>

        {/* 中：虚拟教室 */}
        <div style={{ ...panel, padding: 0, overflow: "hidden", position: "relative", minHeight: 520, background: "linear-gradient(180deg,#dfe7f5 0%,#c9d5ea 38%,#aebcd8 100%)" }}>
          <div style={{ margin: "18px auto 0", width: "72%", borderRadius: 10, background: "#1f4d3a", border: "8px solid #6b4f2a", padding: "14px 18px", color: "#eafff3", boxShadow: "0 8px 24px rgba(0,0,0,.35)" }}>
            <div style={{ fontSize: 13.5, opacity: 0.8 }}>第 {u.no} 次课 · 主练{u.ability}</div>
            <div style={{ fontSize: 24, fontWeight: 900, margin: "2px 0" }}>{u.title}</div>
            <div style={{ fontSize: 14 }}>{u.question}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", fontSize: 13.5 }}>
              {[u.pre, u.inClass, u.post].map((p, i) => <span key={p.label} style={{ border: "1px solid #9ff0c7", borderRadius: 999, padding: "2px 10px" }}>{["①", "②", "③"][i]} {p.label}：{p.module.label}</span>)}
            </div>
          </div>
          <div style={{ perspective: 900, padding: "18px 24px 28px" }}>
            <div style={{ transform: "rotateX(24deg)", transformOrigin: "50% 0%", display: "grid", gridTemplateColumns: `repeat(${cols},1fr)`, gap: 10 }}>
              {(d?.seats || []).map((st) => (
                <button key={st.seat} onClick={() => setPickSeat(st)} title={`席位 ${st.seat}`} style={{
                  position: "relative", border: "none", cursor: "pointer", fontFamily: "inherit", borderRadius: 10, padding: "6px 2px 4px",
                  background: st.online ? "linear-gradient(180deg,#ffffff,#e6eefc)" : "linear-gradient(180deg,#c3cde0,#aab6cf)",
                  boxShadow: st.inArena ? "0 0 0 2px #B45309, 0 6px 10px rgba(0,0,0,.25)" : "0 6px 10px rgba(0,0,0,.22)", opacity: st.online ? 1 : 0.7,
                }}>
                  <div style={{ fontSize: 26, lineHeight: 1, filter: st.online ? "none" : "grayscale(.8)" }}>{AV[st.avatar]}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#1e293b" }}>席位 {st.seat}</div>
                  <div style={{ display: "flex", gap: 1, justifyContent: "center", marginTop: 2 }}>
                    {UNITS.map((x) => <span key={x.no} style={{ width: 5, height: 5, borderRadius: 3, background: x.no <= st.done ? x.color : "rgba(30,41,59,.2)" }} />)}
                  </div>
                  {st.openCards > 0 && <span style={{ position: "absolute", top: -6, right: -4, fontSize: 13.5 }}>📮</span>}
                  {st.inArena && <span style={{ position: "absolute", top: -6, left: -4, fontSize: 13.5 }}>⚔️</span>}
                </button>
              ))}
            </div>
            {d && d.seats.length === 0 && <div style={{ textAlign: "center", color: "#334155", marginTop: 40 }}>这个班级还没有学生。请到“管理后台 → 名单导入”导入学生名单。</div>}
          </div>
          <div style={{ position: "absolute", left: 12, bottom: 8, fontSize: 13, color: "#334155" }}>亮色 = 今日在线 · ⚔️ 在对局中 · 📮 有待回应的干预卡 · 圆点 = 项目已完成步数</div>
        </div>

        {/* 右：本节课流程、打点、对局、五力 */}
        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          <div style={panel}>
            <div style={ph}>课堂实录打点 {d?.lesson ? "" : "（开始上课后可用）"}</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {LESSON_MARKS.map((m) => (
                <button key={m.key} disabled={!d?.lesson || busy} onClick={() => act({ action: "mark", id: d!.lesson!.id, key: m.key })}
                  style={{ ...btn, padding: "5px 9px", fontSize: 13.5, background: m.color + "14", border: `1px solid ${m.color}`, color: m.color, opacity: d?.lesson ? 1 : 0.45 }}>{m.label}</button>
              ))}
            </div>
            <div style={{ marginTop: 8, display: "grid", gap: 3, maxHeight: 150, overflowY: "auto" }}>
              {marks.map((m, i) => (
                <div key={i} style={{ fontSize: 13.5, display: "flex", gap: 8 }}>
                  <span style={{ fontFamily: "monospace", color: "#0369A1" }}>{mmss(new Date(m.at).getTime() - started)}</span>
                  <span style={{ color: LESSON_MARKS.find((x) => x.key === m.key)?.color }}>■</span>{m.label}
                </div>
              ))}
            </div>
          </div>
          <div style={panel}>
            <div style={ph}>虚实对局</div>
            {d?.arena ? (
              <div style={{ fontSize: 14.5, lineHeight: 1.8 }}>
                <div><b>{d.arena.title}</b> · 第 {d.arena.round}/{d.arena.rounds} 轮</div>
                <div>对局码 <b style={{ fontFamily: "monospace", fontSize: 18, color: "#B45309" }}>{d.arena.code}</b></div>
                <div>交锋 {d.arena.turns} · 带证据回应 {d.arena.evidence} · 待确认 {d.arena.verifying}</div>
                <Link href={`/arena/screen?id=${d.arena.id}`} style={{ color: "#0369A1" }}>打开对局大屏 →</Link>
              </div>
            ) : <div style={{ fontSize: 14, color: "#5B6577" }}>本节课还没开局。<Link href="/arena/screen" style={{ color: "#0369A1" }}>去开局 →</Link></div>}
          </div>
          <div style={panel}>
            <div style={ph}>班级五力（各项目平均条数）</div>
            {d && d.abilities.length > 0
              ? <RadarChart size={220} accent="#15803D" axes={d.abilities.map((a) => ({ label: a.label, score: Math.min(100, a.avg * 10), max: 100 }))} valueText={(i) => `${d.abilities[i].avg}`} />
              : <div style={{ fontSize: 14, color: "#5B6577" }}>还没有项目数据</div>}
          </div>
        </div>
      </div>

      {/* 底部功能坞 */}
      <div style={{ position: "fixed", left: "50%", bottom: 12, transform: "translateX(-50%)", display: "flex", gap: 8, padding: "8px 12px", borderRadius: 18, background: "#fff", border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(15,23,42,.12)", zIndex: 20, flexWrap: "wrap", justifyContent: "center", maxWidth: "calc(100vw - 24px)" }}>
        {DOCK.map((x) => (
          <Link key={x.label} href={x.href} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, textDecoration: "none", color: "#1F2937", fontSize: 13, width: 64 }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", fontSize: 20, background: x.color }}>{x.icon}</span>{x.label}
          </Link>
        ))}
        <button onClick={() => { const el = document.documentElement; if (document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.(); }}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, background: "none", border: "none", color: "#1F2937", fontSize: 13, width: 64, cursor: "pointer", fontFamily: "inherit" }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", fontSize: 20, background: "#475569" }}>⛶</span>全屏
        </button>
      </div>

      {pickSeat && (
        <div onClick={() => setPickSeat(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.35)", display: "grid", placeItems: "center", zIndex: 30 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ ...panel, width: 320, textAlign: "center", padding: 18 }}>
            <div style={{ fontSize: 46 }}>{AV[pickSeat.avatar]}</div>
            <b style={{ fontSize: 18 }}>席位 {pickSeat.seat}</b>
            <div style={{ fontSize: 14, color: "#5B6577", marginBottom: 10 }}>{pickSeat.online ? "今日在线" : "今日未登录"}{pickSeat.inArena ? " · 在对局中" : ""}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, fontSize: 14.5, textAlign: "left" }}>
              <div>📁 项目：{pickSeat.hasProject ? `已完成 ${pickSeat.done}/8 步` : "还没加入项目"}</div>
              <div>🤖 今日 AI 使用：{pickSeat.aiToday}</div>
              <div>📎 今日学习证据：{pickSeat.evidenceToday}</div>
              <div>📮 待回应干预卡：{pickSeat.openCards}</div>
            </div>
            <div style={{ fontSize: 13.5, color: "#5B6577", marginTop: 10 }}>计分只认证据：请在对局里确认现实验证，或在引导师面板给项目发干预卡。</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
              <Link href="/teacher#panel" style={{ ...btn, textDecoration: "none", background: "#6D28D9", color: "#fff" }}>引导师面板</Link>
              <button onClick={() => setPickSeat(null)} style={{ ...btn, background: "#334155" }}>关闭</button>
            </div>
          </div>
        </div>
      )}
      <style>{`@media (max-width: 1000px){ .live-grid{ grid-template-columns: minmax(0,1fr) !important; } }`}</style>
    </div>
  );
}

const sel: React.CSSProperties = { padding: "7px 10px", borderRadius: 10, border: "1px solid #CBD5E1", background: "#fff", color: "#1F2937", fontFamily: "inherit", fontSize: 14.5 };
const btn: React.CSSProperties = { padding: "7px 14px", borderRadius: 10, border: "none", fontWeight: 800, fontSize: 14.5, color: "#fff", cursor: "pointer", fontFamily: "inherit" };
const ph: React.CSSProperties = { fontSize: 14.5, fontWeight: 800, marginBottom: 8, color: "#1F2937" };
const DOCK = [
  { icon: "⚔️", label: "开局对局", href: "/arena/screen", color: "#f59e0b" },
  { icon: "🧭", label: "引导师面板", href: "/teacher#panel", color: "#8b5cf6" },
  { icon: "📖", label: "课堂口径", href: "/apply/ontology?tab=glossary", color: "#0ea5e9" },
  { icon: "📘", label: "课程单元", href: "/course", color: "#22c55e" },
  { icon: "🧩", label: "本体拼图", href: "/teacher/ontology-game", color: "#10b981" },
  { icon: "📊", label: "成长报告", href: "/admin?tab=growth", color: "#ec4899" },
  { icon: "👥", label: "名单导入", href: "/admin", color: "#14b8a6" },
];

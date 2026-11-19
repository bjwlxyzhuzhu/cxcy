"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import RadarChart from "../../apply/RadarChart";
import { box, field, lab, Btn, Tag, api } from "@/components/arena/ui";
import { Avatar, Fighter, Speech, Bar, Banner, Stage, C, ARCADE, MONO } from "@/components/arena/battle";
import { HYP_COLOR, SEATS, TYPE_BY_KEY, avatarOf, seatAvatar } from "@/lib/arenaShared";

type Match = { id: string; title: string; scenario: string; status: string; round_no: number; rounds: number; round_minutes: number; round_ends_at: string | null; join_code?: string; created_at: string };
type Row = {
  id: string; team_code: string; name: string; venture: string; score: number; members: { seat: number; points: number; active: boolean }[]; turns: number; evidence: number; twinHits: number; vs: string; vsRole: string;
  hyp: { pending: number; falsified: number; verifying: number; verified: number; total: number };
  dims: { dim: string; score: number; max: number }[];
};
type Board = {
  match: Match; owner: boolean; board: Row[]; now: string;
  feed: { id: number; team: string; kind: string; label: string; points: number; payload: Record<string, string>; at: string }[];
  totals: { turns: number; evidence: number; pending: number; falsified: number; verifying: number; verified: number; members: number };
  verifying: { id: string; team: string; text: string; evidence: string; evidence_url: string; prereview?: { ok: boolean; note: string; items: { key: string; label: string; hit: boolean }[] } }[];
  mvp?: { team: string; bound: boolean; steps: string[]; done: number; current: number; versions: string[] }[];
  focus: null | { team: { id: string; name: string; venture: string }; persona: null | { label: string; role_type: string; kind: string }; seat: number; round: number; turns: { id: number; speaker: string; content: string; cites: boolean; demands: boolean }[] };
  loops: { l1: { turns: number; demand: number; cite: number }; l2: { pre: number | null; post: number | null; round: number }; l3: { pending: number; falsified: number; verifying: number; verified: number; iterations: number }; l4: { personas: number; skills: number } };
};
type Mode = "board" | "focus" | "loops" | "mvp";

/** 战况播报里的轮次事件：写清楚第几轮开始 / 结束 */
function roundText(p: Record<string, string>): string {
  const n = p?.round;
  if (p?.action === "end") return "对局结束";
  if (p?.action === "reopen") return `第 ${n} 轮重新开放`;
  return `第 ${n} 轮开始`;
}

const COLORS = [C.cyan, C.orange, C.violet, C.green, C.amber, C.pink, "#60a5fa", "#f87171"];

function Countdown({ end }: { end: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  if (!end) return <span>--:--</span>;
  const s = Math.max(0, Math.floor((new Date(end).getTime() - now) / 1000));
  return <span style={{ color: s < 60 ? "#f87171" : "inherit" }}>{String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</span>;
}

function Setup({ matches, onPick, reload }: { matches: Match[]; onPick: (id: string) => void; reload: () => void }) {
  const [f, setF] = useState({ title: "虚实对局", scenario: "路演答辩演练", team_count: 6, rounds: 3, round_minutes: 12, names: "" });
  const [err, setErr] = useState("");
  async function create() {
    setErr("");
    try {
      const r = await api<{ match: Match }>("/api/arena", { body: { action: "create", ...f, team_names: f.names.split(/[,，、\s]+/).filter(Boolean) } });
      reload(); onPick(r.match.id);
    } catch (e) { setErr((e as Error).message); }
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <div style={box}>
        <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>开一局</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><span style={lab}>对局名称</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={field} /></div>
          <div><span style={lab}>课次</span><input value={f.scenario} onChange={(e) => setF({ ...f, scenario: e.target.value })} style={field} /></div>
          <div><span style={lab}>队伍数</span><input type="number" value={f.team_count} onChange={(e) => setF({ ...f, team_count: +e.target.value })} style={field} /></div>
          <div><span style={lab}>轮数</span><input type="number" value={f.rounds} onChange={(e) => setF({ ...f, rounds: +e.target.value })} style={field} /></div>
          <div><span style={lab}>每轮分钟</span><input type="number" value={f.round_minutes} onChange={(e) => setF({ ...f, round_minutes: +e.target.value })} style={field} /></div>
          <div><span style={lab}>队名（逗号分隔，可空）</span><input value={f.names} onChange={(e) => setF({ ...f, names: e.target.value })} placeholder="钛智检,青铜文创,…" style={field} /></div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12 }}>
          <Btn onClick={create}>创建对局</Btn>
          <Link href="/apply/twin" style={{ fontSize: 12.5, color: "var(--cyan)" }}>先去分身工坊注入评委 / 导师角色 →</Link>
        </div>
        {err && <div style={{ fontSize: 12.5, color: "#f87171", marginTop: 8 }}>{err}</div>}
      </div>
      <div style={box}>
        <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 10 }}>我开过的对局</h3>
        {matches.length === 0 && <div style={{ fontSize: 13, color: "var(--mut)" }}>暂无</div>}
        {matches.map((m) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
            <span style={{ flex: 1, fontSize: 13.5 }}>{m.title} <span style={{ color: "var(--mut)", fontSize: 12 }}>{m.scenario} · {new Date(m.created_at).toLocaleDateString()}</span></span>
            <Tag color={m.status === "running" ? "#34d399" : m.status === "ended" ? "#94a3b8" : "#fbbf24"}>{m.status === "running" ? "进行中" : m.status === "ended" ? "已结束" : "待开始"}</Tag>
            <Btn small ghost onClick={() => onPick(m.id)}>打开大屏</Btn>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ScreenPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [teacher, setTeacher] = useState<boolean | null>(null);
  const [id, setId] = useState<string>("");
  const [b, setB] = useState<Board | null>(null);
  const [err, setErr] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<Mode>("board");
  const [focusId, setFocusId] = useState("");

  const loadList = useCallback(async () => {
    try { const r = await api<{ teacher: boolean; matches: Match[] }>("/api/arena"); setTeacher(r.teacher); setMatches(r.matches); }
    catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => {
    loadList();
    const q = new URLSearchParams(window.location.search).get("id");
    if (q) setId(q);
  }, [loadList]);

  const loadBoard = useCallback(async () => {
    if (!id) return;
    try { setB(await api<Board>(`/api/arena/board?id=${id}${mode === "focus" && focusId ? `&focus=${focusId}` : ""}`)); setErr(""); } catch (e) { setErr((e as Error).message); }
  }, [id, mode, focusId]);
  useEffect(() => { loadBoard(); const t = setInterval(loadBoard, 4000); return () => clearInterval(t); }, [loadBoard]);

  function pick(mid: string) { setId(mid); window.history.replaceState(null, "", `?id=${mid}`); }
  async function ctl(action: string) {
    try { await api("/api/arena", { body: { action, match_id: id } }); loadBoard(); } catch (e) { alert((e as Error).message); }
  }
  async function review(hid: string, ok: boolean) {
    try { await api("/api/arena/hypothesis", { body: { action: "review", id: hid, ok, note: notes[hid] || "" } }); loadBoard(); } catch (e) { alert((e as Error).message); }
  }

  const shell = (children: React.ReactNode) => (
    <>
      <div className="deep" /><div className="neb n1" /><div className="neb n2" />
      <div style={{ position: "relative", zIndex: 2, padding: "18px 26px 40px", maxWidth: 1880, margin: "0 auto" }}>{children}</div>
    </>
  );

  if (teacher === false && !id) return shell(<div style={box}>大屏仅供教师开局使用。学生请进入 <Link href="/apply/arena" style={{ color: "var(--cyan)" }}>虚实对局</Link>。</div>);
  if (!id || !b) return shell(
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Link href="/" style={{ fontSize: 13, color: "var(--ink)" }}>← 返回星图</Link>
        <h1 style={{ ...ARCADE, fontSize: 26 }}>虚实对局 · 教师大屏</h1>
        {err && <span style={{ color: "#f87171", fontSize: 13 }}>{err}</span>}
      </div>
      {teacher !== null && <Setup matches={matches} onPick={pick} reload={loadList} />}
    </>
  );

  const m = b.match, T = b.totals, L = b.loops;
  const maxScore = Math.max(1, ...b.board.map((r) => r.score));
  const fTeam = focusId || b.board[0]?.id || "";
  const openFocus = (tid: string) => { setFocusId(tid); setMode("focus"); };
  const tab = (k: Mode, label: string) => (
    <button key={k} onClick={() => { if (k === "focus" && !focusId) setFocusId(fTeam); setMode(k); }} aria-pressed={mode === k}
      style={{ ...ARCADE, fontFamily: "inherit", fontSize: 17, minHeight: 44, padding: "0 18px", cursor: "pointer", borderRadius: 8, transform: "skewX(-10deg)", color: mode === k ? "#0a0e1f" : C.ink, background: mode === k ? C.amber : "transparent", border: `2px solid ${mode === k ? C.amber : C.line}` }}>{label}</button>
  );

  // —— 对战看板 ——
  const boardView = (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 400px", gap: 16, marginTop: 14, alignItems: "start" }}>
      <div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 10, marginBottom: 12 }}>
          {[
            { k: "带证据回应", v: T.evidence, c: C.cyan }, { k: "待验证假设", v: T.pending, c: HYP_COLOR.pending }, { k: "已证伪并修正", v: T.falsified, c: HYP_COLOR.falsified },
            { k: "等老师确认", v: T.verifying, c: HYP_COLOR.verifying }, { k: "现实已验证", v: T.verified, c: HYP_COLOR.verified },
          ].map((x) => (
            <div key={x.k} style={{ ...box, padding: "8px 14px", borderColor: x.c + "66" }}>
              <div style={{ fontSize: 14, color: "var(--mut)" }}>{x.k}</div>
              <div style={{ ...MONO, fontSize: 34, color: x.c }}>{x.v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(400px,1fr))", gap: 12 }}>
          {b.board.map((r, i) => {
            const c = COLORS[i % COLORS.length];
            const opp = TYPE_BY_KEY[r.vsRole];
            return (
              <div key={r.id} style={{ ...box, borderColor: c + "88", padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ ...ARCADE, fontSize: 30, color: c }}>{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 22, fontWeight: 900 }}>{r.name}</div>
                    <div style={{ fontSize: 13, color: "var(--mut)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.venture || "尚未填写微企业"}</div>
                  </div>
                  <span className={i === 0 && r.score > 0 ? "bt-pop" : undefined} style={{ ...MONO, fontSize: 40, color: c, display: "inline-block" }}>{r.score}</span>
                </div>
                <div style={{ marginTop: 6 }}><Bar w="100%" h={14} color={c} value={(r.score / maxScore) * 100} side="r" /></div>
                {/* 小组成员：席位、个人贡献、谁在出招 */}
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {r.members.length === 0 && <span style={{ fontSize: 13, color: "var(--mut)" }}>等待队员入队</span>}
                  {r.members.map((mb, j) => (
                    <div key={j} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: 62 }}>
                      <Avatar src={seatAvatar(mb.seat)} size={46} alt={SEATS[mb.seat % 5]} ring={mb.active ? C.amber : undefined} />
                      <span style={{ fontSize: 12.5 }}>{SEATS[mb.seat % 5]}</span>
                      <span style={{ ...MONO, fontSize: 13, color: mb.active ? C.amber : "var(--mut)" }}>+{mb.points}</span>
                    </div>
                  ))}
                  <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    {r.vs ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                        <span style={{ ...ARCADE, color: C.amber }}>VS</span>
                        <Avatar src={avatarOf(r.vsRole)} size={34} alt="" ring={opp?.stance === "support" ? C.green : C.orange} />
                        <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.vs}</span>
                      </div>
                    ) : <span style={{ fontSize: 13, color: "var(--mut)" }}>尚未交锋</span>}
                    <Btn small ghost color={C.amber} onClick={() => openFocus(r.id)}>投到焦点对战</Btn>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
                  <RadarChart axes={r.dims.map((d) => ({ label: d.dim, score: d.score, max: d.max }))} size={136} accent={c} />
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignContent: "center" }}>
                    <Tag color="#94a3b8">交锋 {r.turns} · 带证据 {r.evidence}</Tag>
                    <Tag color={HYP_COLOR.pending}>待验证 {r.hyp.pending}</Tag><Tag color={HYP_COLOR.falsified}>证伪并修正 {r.hyp.falsified}</Tag>
                    <Tag color={HYP_COLOR.verified}>现实已验证 {r.hyp.verified}</Tag><Tag color={C.violet}>分身命中 {r.twinHits}</Tag>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div>
        {b.owner && (
          <div style={{ ...box, marginBottom: 12, borderColor: HYP_COLOR.verifying + "88" }}>
            <div style={{ ...ARCADE, fontSize: 17, marginBottom: 6 }}>待确认的现实验证（{b.verifying.length}）</div>
            {b.verifying.length === 0 && <div style={{ fontSize: 13, color: "var(--mut)" }}>暂无。学生提交现实证据后出现在这里。</div>}
            {b.verifying.map((h) => (
              <div key={h.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8, marginTop: 8 }}>
                <div style={{ fontSize: 12.5, color: "var(--mut)" }}>{h.team}</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{h.text}</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>证据：{h.evidence}</div>
                {h.prereview && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4, fontSize: 11.5 }}>
                    <span style={{ color: "var(--mut)" }}>自动预审</span>
                    {h.prereview.items.map((i) => <Tag key={i.key} color={i.hit ? C.green : "#f87171"}>{i.hit ? "✓" : "✗"} {i.label}</Tag>)}
                  </div>
                )}
                {h.evidence_url && <a href={h.evidence_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "var(--cyan)" }}>查看链接</a>}
                <input aria-label="点评" value={notes[h.id] || ""} onChange={(e) => setNotes({ ...notes, [h.id]: e.target.value })} placeholder="点评（可选）" style={{ ...field, fontSize: 13, marginTop: 6 }} />
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <Btn small color={C.green} onClick={() => review(h.id, true)}>确认 +5</Btn>
                  <Btn small ghost color="#f87171" onClick={() => review(h.id, false)}>证据不足，退回</Btn>
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={box}>
          <div style={{ ...ARCADE, fontSize: 17, marginBottom: 6 }}>战况播报</div>
          <div style={{ maxHeight: 560, overflowY: "auto" }}>
            {b.feed.map((e) => (
              <div key={e.id} style={{ fontSize: 13.5, padding: "6px 0", borderBottom: "1px solid var(--line)", lineHeight: 1.6 }}>
                <span style={{ color: "var(--mut)" }}>{new Date(e.at).toLocaleTimeString("zh-CN", { hour12: false })}</span>{" "}
                <b>{e.team}</b> {e.kind === "round" ? roundText(e.payload) : e.label}{e.points ? <span style={{ ...MONO, color: C.green }}> +{e.points}</span> : null}
                {e.payload?.text && <div style={{ color: "var(--mut)" }}>“{e.payload.text}”</div>}
                {e.kind === "twin_hit" && <div style={{ color: "var(--mut)" }}>分身「{e.payload.persona}」让 {e.payload.against} 证伪了一条假设</div>}
              </div>
            ))}
            {b.feed.length === 0 && <div style={{ fontSize: 13, color: "var(--mut)" }}>等待第一次交锋…</div>}
          </div>
        </div>
      </div>
    </div>
  );

  // —— 焦点对战：把一支队伍的交锋投到全班面前 ——
  const F = b.focus;
  const fp = F?.persona;
  const fSupport = fp ? TYPE_BY_KEY[fp.role_type]?.stance === "support" : false;
  const fCol = fSupport ? C.green : C.orange;
  const fTurns = F?.turns || [];
  const lastStu = [...fTurns].reverse().find((t) => t.speaker === "student");
  const lastAgt = [...fTurns].reverse().find((t) => t.speaker !== "student");
  const lastT = fTurns[fTurns.length - 1];
  const stuTalking = lastT?.speaker === "student";
  const stuTurns = fTurns.filter((t) => t.speaker === "student");
  const fCited = stuTurns.filter((t) => t.cites).length;
  const fRow = b.board.find((r) => r.id === F?.team.id);
  const clip = (t: string, n = 150) => (t.length > n ? t.slice(0, n) + "…" : t);
  const focusView = (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {b.board.map((r) => (
          <button key={r.id} onClick={() => setFocusId(r.id)} aria-pressed={fTeam === r.id} style={{ fontFamily: "inherit", fontSize: 15, minHeight: 40, padding: "0 14px", borderRadius: 999, cursor: "pointer", color: "var(--ink)", border: `2px solid ${fTeam === r.id ? C.cyan : "var(--line)"}`, background: fTeam === r.id ? "rgba(56,214,238,.14)" : "transparent" }}>{r.name}</button>
        ))}
      </div>
      <Stage tint={fSupport ? "#0E4A3C" : "#1B2B6B"} floorBottom={40} floorH={260} style={{ padding: "18px 28px", minHeight: 760 }}>
        {!F || !fp ? (
          <div style={{ ...ARCADE, fontSize: 30, padding: 60, textAlign: "center" }}>{F ? `${F.team.name} 还没有开始交锋` : "选择一支队伍"}</div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
              <Avatar src={seatAvatar(F.seat)} size={84} alt="" ring={C.cyan} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 22, fontWeight: 900 }}>{F.team.name} <span style={{ fontSize: 15, color: C.mut, fontWeight: 400 }}>假设护盾</span></div>
                <Bar w="100%" h={26} color={C.cyan} value={Math.max(0, 100 - 16 * (stuTurns.length - fCited))} side="l" />
                <div style={{ fontSize: 15, color: C.mut }}>{F.team.venture || ""}</div>
              </div>
              <div style={{ textAlign: "center", minWidth: 170 }}>
                <div style={{ ...ARCADE, fontSize: 34, color: C.amber }}>ROUND {F.round || 1}</div>
                <div style={{ ...MONO, fontSize: 40 }}>{m.status === "running" ? <Countdown end={m.round_ends_at} /> : "--:--"}</div>
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <div style={{ fontSize: 22, fontWeight: 900 }}><span style={{ fontSize: 15, color: C.mut, fontWeight: 400 }}>{fSupport ? "待解决" : "质疑值"}</span> {fp.label}</div>
                <Bar w="100%" h={26} color={fCol} value={Math.max(0, 100 - 18 * fCited)} side="r" />
                <div style={{ fontSize: 15, color: C.mut }}>{fp.kind === "twin" ? "学生调研分身" : "教师注入角色"} · {TYPE_BY_KEY[fp.role_type]?.label || ""}</div>
              </div>
              <Avatar src={avatarOf(fp.role_type)} size={84} alt="" ring={fCol} />
            </div>
            <div style={{ position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 8, minHeight: 600 }}>
              <Fighter src={seatAvatar(F.seat)} size={300} color={C.cyan} side="l" talking={stuTalking} lunge={stuTalking}
                title={`${F.team.name} · ${SEATS[F.seat % 5]}`} sub="学生战队" colW={620} topH={230}
                top={lastStu ? <Speech key={lastStu.id} color={C.cyan} name={`${SEATS[F.seat % 5]}${lastStu.cites ? " · 带证据" : ""}`} fs={26}>{clip(lastStu.content)}</Speech> : null} />
              <div style={{ position: "absolute", left: 0, right: 0, top: 250, textAlign: "center", zIndex: 2, pointerEvents: "none" }}>
                <Banner text={lastStu?.cites && stuTalking ? "证据命中" : lastAgt?.demands && !stuTalking ? "拿出证据" : `ROUND ${F.round || 1}`} color={lastStu?.cites && stuTalking ? C.green : "#ffffff"} stroke={lastStu?.cites && stuTalking ? "#06241A" : fCol} size={84} />
              </div>
              <Fighter src={avatarOf(fp.role_type)} size={300} color={fCol} side="r" second talking={!stuTalking} lunge={!stuTalking && !!lastAgt}
                title={fp.label} sub={`${fSupport ? "协作方" : "对抗方"} · ${fp.kind === "twin" ? "学生调研分身" : "教师注入角色"}`} colW={620} topH={230}
                top={lastAgt ? <Speech key={lastAgt.id} color={fCol} name={fp.label} fs={26}>{clip(lastAgt.content)}</Speech> : null} />
            </div>
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginTop: 6, fontSize: 18 }}>
              <span>本场已交锋 <b style={{ ...MONO, color: C.cyan }}>{stuTurns.length}</b> 次</span>
              <span>带证据 <b style={{ ...MONO, color: C.green }}>{fCited}</b> 次</span>
              {fRow && <span>待验证假设 <b style={{ ...MONO, color: C.amber }}>{fRow.hyp.pending}</b> 条</span>}
              <span style={{ marginLeft: "auto", color: C.mut, fontSize: 16 }}>分身是假设，不是证据 · 计分只认证据</span>
            </div>
          </>
        )}
      </Stage>
    </div>
  );

  // —— 四层闭环 ——
  const loopCard = (n: string, title: string, sub: string, col: string, nodes: string[], stats: { k: string; v: string | number }[]) => (
    <div style={{ ...box, borderColor: col + "88", padding: "26px 30px", minHeight: 400 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ position: "relative", width: 104, height: 104, flexShrink: 0 }}>
          <svg className="bt-spin" viewBox="0 0 100 100" aria-hidden="true" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            <circle cx="50" cy="50" r="44" fill="none" stroke={col} strokeWidth="5" strokeDasharray="60 18" strokeLinecap="round" />
          </svg>
          <div style={{ ...ARCADE, position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, color: col }}>{n}</div>
        </div>
        <div><div style={{ ...ARCADE, fontSize: 38 }}>{title}</div><div style={{ fontSize: 20, color: "var(--mut)" }}>{sub}</div></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 26 }}>
        {nodes.map((x, i) => (
          <span key={x} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 22, padding: "10px 16px", borderRadius: 10, border: `1px solid ${col}88`, background: C.panel }}>{x}</span>
            <span aria-hidden="true" style={{ color: col, fontWeight: 900 }}>{i === nodes.length - 1 ? "↻" : "→"}</span>
          </span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 40, marginTop: 30, flexWrap: "wrap" }}>
        {stats.map((x) => <div key={x.k}><div style={{ ...MONO, fontSize: 64, lineHeight: 1.1, color: col }}>{x.v}</div><div style={{ fontSize: 18, color: "var(--mut)" }}>{x.k}</div></div>)}
      </div>
    </div>
  );
  // —— MVP 迭代：绑定了项目的队伍，8 步进度与已发布版本（只显示队名） ——
  const STEP_NAMES = ["赛道画像", "HMW 问题", "产品任务书", "V0.1", "测试报告", "V0.2", "路演 HTML", "项目档案"];
  const STEP_COLOR: Record<string, string> = { done: C.green, doing: C.violet, todo: "#1e293b", soon: "#1e293b" };
  const mvpView = (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 15, color: "var(--mut)" }}>
        人判断 / AI 执行 · 用真实用户证据驱动 V0.1 → V0.2
        <Tag color={C.green}>已完成</Tag><Tag color={C.violet}>进行中</Tag>
      </div>
      {(b.mvp || []).map((t, i) => (
        <div key={i} style={{ ...box, display: "grid", gridTemplateColumns: "180px minmax(0,1fr) 220px", gap: 16, alignItems: "center" }}>
          <div style={{ ...ARCADE, fontSize: 22 }}>{t.team}</div>
          {t.bound ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8,minmax(0,1fr))", gap: 6 }}>
              {t.steps.map((st, j) => (
                <div key={j} style={{ textAlign: "center" }}>
                  <div style={{ height: 22, borderRadius: 6, background: STEP_COLOR[st] || "#1e293b", border: j + 1 === t.current && st !== "done" ? `2px solid ${C.amber}` : "1px solid var(--line)" }} />
                  <div style={{ fontSize: 12, color: "var(--mut)", marginTop: 4 }}>{STEP_NAMES[j]}</div>
                </div>
              ))}
            </div>
          ) : <div style={{ fontSize: 14, color: "var(--mut)" }}>还没绑定本队项目（学生端“本队项目”下拉框里绑定）</div>}
          <div style={{ fontSize: 15 }}>
            {t.bound ? <>{t.versions.length ? t.versions.join(" → ") : "尚未发布版本"}<div style={{ fontSize: 12.5, color: "var(--mut)" }}>已完成 {t.done} / 8 步</div></> : null}
          </div>
        </div>
      ))}
      <div style={{ fontSize: 12.5, color: "var(--mut)" }}>以上进度全部来自项目本体里已认证的记录，随课堂实时更新。</div>
    </div>
  );

  const loopsView = (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        {loopCard("L1", "交锋闭环", "每一次对话 · 几十秒", C.cyan, ["提出主张", "被追问证据", "拿出证据或承认不知道"],
          [{ k: "学生发言", v: L.l1.turns }, { k: "被追问证据", v: L.l1.demand }, { k: "带证据回应", v: L.l1.cite }])}
        {loopCard("L2", "课堂闭环", "一节课 · 首轮对比末轮", C.orange, ["首轮对战", "暴露假设", "修正方案", "再战"],
          [{ k: "首轮证据引用率", v: L.l2.pre === null ? "待测" : `${L.l2.pre}%` }, { k: `第 ${L.l2.round || 1} 轮证据引用率`, v: L.l2.post === null ? "待测" : `${L.l2.post}%` }])}
        {loopCard("L3", "虚实闭环", "一学期 · 课堂到现实再回课堂", C.green, ["虚拟对战", "带走假设", "现实验证", "回课堂确认"],
          [{ k: "待验证", v: L.l3.pending }, { k: "证伪并修正", v: L.l3.falsified }, { k: "等老师确认", v: L.l3.verifying }, { k: "现实已验证", v: L.l3.verified }, { k: "方案迭代", v: L.l3.iterations }])}
        {loopCard("L4", "沉淀闭环", "跨届 · 经验留在平台里", C.violet, ["本届调研", "沉淀为分身与技能", "下一届对战"],
          [{ k: "角色与分身", v: L.l4.personas }, { k: "沉淀技能", v: L.l4.skills }])}
      </div>
      <div style={{ fontSize: 15, color: "var(--mut)", marginTop: 10 }}>以上数字全部来自本平台的真实记录，随课堂实时更新；首轮与末轮的证据引用率在第二轮开始后才有对比。</div>
    </div>
  );

  return shell(
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <button onClick={() => { setId(""); setB(null); window.history.replaceState(null, "", "?"); loadList(); }} style={{ background: "none", border: "none", color: "var(--mut)", cursor: "pointer", fontSize: 13, minHeight: 44 }}>← 对局列表</button>
        <div>
          <div style={{ ...ARCADE, fontSize: 32 }}>{m.title}</div>
          <div style={{ fontSize: 15, color: "var(--mut)" }}>{m.scenario} · 第 {m.round_no || 0}/{m.rounds} 轮 · {T.members} 人在场</div>
        </div>
        <div style={{ ...MONO, fontSize: 50, color: C.amber, marginLeft: 12 }}>{m.status === "running" ? <Countdown end={m.round_ends_at} /> : m.status === "ended" ? "已结束" : "待开始"}</div>
        {b.owner && m.join_code && (
          <div style={{ ...box, padding: "6px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 12.5, color: "var(--mut)" }}>对局码</div>
            <div style={{ ...MONO, fontSize: 34, letterSpacing: 6, color: C.amber }}>{m.join_code}</div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>{tab("board", "对战看板")}{tab("focus", "焦点对战")}{tab("loops", "四层闭环")}{tab("mvp", "MVP 迭代")}</div>
        {b.owner && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            {m.status === "lobby" && <Btn onClick={() => ctl("start")}>开始第 1 轮</Btn>}
            {m.status === "running" && m.round_no < m.rounds && <Btn onClick={() => ctl("next")}>进入第 {m.round_no + 1} 轮</Btn>}
            {m.status === "running" && <Btn color="#f87171" onClick={() => ctl("end")}>结束对局</Btn>}
            {m.status === "ended" && <Btn ghost onClick={() => ctl("reopen")}>重新开放</Btn>}
          </div>
        )}
      </div>
      {err && <div style={{ color: "#f87171", fontSize: 13, marginTop: 6 }}>{err}</div>}
      {mode === "board" ? boardView : mode === "focus" ? focusView : mode === "mvp" ? mvpView : loopsView}
    </>
  );
}

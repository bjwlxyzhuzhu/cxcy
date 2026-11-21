"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import LearnChrome from "../../learn/LearnChrome";
import MicButton from "@/components/MicButton";
import { box, field, lab, Btn, Tag, api } from "@/components/arena/ui";
import { Avatar, Fighter, Speech, Bar, Banner, Stage, C, ARCADE, MONO, useNarrow } from "@/components/arena/battle";
import { TYPE_BY_KEY, HYP_LABEL, HYP_COLOR, RULES_TEXT, SEATS, BAR, avatarOf, seatAvatar, type HypStatus, type PersonaCard } from "@/lib/arenaShared";

type Match = { id: string; title: string; scenario: string; status: string; round_no: number; rounds: number; round_minutes: number; round_ends_at: string | null };
type Team = { id: string; team_code: string; name: string; venture: string; members: number; score: number };
type Hyp = { id: string; text: string; status: HypStatus; persona_id: string | null; round_no: number; reason: string; revision: string; evidence: string; evidence_url: string; review_note: string };
type Persona = { id: string; kind: string; role_type: string; label: string; team_code: string; card: PersonaCard };
type State = { teacher: boolean; matches: Match[]; match?: Match; teams?: Team[]; myTeam?: { id: string; team_code: string; name: string; venture: string; project_id?: string | null } | null; mySeat?: number; hypotheses?: Hyp[] };
/** 一次交锋：我出招 → 对方回应 */
type Ex = { q: string; reply: string; cited: boolean; unknown: boolean; hint: string; points: number; error?: boolean };

function useCountdown(end: string | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!end) return "";
  const s = Math.max(0, Math.floor((new Date(end).getTime() - now) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function Lobby({ st, reload }: { st: State; reload: () => void }) {
  const [sel, setSel] = useState<string>(st.matches[0]?.id || "");
  const [teams, setTeams] = useState<Team[]>([]);
  const [team, setTeam] = useState("");
  const [seat, setSeat] = useState(0);
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!sel) return;
    api<State>(`/api/arena?id=${sel}`).then((r) => { setTeams(r.teams || []); setTeam(r.teams?.[0]?.id || ""); }).catch((e) => setErr(e.message));
  }, [sel]);
  async function join() {
    setErr("");
    try { await api("/api/arena", { body: { action: "join", match_id: sel, team_id: team, seat, join_code: code } }); reload(); }
    catch (e) { setErr((e as Error).message); }
  }
  if (!st.matches.length) return <div style={box}>现在没有进行中的对战。等老师在大屏上开局后刷新本页。</div>;
  return (
    <div style={{ ...box, maxWidth: 620 }}>
      <h3 style={{ ...ARCADE, fontSize: 22, marginBottom: 12 }}>加入对战</h3>
      <label style={lab} htmlFor="lm">对局</label>
      <select id="lm" value={sel} onChange={(e) => setSel(e.target.value)} style={field}>{st.matches.map((m) => <option key={m.id} value={m.id} style={{ background: "#fff" }}>{m.title}{m.scenario ? ` · ${m.scenario}` : ""}</option>)}</select>
      <span style={{ ...lab, marginTop: 12 }}>我的战队</span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {teams.map((t) => (
          <button key={t.id} onClick={() => setTeam(t.id)} style={{ minHeight: 44, padding: "8px 14px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit", color: "var(--ink)", border: `1px solid ${team === t.id ? C.cyan : "var(--line)"}`, background: team === t.id ? "rgba(34,211,238,.12)" : "transparent" }}>
            {t.name} <span style={{ fontSize: 14.5, color: "var(--mut)" }}>{t.members}人</span>
          </button>
        ))}
      </div>
      <span style={{ ...lab, marginTop: 12 }}>我在队里的席位（大屏只显示席位和头像，不显示姓名）</span>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {SEATS.map((s, i) => (
          <button key={s} onClick={() => setSeat(i)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: 8, borderRadius: 12, cursor: "pointer", fontFamily: "inherit", color: "var(--ink)", border: `2px solid ${seat === i ? C.cyan : "var(--line)"}`, background: seat === i ? "rgba(34,211,238,.12)" : "transparent" }}>
            <Avatar src={seatAvatar(i)} size={56} alt={s} /><span style={{ fontSize: 14.5 }}>{s}</span>
          </button>
        ))}
      </div>
      <label style={{ ...lab, marginTop: 12 }} htmlFor="lc">对局码（看大屏）</label>
      <input id="lc" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={5} style={{ ...field, letterSpacing: 4, fontSize: 18, width: 160 }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
        <Btn onClick={join} disabled={!team || code.length !== 5}>入队</Btn>
        {err && <span style={{ fontSize: 14, color: "#B91C1C" }}>{err}</span>}
      </div>
    </div>
  );
}

export default function ArenaPage() {
  const narrow = useNarrow();
  const [st, setSt] = useState<State | null>(null);
  const [err, setErr] = useState("");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [cur, setCur] = useState<string>("");
  const [chats, setChats] = useState<Record<string, Ex[]>>({});
  const [pendingQ, setPendingQ] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState("");
  const [venture, setVenture] = useState("");
  const [myProjects, setMyProjects] = useState<{ id: string; name: string }[]>([]);
  const [hText, setHText] = useState("");
  const [open, setOpen] = useState<{ id: string; mode: "falsify" | "verify" } | null>(null);
  const [f1, setF1] = useState(""); const [f2, setF2] = useState("");
  const [log, setLog] = useState(false);
  const [added, setAdded] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    try {
      const r = await api<State>("/api/arena");
      setSt(r);
      if (r.myTeam) setVenture((v) => v || r.myTeam!.venture || "");
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, [load]);
  useEffect(() => { api<{ personas: Persona[] }>("/api/persona").then((r) => setPersonas(r.personas)).catch(() => null); }, [st?.match?.id]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3200); return () => clearTimeout(t); }, [toast]);

  const left = useCountdown(st?.match?.round_ends_at || null);
  const me = st?.myTeam;
  const seat = st?.mySeat ?? 0;
  const myScore = st?.teams?.find((t) => t.id === me?.id)?.score ?? 0;

  const groups = useMemo(() => {
    const ch: Persona[] = [], sp: Persona[] = [], own: Persona[] = [];
    for (const p of personas) {
      if (p.kind === "twin" && me && p.team_code === me.team_code) { own.push(p); continue; }
      (TYPE_BY_KEY[p.role_type]?.stance === "support" ? sp : ch).push(p);
    }
    return { ch, sp, own };
  }, [personas, me]);
  const curP = personas.find((p) => p.id === cur);
  const exs = useMemo(() => chats[cur] || [], [chats, cur]);
  const support = curP ? TYPE_BY_KEY[curP.role_type]?.stance === "support" : false;
  const oppColor = support ? C.green : C.orange;

  // —— 对战条：全部由交锋记录推出，不另存状态 ——
  const fight = useMemo(() => {
    const ok = exs.filter((x) => !x.error);
    const citedN = ok.filter((x) => x.cited).length;
    const missN = ok.filter((x) => !x.cited).length;
    const unkN = ok.filter((x) => x.unknown).length;
    let combo = 0;
    for (let i = ok.length - 1; i >= 0 && ok[i].cited; i--) combo++;
    return {
      doubt: Math.max(0, 100 - BAR.doubtPerEvidence * citedN),
      shield: Math.max(0, 100 - BAR.shieldPerMiss * missN - BAR.shieldPerUnknown * unkN),
      combo,
    };
  }, [exs]);
  const last = exs[exs.length - 1];
  const greet = curP ? (support
    ? `我是${curP.label}。把你们刚被质疑的地方、或者想改的方案说给我听。`
    : `我是${curP.label}。先用两三句话说说：你们要卖给谁、解决他什么问题？`) : "";
  const banner = sending ? null
    : last?.hint ? { text: "现实检验", color: C.amber, stroke: "#2A1F00" }
    : last?.cited ? { text: `证据命中 +${last.points || 0}`, color: C.green, stroke: "#06241A" }
    : { text: `ROUND ${st?.match?.round_no || 1} · ${support ? "协作" : "追问"}`, color: "#ffffff", stroke: oppColor };

  async function send() {
    const q = input.trim();
    if (!q || !cur || sending || !st?.match) return;
    const history = exs.filter((x) => !x.error).flatMap((x) => [{ role: "user", content: x.q }, { role: "assistant", content: x.reply }]);
    setPendingQ(q); setInput(""); setSending(true);
    try {
      const r = await api<{ reply: string; tags: { unknown: boolean; hypothesis: string }; points: number; cited: boolean }>("/api/arena/turn", {
        body: { match_id: st.match.id, persona_id: cur, messages: [{ role: "assistant", content: greet }, ...history, { role: "user", content: q }] },
      });
      const hint = r.tags.hypothesis || (r.tags.unknown ? `关于“${q.slice(0, 30)}”——需要去现实中验证` : "");
      setChats((c) => ({ ...c, [cur]: [...(c[cur] || []), { q, reply: r.reply, cited: r.cited, unknown: r.tags.unknown, hint, points: r.points }] }));
      load();
    } catch (e) {
      setChats((c) => ({ ...c, [cur]: [...(c[cur] || []), { q, reply: (e as Error).message, cited: false, unknown: false, hint: "", points: 0, error: true }] }));
    } finally { setSending(false); setPendingQ(""); }
  }

  async function addHyp(text: string, key?: string) {
    if (!st?.match) return;
    try {
      const r = await api<{ points: number }>("/api/arena/hypothesis", { body: { action: "create", match_id: st.match.id, text, persona_id: cur || null } });
      setToast(r.points ? `提出假设 +${r.points}` : "已加入假设看板（本轮假设计分已满）");
      if (key) setAdded((a) => ({ ...a, [key]: true }));
      setHText(""); load();
    } catch (e) { alert((e as Error).message); }
  }
  async function act() {
    if (!open) return;
    try {
      if (open.mode === "falsify") { await api("/api/arena/hypothesis", { body: { action: "falsify", id: open.id, reason: f1, revision: f2 } }); setToast("证伪并修正 +3"); }
      else { await api("/api/arena/hypothesis", { body: { action: "verify_submit", id: open.id, evidence: f1, evidence_url: f2 } }); setToast("已提交，等老师确认"); }
      setOpen(null); setF1(""); setF2(""); load();
    } catch (e) { alert((e as Error).message); }
  }
  // 本队项目：把这局的假设与交锋归到同一条产品线（项目本体）
  useEffect(() => { api<{ items: { id: string; name: string }[] }>("/api/ontology/project").then((r) => setMyProjects(r.items)).catch(() => null); }, []);
  async function bindProject(project_id: string) {
    if (!st?.match) return;
    try { await api("/api/arena", { body: { action: "bind_project", match_id: st.match.id, project_id } }); setToast(project_id ? "已绑定本队项目" : "已解除绑定"); load(); } catch (e) { alert((e as Error).message); }
  }
  async function saveVenture() {
    if (!st?.match) return;
    try { await api("/api/arena", { body: { action: "venture", match_id: st.match.id, venture } }); setToast("已保存"); load(); } catch (e) { alert((e as Error).message); }
  }

  if (!st) return <LearnChrome emoji="⚔️" title="虚实对局" subtitle="加载中…"><div style={box}>{err || "加载中…"}</div></LearnChrome>;
  if (!st.match || !me) {
    return (
      <LearnChrome emoji="⚔️" title="虚实对局" subtitle="与数字分身对战 · 呼叫导师协作 · 回到现实验证">
        {st.teacher && <div style={{ ...box, marginBottom: 14 }}>你是教师：请到 <Link href="/arena/screen" style={{ color: "var(--cyan)" }}>教师大屏</Link> 开局与控场。</div>}
        {!st.teacher && <Lobby st={st} reload={load} />}
      </LearnChrome>
    );
  }

  const m = st.match;
  const running = m.status === "running";
  const H = narrow ? 104 : 156;
  const fs = narrow ? 14 : 16;
  const hyps = st.hypotheses || [];
  const hintKey = `${cur}:${exs.length}`;

  const rosterBtn = (p: Persona, ownTag = false) => {
    const t = TYPE_BY_KEY[p.role_type];
    const col = t?.stance === "support" ? C.green : C.orange;
    const on = cur === p.id;
    return (
      <button key={p.id} onClick={() => setCur(p.id)} style={{
        display: "flex", gap: 10, alignItems: "center", textAlign: "left", padding: "6px 10px", borderRadius: 10, cursor: "pointer", minHeight: 48,
        fontFamily: "inherit", color: "var(--ink)", border: on ? `2px solid ${col}` : "1px solid var(--line)", background: on ? "#F1F5F9" : "transparent",
      }}>
        <Avatar src={avatarOf(p.role_type)} size={36} />
        <span style={{ fontSize: 14, lineHeight: 1.3 }}>{p.label}
          <br /><span style={{ fontSize: 14.5, color: "var(--mut)" }}>{p.kind === "twin" ? (ownTag ? "本队调研 · 预演" : `${p.team_code || ""} 队调研`) : `教师注入 · ${t?.label || ""}`}</span>
        </span>
      </button>
    );
  };

  return (
    <LearnChrome wide emoji="⚔️" title={m.title} subtitle={`${m.scenario ? m.scenario + " · " : ""}第 ${m.round_no || 0}/${m.rounds} 轮`}>
      {/* 顶栏：战队、证据值、微企业、倒计时 */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ ...ARCADE, fontSize: 22 }}>{me.name}</span>
        <span className="bt-pop" style={{ ...MONO, fontSize: 28, color: C.cyan, display: "inline-block" }}>{myScore}</span>
        <span style={{ fontSize: 15, color: "var(--mut)" }}>证据值</span>
        {running && left && <span style={{ ...MONO, fontSize: 24, color: C.amber }}>{left}</span>}
        {!running && <Tag color="#475569">{m.status === "ended" ? "对战已结束" : "等待老师开始"}</Tag>}
        <div style={{ flex: 1, display: "flex", gap: 6, minWidth: 260 }}>
          <label htmlFor="vt" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>本队的 AI 原生微企业</label>
          <input id="vt" value={venture} onChange={(e) => setVenture(e.target.value)} placeholder="一句话说清你们经营的 AI 原生微企业：给谁、解决什么、怎么赚钱" style={field} />
          <Btn small ghost onClick={saveVenture}>保存</Btn>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <label htmlFor="bp" style={{ fontSize: 15, color: "var(--mut)", whiteSpace: "nowrap" }}>本队项目</label>
          <select id="bp" value={me.project_id || ""} onChange={(e) => bindProject(e.target.value)} style={{ ...field, width: 170 }}>
            <option value="" style={{ background: "#fff" }}>未绑定</option>
            {myProjects.map((p) => <option key={p.id} value={p.id} style={{ background: "#fff" }}>{p.name}</option>)}
          </select>
        </div>
      </div>

      <div className="bt-layout">
        {/* 左：选择对手 / 呼叫援军 */}
        <div style={{ ...box, padding: 12 }}>
          <div className="bt-roster">
            <div className="bt-rhead" style={{ ...ARCADE, fontSize: 15, color: C.orange }}>选择对手 · 压测假设</div>
            {groups.ch.map((p) => rosterBtn(p))}
            <div className="bt-rhead" style={{ ...ARCADE, fontSize: 15, color: C.green, marginTop: 8 }}>呼叫援军 · 帮你修正</div>
            {groups.sp.map((p) => rosterBtn(p))}
            {groups.own.length > 0 && <div className="bt-rhead" style={{ ...ARCADE, fontSize: 15, color: C.violet, marginTop: 8 }}>本队调研分身</div>}
            {groups.own.map((p) => rosterBtn(p, true))}
          </div>
          <Link href="/apply/twin" style={{ display: "block", fontSize: 14, color: "var(--cyan)", marginTop: 10 }}>去分身工坊创建角色</Link>
        </div>

        {/* 中：对战舞台 */}
        <Stage tint={support ? "#0E4A3C" : "#1B2B6B"} floorBottom={running ? 150 : 110} floorH={narrow ? 110 : 170} style={{ padding: narrow ? "10px 8px" : "14px 18px" }}>
          {!curP ? (
            <div style={{ fontSize: 14, color: "var(--mut)", lineHeight: 1.9, minHeight: 420 }}>
              <div style={{ ...ARCADE, fontSize: 24, color: "var(--ink)" }}>选一位对手，开始对战</div>
              <div style={{ marginTop: 10 }}>护盾降到底不算输：那是在提醒你，这条说法该回到现实里去验证了。</div>
              <div style={{ marginTop: 10 }}>计分规则：</div>
              {RULES_TEXT.map((r, i) => <div key={i}>· {r}</div>)}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* 能量条 */}
              <div style={{ display: "flex", alignItems: "flex-start", gap: narrow ? 6 : 12 }}>
                <Avatar src={seatAvatar(seat)} size={narrow ? 40 : 56} alt={`我 · ${SEATS[seat]}`} ring={C.cyan} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5 }}>
                  <div style={{ fontSize: narrow ? 12 : 14, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{!narrow && me.name + " "}<span style={{ color: C.mut, fontWeight: 400, fontSize: 15 }}>假设护盾</span></div>
                  <Bar w="100%" h={narrow ? 14 : 18} color={C.cyan} value={fight.shield} side="l" />
                </div>
                <div style={{ textAlign: "center", minWidth: narrow ? 64 : 96 }}>
                  <div style={{ ...ARCADE, fontSize: narrow ? 16 : 22, color: C.amber }}>ROUND {m.round_no || 1}</div>
                  <div style={{ fontSize: 15, color: C.mut }}>证据连击 ×{fight.combo}</div>
                </div>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 5, alignItems: "flex-end" }}>
                  <div style={{ fontSize: narrow ? 12 : 14, fontWeight: 900, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}><span style={{ color: C.mut, fontWeight: 400, fontSize: 15 }}>{support ? "待解决" : "质疑值"}</span>{!narrow && " " + curP.label}</div>
                  <Bar w="100%" h={narrow ? 14 : 18} color={oppColor} value={fight.doubt} side="r" />
                </div>
                <Avatar src={avatarOf(curP.role_type)} size={narrow ? 40 : 56} alt={curP.label} ring={oppColor} />
              </div>

              <div style={{ textAlign: "center", minHeight: narrow ? 28 : 46 }}>{banner && <Banner text={banner.text} color={banner.color} stroke={banner.stroke} size={narrow ? 24 : 40} />}</div>
              {/* 两人面对面：谁说话，对话出现在谁头顶 */}
              <div style={{ position: "relative", display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, minHeight: H + 190, maxWidth: 860, width: "100%", margin: "0 auto" }}>
                <Fighter src={seatAvatar(seat)} size={H} color={C.cyan} side="l" talking={sending} lunge={sending}
                  title={`我 · ${SEATS[seat]}`} sub={`学生战队 · ${me.name}`} colW={narrow ? 150 : 330} topH={narrow ? 110 : 120}
                  top={sending ? <Speech color={C.cyan} name={`我 · ${SEATS[seat]}`} fs={fs}>{pendingQ}</Speech>
                    : <div style={{ fontSize: 14.5, color: C.mut, marginBottom: 12, textAlign: "center" }}>{running ? "轮到你出招：按住说话或打字" : "等待老师开始本轮"}</div>} />
                <Fighter src={avatarOf(curP.role_type)} size={H} color={oppColor} side="r" second talking={!sending} lunge={!sending && !!last && !last.error}
                  title={curP.label} sub={`${support ? "协作方" : "对抗方"} · ${curP.kind === "twin" ? "学生调研分身" : "教师注入角色"}`} colW={narrow ? 200 : 350} topH={narrow ? 110 : 120}
                  top={sending ? <div style={{ fontSize: 14.5, color: C.mut, marginBottom: 12 }}>{curP.label} 正在听…</div>
                    : <Speech key={exs.length} color={last?.error ? "#B91C1C" : oppColor} name={curP.label} fs={fs}>{last ? last.reply : greet}</Speech>} />
              </div>

              {/* 现实检验卡 */}
              {!sending && last?.hint && (
                <div className="bt-cap" style={{ border: `2px dashed ${C.amber}`, borderRadius: 10, background: C.panel, padding: "10px 14px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ fontSize: 14.5, color: C.amber, fontWeight: 700 }}>虚拟交锋到此为止 · 去现实中验证</div>
                    <div style={{ fontSize: 15.5, marginTop: 2 }}>{last.hint}</div>
                  </div>
                  {added[hintKey]
                    ? <span style={{ fontSize: 14, fontWeight: 700, color: C.green }}>已加入假设看板</span>
                    : <button className="bt-pop" onClick={() => addHyp(last.hint, hintKey)} style={{ fontFamily: "inherit", fontSize: 15, fontWeight: 700, minHeight: 44, padding: "8px 18px", borderRadius: 10, border: "none", background: C.amber, color: "#2A1F00", cursor: "pointer" }}>加入待验证假设</button>}
                </div>
              )}

              {/* 出招 */}
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <MicButton onText={(t) => setInput((v) => v + t)} accent={C.cyan} size={48} title="按住说话" />
                <label htmlFor="mv" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>出招内容</label>
                <input id="mv" value={input} onChange={(e) => setInput(e.target.value)} disabled={!running || sending}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
                  placeholder={running ? "出招：说出数据、访谈原话或实测结果，才能命中" : "等待老师开始本轮"} style={{ ...field, minHeight: 48 }} />
                <Btn onClick={send} disabled={sending || !input.trim() || !running}>出招</Btn>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 14, color: C.mut }}>
                <button onClick={() => setLog(!log)} style={{ background: "none", border: "none", color: C.cyan, cursor: "pointer", fontFamily: "inherit", fontSize: 14, minHeight: 32 }}>{log ? "收起交锋记录" : `查看交锋记录（${exs.length}）`}</button>
                <span>计分只认证据：数据、访谈原话、实测</span>
              </div>
              {log && (
                <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 10, padding: 12, maxHeight: 240, overflowY: "auto", fontSize: 15, lineHeight: 1.7 }}>
                  <div><b style={{ color: oppColor }}>{curP.label}：</b>{greet}</div>
                  {exs.map((x, i) => (
                    <div key={i} style={{ marginTop: 6 }}>
                      <div><b style={{ color: C.cyan }}>我：</b>{x.q}{x.cited && <span style={{ color: C.green }}> （带证据 +{x.points}）</span>}</div>
                      <div><b style={{ color: oppColor }}>{curP.label}：</b>{x.reply}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Stage>

        {/* 右：假设看板 */}
        <div style={{ ...box, padding: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}><span style={{ ...ARCADE, fontSize: 18 }}>假设看板</span><span style={{ fontSize: 14, color: "var(--mut)" }}>从课堂带回现实</span></div>
          <div style={{ display: "flex", gap: 6 }}>
            <label htmlFor="hy" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>新假设</label>
            <input id="hy" value={hText} onChange={(e) => setHText(e.target.value)} placeholder="写一条可检验的假设" style={field} />
            <Btn small onClick={() => addHyp(hText)} disabled={hText.trim().length < 10}>加入</Btn>
          </div>
          <div style={{ maxHeight: 560, overflowY: "auto", marginTop: 8 }}>
            {hyps.length === 0 && <div style={{ fontSize: 14, color: "var(--mut)", marginTop: 8 }}>对战中暴露出的关键假设会出现在这里。</div>}
            {hyps.map((h) => (
              <div key={h.id} style={{ border: `1px solid ${h.status === "pending" ? "var(--line)" : HYP_COLOR[h.status] + "88"}`, padding: "8px 10px", marginTop: 8, background: "#F1F5F9", borderRadius: 10 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}><Tag color={HYP_COLOR[h.status]}>{HYP_LABEL[h.status]}</Tag><span style={{ fontSize: 14.5, color: "var(--mut)" }}>第{h.round_no}轮</span></div>
                <div style={{ fontSize: 15, marginTop: 4, lineHeight: 1.6, textDecoration: h.status === "falsified" ? "line-through" : undefined, color: h.status === "falsified" ? "var(--mut)" : undefined }}>{h.text}</div>
                {h.status === "falsified" && <div style={{ fontSize: 14.5, marginTop: 4, lineHeight: 1.6 }}><span style={{ color: "var(--mut)" }}>理由：{h.reason}</span><br />修正：{h.revision}</div>}
                {(h.status === "verifying" || h.status === "verified") && <div style={{ fontSize: 14, color: "var(--mut)", marginTop: 4 }}>证据：{h.evidence}</div>}
                {h.review_note && <div style={{ fontSize: 14, color: C.violet, marginTop: 4 }}>老师：{h.review_note}</div>}
                {h.status === "pending" && open?.id !== h.id && (
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <Btn small ghost color={C.orange} onClick={() => { setOpen({ id: h.id, mode: "falsify" }); setF1(""); setF2(""); }}>证伪并修正 +3</Btn>
                    <Btn small ghost color={C.green} onClick={() => { setOpen({ id: h.id, mode: "verify" }); setF1(""); setF2(""); }}>提交现实验证</Btn>
                  </div>
                )}
                {open?.id === h.id && (
                  <div style={{ marginTop: 6 }}>
                    <textarea aria-label={open.mode === "falsify" ? "证伪理由" : "验证过程"} rows={2} value={f1} onChange={(e) => setF1(e.target.value)} style={{ ...field, fontSize: 14 }}
                      placeholder={open.mode === "falsify" ? "为什么不成立？（依据什么）" : "现实中怎么验证的：问了谁/测了什么/结果如何"} />
                    <input aria-label={open.mode === "falsify" ? "修正后的假设" : "证据链接"} value={f2} onChange={(e) => setF2(e.target.value)} style={{ ...field, fontSize: 14, marginTop: 4 }}
                      placeholder={open.mode === "falsify" ? "改成什么？（新的假设或方案）" : "证据链接（可选：问卷、照片、记录）"} />
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}><Btn small onClick={act}>提交</Btn><Btn small ghost onClick={() => setOpen(null)}>取消</Btn></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      {toast && <div role="status" style={{ position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)", background: C.green, color: "#fff", padding: "10px 18px", borderRadius: 999, fontWeight: 800, zIndex: 50 }}>{toast}</div>}
    </LearnChrome>
  );
}

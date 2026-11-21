"use client";
// 本体拼图 · 分组对抗（课堂游戏主持页，可投屏）：抽情景卡 → 4 轮计时（找对象 / 连关系 / 定动作 / 交叉质询）→ 按规则加分。
// 情景卡为虚构教学情景（标注清楚），不是成果数据；计分板只存在本浏览器（课堂反馈，不入库、不进平台计分）。
import { useEffect, useState } from "react";
import Link from "next/link";
import LearnChrome from "../../learn/LearnChrome";
import { box, Tag } from "@/components/arena/ui";

const SCENES = [
  { key: "ti", icon: "🔩", title: "钛材加工厂 · 夜班质检", color: "#0369A1",
    brief: "一家 30 人的钛材加工厂，给医疗器械和航空配件厂供货。质检靠两位老师傅，夜班漏检导致退货。",
    quotes: ["“退一次货损失上万，客户还要扣分。”（厂长）", "“夜班就一个人看，眼睛累了就容易漏。”（质检员）", "“同一批料，不同机床的缺陷不一样。”（车间主任）", "“客户要每批的检验记录，现在都是手写。”（跟单员）"],
    questions: ["上个月哪台机床出的缺陷最多？", "某一批退货能追到是哪个班次、哪位质检员检的吗？", "哪些客户对检验记录有要求？"] },
  { key: "bronze", icon: "🏺", title: "青铜纹样 · 文创工作室", color: "#B45309",
    brief: "一个 5 人文创工作室，想把青铜器纹样做成可定制的文创产品，卖给游客和研学团。",
    quotes: ["“游客喜欢纹样，但看不懂它的意思。”（店员）", "“定制太慢，团队来了等不起。”（研学领队）", "“纹样授权要讲清来源，不能乱用。”（文博老师）", "“同一个纹样，做成书签卖得好，做成T恤卖不动。”（店长）"],
    questions: ["哪种纹样做成哪类产品卖得最好？", "某件定制品用的纹样出自哪件文物、有没有授权？", "研学团下单到交货平均要几天？"] },
  { key: "tour", icon: "🏞️", title: "周秦文化 · 景区研学线路", color: "#15803D",
    brief: "一个景区想为中小学设计半日研学线路，串起展厅、讲解员、互动任务与午餐。",
    quotes: ["“孩子们在展厅里只顾拍照，讲解听不进去。”（带队老师）", "“讲解员不够，一个人带三个班。”（景区运营）", "“家长想看到孩子学到了什么。”（家委会）", "“午餐和大巴最容易出乱子。”（旅行社）"],
    questions: ["某个班的线路上安排了哪位讲解员、哪些任务点？", "哪个任务点完成率最低？", "一次研学要协调哪几方、谁对什么负责？"] },
  { key: "campus", icon: "♻️", title: "校园二手 · 毕业季交易", color: "#BE185D",
    brief: "毕业季大量物品要转让，同学想做一个校园二手平台。",
    quotes: ["“东西太多，挨个拍照发帖太累。”（毕业生）", "“怕买到坏的，又找不到卖家。”（新生）", "“宿舍楼下堆满了没人要的东西。”（宿管）", "“自提时间总对不上。”（买家）"],
    questions: ["某位买家买过哪些东西、和哪些卖家交易过？", "哪类物品最难卖出去？", "一笔交易从发布到自提要经过哪些步骤？"] },
];

const ROUNDS = [
  { key: "r1", name: "① 找对象", min: 8, color: "#0E7490", task: "列出至少 5 个对象类型（如 客户、订单、机床），每个写 2 个属性。每个对象都要指着情景卡上的一句原话说明“为什么需要它”。" },
  { key: "r2", name: "② 连关系", min: 8, color: "#6D28D9", task: "画出至少 5 条关系，写清方向与基数（一对一 / 一对多 / 多对多），例如“机床 1—多 缺陷记录”。" },
  { key: "r3", name: "③ 定动作", min: 7, color: "#B45309", task: "写 3 个动作（如 判定缺陷、发起退货、确认授权），每个标明哪一步“AI 执行”、哪一步“人判断”。" },
  { key: "r4", name: "④ 交叉质询", min: 10, color: "#BE185D", task: "别组从问题卡抽一题：本组沿着图上的关系一步步找到答案。走不通，说明图上缺对象或缺关系。" },
];

const RUBRIC = [
  ["能指出原话依据的对象", "+2 / 个", "#0E7490"], ["方向与基数正确的关系", "+1 / 条", "#6D28D9"], ["人判断 / AI 执行分工清楚的动作", "+2 / 个", "#B45309"],
  ["质询时沿关系答对", "+3", "#15803D"], ["质询中发现对方缺口", "+2（给提问组）", "#BE185D"], ["没有依据、凭空想象的对象", "0", "#475569"],
];

type Team = { name: string; scene: string; score: number };
const LS = "ontology_game_v1";

export default function OntologyGame() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [round, setRound] = useState(0);
  const [left, setLeft] = useState(ROUNDS[0].min * 60);
  const [running, setRunning] = useState(false);
  const [n, setN] = useState(4);

  // 计分板只存本机浏览器（课堂反馈用），读写失败不影响使用
  useEffect(() => { try { const s = JSON.parse(localStorage.getItem(LS) || "null"); if (s?.teams) { setTeams(s.teams); setRound(s.round || 0); setLeft((ROUNDS[s.round || 0]?.min || 8) * 60); } } catch { /* 忽略 */ } }, []);
  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify({ teams, round })); } catch { /* 忽略 */ } }, [teams, round]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((x) => { if (x <= 1) { setRunning(false); return 0; } return x - 1; }), 1000);
    return () => clearInterval(t);
  }, [running]);

  function deal() {
    const order = [...SCENES].sort(() => Math.random() - 0.5);
    setTeams(Array.from({ length: n }, (_, i) => ({ name: `第 ${i + 1} 组`, scene: order[i % order.length].key, score: 0 })));
    setRound(0); setLeft(ROUNDS[0].min * 60); setRunning(false);
  }
  function goRound(i: number) { setRound(i); setLeft(ROUNDS[i].min * 60); setRunning(false); }
  const add = (i: number, d: number) => setTeams((ts) => ts.map((t, k) => (k === i ? { ...t, score: Math.max(0, t.score + d) } : t)));
  const r = ROUNDS[round];
  const sceneOf = (k: string) => SCENES.find((s) => s.key === k) || SCENES[0];
  const used = [...new Set(teams.map((t) => t.scene))].map(sceneOf);

  return (
    <LearnChrome emoji="🧩" title="本体拼图 · 分组对抗" subtitle="35 分钟课堂游戏：用区域产业情景画本体，按证据计分" wide>
      <div style={{ ...box, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <span style={{ fontSize: 14.5 }}>分组数</span>
        <select value={n} onChange={(e) => setN(Number(e.target.value))} style={{ padding: "6px 10px", borderRadius: 10, background: "#F1F5F9", color: "var(--ink)", border: "1px solid var(--line)", fontFamily: "inherit" }}>
          {[2, 3, 4, 5, 6, 8].map((x) => <option key={x} value={x} style={{ background: "#fff" }}>{x} 组</option>)}
        </select>
        <button onClick={deal} style={btn("#0E7490")}>🎲 抽情景卡并开局</button>
        <Link href="/learn/ontology" style={{ fontSize: 14.5, color: "var(--cyan)" }}>学生工具：本体实验室（设计器）→</Link>
        <span style={{ marginLeft: "auto", fontSize: 15, color: "var(--mut)" }}>情景卡为虚构教学情景；计分板只存在这台电脑，不进入平台计分</span>
      </div>

      {/* 轮次与计时 */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "stretch", marginBottom: 12 }}>
        {ROUNDS.map((x, i) => (
          <button key={x.key} onClick={() => goRound(i)} style={{ flex: "1 1 180px", textAlign: "left", cursor: "pointer", fontFamily: "inherit", borderRadius: 14, padding: 12, color: "var(--ink)",
            background: i === round ? `${x.color}33` : "#F1F5F9", border: `${i === round ? 2 : 1}px solid ${x.color}${i === round ? "" : "66"}` }}>
            <div style={{ fontWeight: 900, color: x.color }}>{x.name} · {x.min} 分钟</div>
            <div style={{ fontSize: 14, lineHeight: 1.6, marginTop: 4 }}>{x.task}</div>
          </button>
        ))}
      </div>
      <div style={{ ...box, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", borderColor: r.color, marginBottom: 12 }}>
        <span style={{ fontSize: 15, fontWeight: 900, color: r.color }}>{r.name}</span>
        <span style={{ fontFamily: "monospace", fontSize: 44, fontWeight: 900, color: left <= 60 ? "#B91C1C" : "var(--ink)" }}>{String(Math.floor(left / 60)).padStart(2, "0")}:{String(left % 60).padStart(2, "0")}</span>
        <button onClick={() => setRunning((v) => !v)} style={btn(running ? "#B91C1C" : "#15803D")}>{running ? "暂停" : "开始计时"}</button>
        <button onClick={() => { setLeft(r.min * 60); setRunning(false); }} style={btn("#475569")}>重置</button>
        {round < ROUNDS.length - 1 && <button onClick={() => goRound(round + 1)} style={btn(ROUNDS[round + 1].color)}>下一轮 →</button>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 12 }}>
        {/* 计分板 */}
        <div style={box}>
          <b style={{ fontSize: 15 }}>计分板</b>
          {teams.length === 0 && <div style={{ fontSize: 14.5, color: "var(--mut)", marginTop: 8 }}>先选分组数，点“抽情景卡并开局”。</div>}
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {[...teams.map((t, i) => ({ ...t, i }))].sort((a, b) => b.score - a.score).map((t, rank) => {
              const sc = sceneOf(t.scene);
              return (
                <div key={t.i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 12, background: `${sc.color}14`, border: `1px solid ${sc.color}55` }}>
                  <b style={{ width: 22, color: rank === 0 && t.score > 0 ? "#B45309" : "var(--mut)" }}>{rank + 1}</b>
                  <span style={{ flex: 1 }}><b>{t.name}</b> <span style={{ fontSize: 15, color: sc.color }}>{sc.icon} {sc.title}</span></span>
                  <b style={{ fontSize: 22, width: 44, textAlign: "right" }}>{t.score}</b>
                  {[1, 2, 3].map((d) => <button key={d} onClick={() => add(t.i, d)} style={mini}>+{d}</button>)}
                  <button onClick={() => add(t.i, -1)} style={mini}>−1</button>
                </div>
              );
            })}
          </div>
        </div>
        {/* 计分规则 */}
        <div style={box}>
          <b style={{ fontSize: 15 }}>计分规则（只认依据）</b>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {RUBRIC.map(([t, p, c]) => <div key={t} style={{ display: "flex", gap: 8, fontSize: 15 }}><span style={{ color: c }}>■</span><span style={{ flex: 1 }}>{t}</span><b style={{ color: c }}>{p}</b></div>)}
          </div>
          <div style={{ fontSize: 14, color: "var(--mut)", marginTop: 10, lineHeight: 1.7 }}>收尾 3 分钟：每组说一句“我们的图上，哪一步必须由人来判断？为什么？”——这就是“人判断 / AI 执行”。</div>
        </div>
      </div>

      {/* 情景卡 */}
      <h3 style={{ fontSize: 16, fontWeight: 800, margin: "16px 0 8px" }}>本局情景卡{used.length === 0 ? "（开局后显示）" : ""}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 12 }}>
        {(used.length ? used : SCENES).map((s) => (
          <div key={s.key} style={{ ...box, borderColor: s.color + "88", opacity: used.length ? 1 : 0.55 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: s.color }}>{s.icon} {s.title} <Tag color="#475569">虚构教学情景</Tag></div>
            <div style={{ fontSize: 14.5, lineHeight: 1.7, margin: "6px 0" }}>{s.brief}</div>
            <div style={{ fontSize: 14, color: "var(--mut)" }}>原话卡（找对象时引用）：</div>
            {s.quotes.map((q) => <div key={q} style={{ fontSize: 14.5, lineHeight: 1.7 }}>💬 {q}</div>)}
            {round === 3 && <>
              <div style={{ fontSize: 14, color: "var(--mut)", marginTop: 6 }}>问题卡（交叉质询）：</div>
              {s.questions.map((q) => <div key={q} style={{ fontSize: 14.5, lineHeight: 1.7 }}>❓ {q}</div>)}
            </>}
          </div>
        ))}
      </div>
    </LearnChrome>
  );
}

const btn = (c: string): React.CSSProperties => ({ padding: "8px 16px", borderRadius: 10, border: "none", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit", background: c, color: "#fff" });
const mini: React.CSSProperties = { padding: "3px 8px", borderRadius: 8, border: "1px solid var(--line)", background: "#F1F5F9", color: "var(--ink)", cursor: "pointer", fontFamily: "inherit", fontSize: 15 };

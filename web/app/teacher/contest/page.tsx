"use client";
// 参赛材料 · 人工智能+ 赛道：三项材料关系 → AI 赋能教学闭环 → 教学设计（8 次课）→ 课堂实录时间轴 → 成果报告数据证据 → 现场汇报结构。
// 平台只提供结构与真实统计，文字由教师撰写；页面与导出内容不出现学校名与师生姓名（参赛双盲要求）。
import { useEffect, useState } from "react";
import Link from "next/link";
import LearnChrome from "../../learn/LearnChrome";
import { box, Tag, api } from "@/components/arena/ui";
import { UNITS, LESSON_MARKS } from "@/lib/course";

type Lesson = { id: string; class: string; unit_no: number; started_at: string; ended_at: string | null; marks: { key: string; label: string; at: string }[] };
type Data = {
  scope: string; at: string; lessons: Lesson[]; stepReach: number[]; abilities: { key: string; label: string; avg: number }[];
  stats: Record<string, number | null>;
};
const mmss = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

const MATERIALS = [
  { t: "创新成果报告", w: "20%", role: "基础", d: "真问题（用数据刻画三个痛点）→ AI 如何重构内容、方法、环境、评价 → 用证据说话 → 可推广模式。约 4000 字，查重不高于 20%。", c: "#22d3ee" },
  { t: "课堂实录 + 展示视频", w: "40%", role: "关键证据", d: "1 个 1 学时完整实录 + 1 个 15 分钟展示视频；原生态课堂、有真实师生互动；进度条环节与教案一一对应。", c: "#fbbf24" },
  { t: "教学设计创新汇报", w: "40%", role: "升华展示", d: "12 分钟汇报 + 8 分钟答辩；讲改革逻辑与育人成效，不复述教材。", c: "#f472b6" },
];
const LOOP = [
  { t: "课前 · AI 学情诊断", c: "#22d3ee", items: ["选题匹配智能体多轮追问，给出方向建议", "知识星球 AI 老师讲解、答疑", "项目本体记录每个学生的起点"] },
  { t: "课中 · 人机协同", c: "#a78bfa", items: ["上传访谈资料，AI 自动抽取证据草稿，学生核对认证", "虚实对局：数字分身 / 评委 / 投资人角色追问证据", "创业星舰智能体集群协同起草，学生判断取舍"] },
  { t: "课后 · 智能评价推送", c: "#34d399", items: ["8 步进度由已认证记录自动判定", "五力画像只数真实记录，不由 AI 打分", "AI 预审现实验证、起草干预卡，教师确认后推送"] },
];
const PITCH = [
  ["课程定位与基础", "0.5"], ["诊断教学痛点（2–3 个，用数据）", "1.0"], ["教学理念与三维目标", "0.5"], ["核心创新举措（每项配操作案例）", "4.5"],
  ["课程思政融合设计", "1.0"], ["创新成效与证据（学生 / 课程 / 教师）", "3.5"], ["反思与推广展望", "1.0"],
];
const VIDEO15 = [["课程背景痛点与教学目标", 2], ["AI 赋能完整教学闭环设计", 3], ["锚定实录片段解读", 4], ["教学创新 + AI 伦理合规", 3], ["实施成效、数据佐证、反思改进", 3]];

export default function ContestPage() {
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");
  useEffect(() => { api<Data>("/api/teacher/contest").then(setD).catch((e) => setErr((e as Error).message)); }, []);
  const s = d?.stats || {};
  const v = (k: string, suffix = "") => (s[k] === null || s[k] === undefined ? "暂无数据" : `${s[k]}${suffix}`);

  function chapterText(l: Lesson): string {
    const t0 = new Date(l.started_at).getTime();
    const end = l.ended_at ? new Date(l.ended_at).getTime() : Date.now();
    return l.marks.map((m, i) => {
      const a = new Date(m.at).getTime() - t0, b = (l.marks[i + 1] ? new Date(l.marks[i + 1].at).getTime() : end) - t0;
      return `${mmss(a)}–${mmss(b)} ${m.label}`;
    }).join("\n");
  }
  async function copy(id: string, text: string) { try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(""), 1500); } catch { /* 忽略 */ } }

  return (
    <LearnChrome emoji="🏆" title="参赛材料 · 人工智能+ 赛道" subtitle="成果报告是基础 · 课堂实录是关键证据 · 现场汇报是升华" wide>
      {err && <div style={{ ...box, color: "#f87171" }}>{err}</div>}
      <div style={{ ...box, marginBottom: 12, fontSize: 12.5, color: "#fbbf24" }}>⚠ 双盲：报告、视频与汇报中不得出现教师姓名与学校信息。本页只给结构与真实统计，结论文字请您自己写；数字截至 {d ? new Date(d.at).toLocaleString("zh-CN", { hour12: false }) : "…"}，统计范围：{d?.scope || "…"}。</div>

      <h3 style={h3}>① 三项材料的关系</h3>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "stretch" }}>
        {MATERIALS.map((m, i) => (
          <div key={m.t} style={{ display: "flex", gap: 6, alignItems: "center", flex: "1 1 280px" }}>
            <div style={{ flex: 1, alignSelf: "stretch", borderRadius: 14, padding: 14, background: `${m.c}1c`, border: `1px solid ${m.c}77` }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}><b style={{ color: m.c, fontSize: 15 }}>{m.t}</b><Tag color={m.c}>{m.w} · {m.role}</Tag></div>
              <div style={{ fontSize: 13, lineHeight: 1.7, marginTop: 6 }}>{m.d}</div>
            </div>
            {i < 2 && <span style={{ color: MATERIALS[i + 1].c, fontSize: 18, fontWeight: 900 }}>➜</span>}
          </div>
        ))}
      </div>

      <h3 style={h3}>② AI 赋能教学闭环（展示视频与报告的主线）</h3>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "stretch" }}>
        {LOOP.map((x, i) => (
          <div key={x.t} style={{ display: "flex", gap: 6, alignItems: "center", flex: "1 1 280px" }}>
            <div style={{ flex: 1, alignSelf: "stretch", borderRadius: 14, padding: 14, background: `${x.c}1c`, border: `1px solid ${x.c}77` }}>
              <b style={{ color: x.c }}>{x.t}</b>
              <ul style={{ margin: "6px 0 0 18px", fontSize: 13, lineHeight: 1.75 }}>{x.items.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
            {i < 2 && <span style={{ color: LOOP[i + 1].c, fontSize: 18, fontWeight: 900 }}>➜</span>}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12.5, color: "var(--mut)", marginTop: 6 }}>赛道硬要求：依托生成式 AI 建设并运用教学智能体，至少 2 类 AI 应用场景；同时写明 AI 伦理、数据安全、学术诚信安排。忌把汇报讲成工具演示。</div>

      <h3 style={h3}>③ 教学设计 · 8 次课贯穿一个项目</h3>
      <div style={{ ...box, overflowX: "auto", padding: 0 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, minWidth: 900 }}>
          <thead><tr>{["次", "单元", "课前（AI 学情诊断）", "课中（人机协同）", "课后（智能评价）", "五力", "区域产业", "课程思政", "达成项目数"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
          <tbody>
            {UNITS.map((u) => (
              <tr key={u.no}>
                <td style={{ ...td, color: u.color, fontWeight: 900 }}>{u.no}</td>
                <td style={{ ...td, fontWeight: 700 }}>{u.title}</td>
                <td style={td}>{u.pre.task}<div style={sub}>{u.pre.ai}</div></td>
                <td style={td}>{u.inClass.task}<div style={sub}>{u.inClass.ai}</div></td>
                <td style={td}>{u.post.task}<div style={sub}>{u.post.ai}</div></td>
                <td style={td}>{u.ability}</td>
                <td style={td}>{u.region}</td>
                <td style={td}>{u.values}</td>
                <td style={{ ...td, textAlign: "center" }}>{d ? `${d.stepReach[u.no - 1]} / ${s.projects ?? 0}` : "…"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={h3}>④ 课堂实录 · 进度条时间轴</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,360px),1fr))", gap: 10 }}>
        <div style={box}>
          <b style={{ fontSize: 13.5 }}>15 分钟展示视频时间分配</b>
          <div style={{ display: "flex", height: 26, borderRadius: 8, overflow: "hidden", margin: "8px 0" }}>
            {VIDEO15.map(([t, m], i) => <div key={t as string} title={`${t} ${m} 分钟`} style={{ flex: m as number, background: ["#22d3ee", "#a78bfa", "#fbbf24", "#f472b6", "#34d399"][i], color: "#05060f", fontSize: 11, fontWeight: 800, display: "grid", placeItems: "center" }}>{m}′</div>)}
          </div>
          {VIDEO15.map(([t, m], i) => <div key={t as string} style={{ fontSize: 12.5, lineHeight: 1.8 }}><span style={{ color: ["#22d3ee", "#a78bfa", "#fbbf24", "#f472b6", "#34d399"][i] }}>■</span> {t}（{m} 分钟）</div>)}
          <div style={sub}>实录要求：2 个机位以内、教师全程出镜、有学生镜头、全程匿名；时长 40–50 分钟。</div>
        </div>
        <div style={box}>
          <b style={{ fontSize: 13.5 }}>授课打点记录</b>
          <span style={{ fontSize: 12, color: "var(--mut)", marginLeft: 8 }}>在 <Link href="/teacher/live" style={{ color: "var(--cyan)" }}>授课工作台</Link> 上课时按环节打点，这里自动生成视频进度条文字</span>
          {d?.lessons.length === 0 && <div style={{ fontSize: 12.5, color: "var(--mut)", marginTop: 8 }}>还没有授课记录。</div>}
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {d?.lessons.map((l) => (
              <div key={l.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 6 }}>
                <div style={{ fontSize: 12.5, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <b>第 {l.unit_no} 次课</b><span style={{ color: "var(--mut)" }}>{l.class || "未指定班级"} · {new Date(l.started_at).toLocaleString("zh-CN", { hour12: false })}</span>
                  {!l.ended_at && <Tag color="#fbbf24">上课中</Tag>}
                  <button onClick={() => copy(l.id, chapterText(l))} style={{ marginLeft: "auto", fontSize: 12, background: "none", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)", cursor: "pointer", padding: "2px 8px", fontFamily: "inherit" }}>{copied === l.id ? "已复制" : "复制进度条文字"}</button>
                </div>
                <div style={{ display: "flex", height: 14, borderRadius: 4, overflow: "hidden", marginTop: 4 }}>
                  {l.marks.map((m, i) => {
                    const end = l.ended_at ? new Date(l.ended_at).getTime() : Date.now();
                    const w = (l.marks[i + 1] ? new Date(l.marks[i + 1].at).getTime() : end) - new Date(m.at).getTime();
                    return <div key={i} title={m.label} style={{ flex: Math.max(1, w), background: LESSON_MARKS.find((x) => x.key === m.key)?.color || "#64748b", minWidth: 2 }} />;
                  })}
                </div>
                <pre style={{ fontSize: 11.5, color: "var(--mut)", margin: "4px 0 0", whiteSpace: "pre-wrap", fontFamily: "monospace" }}>{chapterText(l)}</pre>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h3 style={h3}>⑤ 创新成果报告 · 可引用的数据证据</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8 }}>
        {[
          ["参与学生", v("students", " 人"), "#22d3ee"], ["学生项目", v("projects", " 个"), "#60a5fa"], ["已认证证据", v("evidence", " 条"), "#a78bfa"],
          ["带用户原话的证据", v("quotes", " 条"), "#f472b6"], ["挂证据的决策", v("decisions", " 条"), "#fb923c"], ["发布 V0.2 的项目", v("versions2", " 个"), "#fbbf24"],
          ["证伪并修正的假设", v("falsified", " 条"), "#f87171"], ["教师确认的现实验证", v("verified", " 条"), "#34d399"], ["AI 使用次数", v("aiUses", " 次"), "#a78bfa"],
        ].map(([l, val, c]) => (
          <div key={l} style={{ ...box, padding: 12, borderColor: c + "55" }}><div style={{ fontSize: 12, color: "var(--mut)" }}>{l}</div><div style={{ fontSize: 20, fontWeight: 900, color: c }}>{val}</div></div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 10, marginTop: 10 }}>
        <div style={box}>
          <b style={{ fontSize: 13.5 }}>四方面效果的数据口径</b>
          <div style={{ fontSize: 12.5, lineHeight: 1.9, marginTop: 6 }}>
            <div>🎯 <b>专业能力</b>：8 步达成项目数（上表最后一列）、V0.2 发布 {v("versions2")} 个</div>
            <div>💡 <b>创新思维</b>：五力均值 {d?.abilities.map((a) => `${a.label} ${a.avg}`).join(" · ") || "暂无数据"}</div>
            <div>🖥 <b>数字素养</b>：AI 使用 {v("aiUses")} 次；本体动作中 AI 执行 {v("aiActions")} 次、人执行 {v("humanActions")} 次</div>
            <div>⚖️ <b>伦理认知</b>：学生核对认证 {v("certifies")} 次、驳回 AI 草稿 {v("rejects")} 次（AI 的原话查不到就不能当证据）</div>
            <div>📈 <b>证据意识前后测</b>：对局第 {v("roundFirst")} 轮引用证据率 {v("citeFirst", "%")} → 第 {v("roundLast")} 轮 {v("citeLast", "%")}</div>
            <div>📮 <b>精准干预</b>：干预卡 {v("cardsSent")} 张，已回应 {v("cardsAnswered")} 张（{v("cardRate", "%")}）</div>
          </div>
        </div>
        <div style={box}>
          <b style={{ fontSize: 13.5 }}>报告撰写要点（人工智能创新成果报告）</b>
          <ol style={{ margin: "6px 0 0 18px", fontSize: 12.5, lineHeight: 1.85 }}>
            <li>立足目标、聚焦真问题：用数据刻画三个真实痛点，紧扣“以学生为中心”“人机协作”</li>
            <li>呈现系统性赋能：AI 如何重构内容、方法、环境、评价；或把一个环节（如“虚实对局”“智能体答疑 + 学情画像”）写到操作层</li>
            <li>用证据说话：改革前后对比、问卷访谈、第三方佐证；写明数据治理（脱敏、模型使用边界）、学术诚信（AI 使用申报）</li>
            <li>提炼可推广模式：可复制的“人工智能+”教学模式与推广条件</li>
          </ol>
          <div style={sub}>平台已有的治理做法可直接写入：AI 内容只作草稿须由人认证；计分只认证据；大屏只显示席位与虚拟头像；数据在本校服务器、不出境、不接第三方云。</div>
        </div>
      </div>

      <h3 style={h3}>⑥ 现场汇报 · 七段式（12 分钟）</h3>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {PITCH.map(([t, sc], i) => (
          <div key={t} style={{ flex: "1 1 150px", borderRadius: 12, padding: 10, background: `hsla(${190 + i * 28},80%,60%,.14)`, border: `1px solid hsla(${190 + i * 28},80%,60%,.5)` }}>
            <div style={{ fontSize: 11.5, color: "var(--mut)" }}>第 {i + 1} 段 · {sc} 分</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{t}</div>
          </div>
        ))}
      </div>
    </LearnChrome>
  );
}

const h3: React.CSSProperties = { fontSize: 16, fontWeight: 800, margin: "18px 0 8px" };
const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 12, color: "var(--mut)", borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,.05)", verticalAlign: "top", lineHeight: 1.6 };
const sub: React.CSSProperties = { fontSize: 11.5, color: "var(--mut)", marginTop: 4 };

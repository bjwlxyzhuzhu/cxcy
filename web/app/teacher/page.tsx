"use client";
// 教师工作台：课堂控场、引导师面板（各项目 8 步进度、五力、卡点与干预卡）、待确认的现实验证（自动预审）、课堂口径、管理后台。
// 只显示项目名、对局队名与人数，不显示学生姓名。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import LearnChrome from "../learn/LearnChrome";
import { box, field, lab, Btn, Tag, api } from "@/components/arena/ui";
import { STEP_GUIDE, STEP_STATUS_LABEL, type StepStatus } from "@/lib/ontology/pipeline";
import type { CardDraft, PreReview } from "@/lib/ontology/guide";

type Ability = { key: string; label: string; score: number; count: number };
type Item = {
  id: string; name: string; members: number; teams: string; steps: StepStatus[]; current: number; done: number;
  blockers: { key: string; text: string; n: number }[]; abilities: Ability[]; drafts: CardDraft[]; updated_at: string;
};
type Verifying = { id: string; text: string; evidence: string; evidence_url: string; team: string; prereview: PreReview };
const COLOR: Record<StepStatus, string> = { done: "#34d399", doing: "#a78bfa", todo: "#334155", soon: "#1e293b" };

const CARDS = [
  { icon: "🏫", title: "授课工作台", sub: "上课投屏 · 席位 · 课堂打点", href: "/teacher/live" },
  { icon: "⚔️", title: "虚实对局", sub: "开局 · 大屏 · 确认 +5", href: "/arena/screen" },
  { icon: "🧩", title: "本体拼图", sub: "分组游戏 · 计时 · 计分投屏", href: "/teacher/ontology-game" },
  { icon: "🏆", title: "参赛材料", sub: "AI+ 赛道 · 设计 · 实录 · 报告数据", href: "/teacher/contest" },
  { icon: "📖", title: "课堂口径", sub: "全班统一定义", href: "/apply/ontology?tab=glossary" },
  { icon: "👥", title: "名单与后台", sub: "导入名单 · 用量 · 导出", href: "/admin" },
];

export default function TeacherPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [verifying, setVerifying] = useState<Verifying[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [cardFor, setCardFor] = useState("");
  const [card, setCard] = useState<CardDraft | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [classes, setClasses] = useState<string[]>([]);
  const [klass, setKlass] = useState("");
  const [own, setOwn] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: Item[]; verifyingItems: Verifying[]; classes: string[]; scopedToOwn: boolean }>(`/api/teacher/overview${klass ? `?class=${encodeURIComponent(klass)}` : ""}`);
      setItems(r.items); setVerifying(r.verifyingItems || []); setClasses(r.classes || []); setOwn(!!r.scopedToOwn);
    } catch (e) { setErr((e as Error).message); }
  }, [klass]);
  useEffect(() => { load(); }, [load]);

  async function review(id: string, ok: boolean) {
    setBusy(true); setMsg("");
    try { await api("/api/arena/hypothesis", { body: { action: "review", id, ok, note: notes[id] || "" } }); setMsg(ok ? "✓ 已确认 +5" : "✓ 已退回"); await load(); }
    catch (e) { setMsg("✗ " + (e as Error).message); } finally { setBusy(false); }
  }
  async function sendCard(projectId: string) {
    if (!card) return;
    setBusy(true); setMsg("");
    try {
      const r = await api<{ sent: number; skipped: number }>("/api/ontology/action", { body: { action: "intervention.send", project_id: projectId, ...card } });
      setMsg(`✓ 已发给 ${r.sent} 名成员${r.skipped ? `（${r.skipped} 人 7 天内已收到同类卡，未重复发送）` : ""}`);
      setCardFor(""); setCard(null);
    } catch (e) { setMsg("✗ " + (e as Error).message); } finally { setBusy(false); }
  }

  return (
    <LearnChrome emoji="🧑‍🏫" title="教师工作台" subtitle="从“教创业的专家”到“学生创业学习的智能引导师”" wide>
      {err && <div style={{ ...box, color: "#f87171" }}>{err}</div>}
      {!err && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 10, marginBottom: 14 }}>
            {CARDS.map((c) => (
              <Link key={c.title} href={c.href} style={{ ...box, textDecoration: "none", color: "var(--ink)", display: "block" }}>
                <div style={{ fontSize: 22 }}>{c.icon}</div>
                <b style={{ fontSize: 15 }}>{c.title}</b>
                <div style={{ fontSize: 12.5, color: "var(--mut)" }}>{c.sub}</div>
              </Link>
            ))}
          </div>
          {msg && <div style={{ fontSize: 13, marginBottom: 10, color: msg.startsWith("✗") ? "#f87171" : "#34d399" }}>{msg}</div>}

          <div style={{ ...box, marginBottom: 14, borderColor: "#fbbf2466" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>待确认的现实验证（{verifying.length}）</h3>
              <span style={{ fontSize: 12, color: "var(--mut)" }}>自动预审只检查要素是否写全，真实性由您判断；确认后计 +5</span>
            </div>
            {verifying.length === 0 && <div style={{ fontSize: 13, color: "var(--mut)" }}>暂无。学生提交现实验证后出现在这里。</div>}
            <div style={{ display: "grid", gap: 10 }}>
              {verifying.map((h) => (
                <div key={h.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                  <div style={{ fontSize: 13.5 }}><Tag color="#a78bfa">{h.team || "未知队伍"}</Tag> <b>{h.text}</b></div>
                  <div style={{ fontSize: 13, color: "var(--mut)", margin: "4px 0" }}>证据：{h.evidence}{h.evidence_url ? ` · ${h.evidence_url}` : ""}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 12 }}>
                    <span style={{ color: "var(--mut)" }}>自动预审：</span>
                    {h.prereview.items.map((i) => <Tag key={i.key} color={i.hit ? "#34d399" : "#f87171"}>{i.hit ? "✓" : "✗"} {i.label}</Tag>)}
                    <span style={{ color: h.prereview.ok ? "#34d399" : "#fbbf24" }}>{h.prereview.note}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <input value={notes[h.id] || ""} onChange={(e) => setNotes({ ...notes, [h.id]: e.target.value })} placeholder="点评（可选，学生可见）" style={{ ...field, maxWidth: 320 }} />
                    <Btn small color="#34d399" disabled={busy} onClick={() => review(h.id, true)}>确认 +5</Btn>
                    <Btn small ghost color="#f87171" disabled={busy} onClick={() => review(h.id, false)}>证据不足，退回</Btn>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div id="panel" style={box}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800 }}>引导师面板 · 各项目进度</h3>
              {(["done", "doing", "todo"] as StepStatus[]).map((k) => <Tag key={k} color={k === "todo" ? "#94a3b8" : COLOR[k]}>{STEP_STATUS_LABEL[k]}</Tag>)}
              <span style={{ fontSize: 12, color: "var(--mut)" }}>进度与五力都由已认证的记录自动统计，不由 AI 打分</span>
              <select value={klass} onChange={(e) => setKlass(e.target.value)} style={{ ...field, width: "auto", marginLeft: "auto" }}>
                <option value="" style={{ background: "#0a0e22" }}>{own ? "我的全部班级" : "全部班级"}</option>
                {classes.map((c) => <option key={c} value={c} style={{ background: "#0a0e22" }}>{c}</option>)}
              </select>
            </div>
            {items === null && <div style={{ fontSize: 13, color: "var(--mut)" }}>加载中…</div>}
            {items?.length === 0 && <div style={{ fontSize: 13, color: "var(--mut)" }}>还没有学生项目。学生在“项目工作台”新建项目后会出现在这里。</div>}
            <div style={{ display: "grid", gap: 10 }}>
              {items?.map((it) => (
                <div key={it.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))", gap: 12, alignItems: "center", fontSize: 13 }}>
                    <span><b>{it.name}</b><span style={{ color: "var(--mut)", fontSize: 12 }}>{it.teams ? ` · ${it.teams}` : ""} · {it.members} 人</span></span>
                    <span style={{ display: "flex", gap: 3 }} title={`当前第 ${it.current} 步`}>
                      {it.steps.map((st, i) => (
                        <span key={i} title={`${STEP_GUIDE[i].label}：${STEP_STATUS_LABEL[st]}`}
                          style={{ width: 20, height: 14, borderRadius: 3, background: COLOR[st], border: i + 1 === it.current ? "2px solid #22d3ee" : "1px solid var(--line)" }} />
                      ))}
                    </span>
                    <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }} title="五力：统计的是已认证的记录条数">
                      {it.abilities.map((a) => (
                        <span key={a.key} style={{ fontSize: 11.5, color: "var(--mut)" }}>{a.label.slice(0, 2)}<b style={{ color: a.count ? "#7dd3fc" : "var(--mut)", marginLeft: 2 }}>{a.count}</b></span>
                      ))}
                    </span>
                    <span style={{ color: it.blockers.length ? "#fbbf24" : "var(--mut)", fontSize: 12.5 }}>
                      {it.blockers.length ? it.blockers.map((b) => `${b.n} ${b.text}`).join("；") : it.done === 8 ? "已完成 8 步" : "暂无卡点"}
                      {" "}<Link href={`/apply/ontology?project=${it.id}`} style={{ color: "var(--cyan)" }}>看本体</Link>
                      {it.drafts.length > 0 && <>{" · "}<button onClick={() => { setCardFor(cardFor === it.id ? "" : it.id); setCard(it.drafts[0]); }}
                        style={{ background: "none", border: "none", color: "#a78bfa", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, padding: 0 }}>起草干预卡</button></>}
                    </span>
                  </div>
                  {cardFor === it.id && card && (
                    <div style={{ marginTop: 8, padding: 12, borderRadius: 12, background: "rgba(167,139,250,.08)", display: "grid", gap: 8 }}>
                      {it.drafts.length > 1 && (
                        <div><span style={lab}>按哪个卡点起草</span>
                          <select onChange={(e) => setCard(it.drafts[Number(e.target.value)])} style={field}>
                            {it.drafts.map((d, i) => <option key={d.rule} value={i} style={{ background: "#0a0e22" }}>{d.sharp}</option>)}
                          </select>
                        </div>
                      )}
                      <div><span style={lab}>① 一针见血（对事不对人）</span><input value={card.sharp} onChange={(e) => setCard({ ...card, sharp: e.target.value })} style={field} /></div>
                      <div><span style={lab}>② 证据（来自数据库记录）</span><input value={card.evidence} onChange={(e) => setCard({ ...card, evidence: e.target.value })} style={field} /></div>
                      <div><span style={lab}>③ 怎么改</span><textarea rows={2} value={card.advice} onChange={(e) => setCard({ ...card, advice: e.target.value })} style={{ ...field, resize: "vertical" }} /></div>
                      <div style={{ fontSize: 12, color: "var(--mut)" }}>④ 去哪练：<Link href={card.link_href} style={{ color: "var(--cyan)" }}>{card.link_label}</Link> · 发给该项目全部 {it.members} 名成员，学生在成长星图里回应</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn small color="#a78bfa" disabled={busy} onClick={() => sendCard(it.id)}>发送</Btn>
                        <Btn small ghost color="#94a3b8" onClick={() => { setCardFor(""); setCard(null); }}>取消</Btn>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </LearnChrome>
  );
}

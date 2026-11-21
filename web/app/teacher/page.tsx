"use client";
// 教师工作台：课堂控场、引导师面板（各项目 8 步进度、五力、卡点与干预卡）、待确认的现实验证（自动预审）、课堂口径、管理后台。
// 只显示项目名、对局队名与人数，不显示学生姓名。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { Section, Stat, StatRow, Insight, Bars, Empty, btn, C } from "@/components/ui/kit";
import { field, lab, Btn, Tag, api } from "@/components/arena/ui";
import { STEP_GUIDE, STEP_STATUS_LABEL, type StepStatus } from "@/lib/ontology/pipeline";
import type { CardDraft, PreReview } from "@/lib/ontology/guide";

type Ability = { key: string; label: string; score: number; count: number };
type Item = {
  id: string; name: string; members: number; teams: string; steps: StepStatus[]; current: number; done: number;
  blockers: { key: string; text: string; n: number }[]; abilities: Ability[]; drafts: CardDraft[]; updated_at: string;
};
type Verifying = { id: string; text: string; evidence: string; evidence_url: string; team: string; prereview: PreReview };
const COLOR: Record<StepStatus, string> = { done: "#15803D", doing: "#1E3A8A", todo: "#E2E8F0", soon: "#E2E8F0" };

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

  // —— 班级总览的统计（全部来自数据库记录）——
  const list = items || [];
  const students = list.reduce((n, it) => n + it.members, 0);
  const avgDone = list.length ? Math.round((list.reduce((n, it) => n + it.done, 0) / list.length) * 10) / 10 : 0;
  const reach = STEP_GUIDE.map((g, i) => ({ label: g.label, value: list.filter((it) => it.steps[i] === "done").length, color: i < 4 ? C.primary : i < 7 ? C.accent : C.orange }));
  const abilityKeys = list[0]?.abilities.map((a) => a.label) || ["判断力", "共情力", "创造力", "反思力", "联结力"];
  const abilityAvg = abilityKeys.map((label, k) => ({ label, value: list.length ? Math.round((list.reduce((n, it) => n + (it.abilities[k]?.count || 0), 0) / list.length) * 10) / 10 : 0, color: C.chart[k] }));
  const stuck = list.filter((it) => it.blockers.length).length;
  const lastReached = [...reach].reverse().find((r) => r.value > 0);
  const weakest = [...abilityAvg].sort((a, b) => a.value - b.value)[0];

  return (
    <AppShell title="班级总览" subtitle="一屏看清：项目走到哪、卡在哪、该谁出手" actions={<>
      <select value={klass} onChange={(e) => setKlass(e.target.value)} style={{ ...field, width: "auto" }}>
        <option value="">{own ? "我的全部班级" : "全部班级"}</option>
        {classes.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <Link href="/teacher/live" style={btn("primary")}>开始上课</Link>
    </>}>
      {err && <Section><div style={{ color: C.danger }}>{err}</div></Section>}
      {!err && (
        <div style={{ display: "grid", gap: 18 }}>
          {msg && <div style={{ fontSize: 16, color: msg.startsWith("✗") ? C.danger : C.ok }}>{msg}</div>}
          <StatRow>
            <Stat label="参与学生" value={students} unit="人" note={`${list.length} 个项目团队`} />
            <Stat label="平均完成步数" value={avgDone} unit="/ 8" color={C.accent} note="8 步产品线" />
            <Stat label="待确认的现实验证" value={verifying.length} unit="条" color={verifying.length ? C.orange : C.mut} note={verifying.length ? "需要您判断真伪" : "暂无"} href="#verify" />
            <Stat label="有卡点的项目" value={stuck} unit="个" color={stuck ? C.warn : C.ok} note={stuck ? "可起草干预卡" : "都在推进"} href="#panel" />
          </StatRow>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))", gap: 18 }}>
            <Section title="各步完成的项目数">
              {list.length === 0 ? <Empty>还没有学生项目。学生在“项目工作台”新建项目后，这里会自动统计。</Empty> : <>
                <Insight>{lastReached ? `最远已有 ${lastReached.value} 个项目完成「${lastReached.label}」` : "还没有项目完成第 1 步"}</Insight>
                <Bars data={reach} unit="" />
              </>}
            </Section>
            <Section title="五力 · 每个项目平均条数">
              {list.length === 0 ? <Empty>有项目后自动统计。五力只数已认证的记录，不由 AI 打分。</Empty> : <>
                <Insight color={C.accent}>{weakest ? `相对最弱的是${weakest.label}（平均 ${weakest.value} 条），可在下次课重点练` : ""}</Insight>
                <Bars data={abilityAvg} />
              </>}
            </Section>
          </div>

          <div id="verify">
          <Section title={`待确认的现实验证（${verifying.length}）`} extra={<span style={{ fontSize: 14.5, color: "var(--mut)" }}>自动预审只检查要素是否写全，真实性由您判断；确认后计 +5</span>}>
            {verifying.length === 0 && <Empty>暂无。学生提交现实验证后出现在这里。</Empty>}
            <div style={{ display: "grid", gap: 12 }}>
              {verifying.map((h) => (
                <div key={h.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 16 }}><Tag color={C.primary}>{h.team || "未知队伍"}</Tag> <b>{h.text}</b></div>
                  <div style={{ fontSize: 15, color: "var(--mut)", margin: "6px 0" }}>证据：{h.evidence}{h.evidence_url ? ` · ${h.evidence_url}` : ""}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 15 }}>
                    <span style={{ color: "var(--mut)" }}>自动预审：</span>
                    {h.prereview.items.map((i) => <Tag key={i.key} color={i.hit ? C.ok : C.danger}>{i.hit ? "✓" : "✗"} {i.label}</Tag>)}
                    <span style={{ color: h.prereview.ok ? C.ok : C.warn }}>{h.prereview.note}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                    <input value={notes[h.id] || ""} onChange={(e) => setNotes({ ...notes, [h.id]: e.target.value })} placeholder="点评（可选，学生可见）" style={{ ...field, maxWidth: 360 }} />
                    <Btn small color={C.ok} disabled={busy} onClick={() => review(h.id, true)}>确认 +5</Btn>
                    <Btn small ghost color={C.danger} disabled={busy} onClick={() => review(h.id, false)}>证据不足，退回</Btn>
                  </div>
                </div>
              ))}
            </div>
          </Section>
          </div>

          <div id="panel">
          <Section title="各项目进度与卡点" extra={<>{(["done", "doing", "todo"] as StepStatus[]).map((k) => <span key={k} style={{ fontSize: 14.5, color: "var(--mut)", display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 3, background: COLOR[k], border: "1px solid #CBD5E1" }} />{STEP_STATUS_LABEL[k]}</span>)}</>}>
            {items === null && <div style={{ fontSize: 14.5, color: "var(--mut)" }}>加载中…</div>}
            {items?.length === 0 && <div style={{ fontSize: 14.5, color: "var(--mut)" }}>还没有学生项目。学生在“项目工作台”新建项目后会出现在这里。</div>}
            <div style={{ display: "grid", gap: 10 }}>
              {items?.map((it) => (
                <div key={it.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,200px),1fr))", gap: 12, alignItems: "center", fontSize: 14.5 }}>
                    <span><b>{it.name}</b><span style={{ color: "var(--mut)", fontSize: 15 }}>{it.teams ? ` · ${it.teams}` : ""} · {it.members} 人</span></span>
                    <span style={{ display: "flex", gap: 3 }} title={`当前第 ${it.current} 步`}>
                      {it.steps.map((st, i) => (
                        <span key={i} title={`${STEP_GUIDE[i].label}：${STEP_STATUS_LABEL[st]}`}
                          style={{ width: 22, height: 16, borderRadius: 4, background: COLOR[st], border: i + 1 === it.current ? `2px solid ${C.orange}` : "1px solid #CBD5E1" }} />
                      ))}
                    </span>
                    <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }} title="五力：统计的是已认证的记录条数">
                      {it.abilities.map((a) => (
                        <span key={a.key} style={{ fontSize: 14.5, color: "var(--mut)" }}>{a.label.slice(0, 2)}<b style={{ color: a.count ? "#0369A1" : "var(--mut)", marginLeft: 2 }}>{a.count}</b></span>
                      ))}
                    </span>
                    <span style={{ color: it.blockers.length ? "#B45309" : "var(--mut)", fontSize: 14 }}>
                      {it.blockers.length ? it.blockers.map((b) => `${b.n} ${b.text}`).join("；") : it.done === 8 ? "已完成 8 步" : "暂无卡点"}
                      {" "}<Link href={`/apply/ontology?project=${it.id}`} style={{ color: "var(--cyan)" }}>看本体</Link>
                      {it.drafts.length > 0 && <>{" · "}<button onClick={() => { setCardFor(cardFor === it.id ? "" : it.id); setCard(it.drafts[0]); }}
                        style={{ background: "none", border: "none", color: "#6D28D9", cursor: "pointer", fontFamily: "inherit", fontSize: 14, padding: 0 }}>起草干预卡</button></>}
                    </span>
                  </div>
                  {cardFor === it.id && card && (
                    <div style={{ marginTop: 8, padding: 12, borderRadius: 12, background: "#F5F3FF", display: "grid", gap: 8 }}>
                      {it.drafts.length > 1 && (
                        <div><span style={lab}>按哪个卡点起草</span>
                          <select onChange={(e) => setCard(it.drafts[Number(e.target.value)])} style={field}>
                            {it.drafts.map((d, i) => <option key={d.rule} value={i} style={{ background: "#fff" }}>{d.sharp}</option>)}
                          </select>
                        </div>
                      )}
                      <div><span style={lab}>① 一针见血（对事不对人）</span><input value={card.sharp} onChange={(e) => setCard({ ...card, sharp: e.target.value })} style={field} /></div>
                      <div><span style={lab}>② 证据（来自数据库记录）</span><input value={card.evidence} onChange={(e) => setCard({ ...card, evidence: e.target.value })} style={field} /></div>
                      <div><span style={lab}>③ 怎么改</span><textarea rows={2} value={card.advice} onChange={(e) => setCard({ ...card, advice: e.target.value })} style={{ ...field, resize: "vertical" }} /></div>
                      <div style={{ fontSize: 15, color: "var(--mut)" }}>④ 去哪练：<Link href={card.link_href} style={{ color: "var(--cyan)" }}>{card.link_label}</Link> · 发给该项目全部 {it.members} 名成员，学生在成长星图里回应</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn small color="#6D28D9" disabled={busy} onClick={() => sendCard(it.id)}>发送</Btn>
                        <Btn small ghost color="#475569" onClick={() => { setCardFor(""); setCard(null); }}>取消</Btn>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
          </div>
        </div>
      )}
    </AppShell>
  );
}

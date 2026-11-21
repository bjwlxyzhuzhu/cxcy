"use client";
// 学生项目工作台：一个项目一条产品线，8 步进度由本体里的真实记录自动判定；现有模块挂在对应步骤上。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import LearnChrome from "../learn/LearnChrome";
import { box, field, lab, Btn, Tag, api } from "@/components/arena/ui";
import RadarChart from "../apply/RadarChart";
import { STEP_GUIDE, STEP_STATUS_LABEL, STEP_GEN, STEP_ARTIFACT, getCurrentProject, setCurrentProject, type StepStatus } from "@/lib/ontology/pipeline";

type ProjectItem = { id: string; name: string; role: string; members: number };
type StepState = { step: number; key: string; label: string; status: StepStatus; certified: number; draft: number };
type Artifact = { id: string; kind: string; title: string; status: string; created_at: string };
type Progress = { project: { id: string; name: string }; steps: StepState[]; current: number; done: number; blockers: { key: string; text: string; n: number }[]; artifacts: Artifact[]; abilities?: Ability[] };
type Ability = { key: string; label: string; count: number; score: number; basis: { label: string; n: number }[] };

const COLOR: Record<StepStatus, string> = { done: "#15803D", doing: "#6D28D9", todo: "#475569", soon: "#64748b" };
/** 8 步分成 6 个阶段，每阶段一种颜色，循序渐进 */
const PHASES = [
  { name: "发现问题", color: "#0E7490", steps: [1, 2] },
  { name: "定义方案", color: "#1D4ED8", steps: [3] },
  { name: "做出 MVP", color: "#6D28D9", steps: [4] },
  { name: "真实验证", color: "#B45309", steps: [5] },
  { name: "迭代决策", color: "#C2410C", steps: [6] },
  { name: "展示沉淀", color: "#BE185D", steps: [7, 8] },
];
const phaseOf = (no: number) => PHASES.find((p) => p.steps.includes(no)) || PHASES[0];
const ABILITY_COLOR = ["#0E7490", "#BE185D", "#6D28D9", "#B45309", "#15803D"];

export default function StudioPage() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [pid, setPid] = useState("");
  const [pr, setPr] = useState<Progress | null>(null);
  const [sel, setSel] = useState(0);
  const [msg, setMsg] = useState("");
  const [newName, setNewName] = useState("");
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [wide, setWide] = useState(true);
  useEffect(() => { const f = () => setWide(window.innerWidth >= 1100); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const [note, setNote] = useState<{ ok: boolean; text: string; warnings?: string[] } | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      const r = await api<{ items: ProjectItem[] }>("/api/ontology/project");
      setAuthed(true);
      setProjects(r.items);
      const saved = getCurrentProject();
      const pick = r.items.find((p) => p.id === saved)?.id || r.items[0]?.id || "";
      setPid(pick);
      if (pick && pick !== saved) setCurrentProject(pick);
    } catch (e) {
      if (/未登录/.test((e as Error).message)) setAuthed(false); else setMsg((e as Error).message);
    }
  }, []);
  useEffect(() => { loadProjects(); }, [loadProjects]);
  const loadProgress = useCallback(async (keepSel = false) => {
    if (!pid) { setPr(null); return; }
    try { const r = await api<Progress>(`/api/ontology/progress?project_id=${pid}`); setPr(r); if (!keepSel) setSel(r.current); }
    catch (e) { setMsg((e as Error).message); }
  }, [pid]);
  useEffect(() => { loadProgress(); }, [loadProgress]);
  useEffect(() => { setNote(null); }, [sel]);

  const CREATED: Record<string, string> = { track_profile: "赛道画像", task_brief: "任务书", product_version: "版本", test_report: "测试报告", evidence: "证据", decision: "决策", links: "关系" };
  async function aiDraft(stepNo: number) {
    setBusy(true); setNote({ ok: true, text: "AI 正在依据已认证的内容起草，约需几十秒…" });
    try {
      const r = await api<{ created: Record<string, number>; warnings: string[]; remaining: number | null }>("/api/ontology/generate", { body: { project_id: pid, step: STEP_GEN[stepNo] } });
      setNote({ ok: true, text: `✓ AI 起草了：${Object.entries(r.created).map(([k, v]) => `${CREATED[k] || k} ${v}`).join("、")}。都是草稿，请到项目本体逐条核对并认证。${r.remaining != null ? `（剩余积分 ${r.remaining}）` : ""}`, warnings: r.warnings });
      await loadProgress(true);
    } catch (e) { setNote({ ok: false, text: "✗ " + (e as Error).message }); }
    finally { setBusy(false); }
  }
  async function artifactAct(body: Record<string, unknown>, okText: string) {
    setBusy(true); setNote(null);
    try { await api("/api/ontology/action", { body }); setNote({ ok: true, text: "✓ " + okText }); await loadProgress(true); }
    catch (e) { setNote({ ok: false, text: "✗ " + (e as Error).message }); }
    finally { setBusy(false); }
  }

  async function createProject() {
    try {
      const r = await api<{ id: string }>("/api/ontology/action", { body: { action: "project.create", name: newName || "我的项目" } });
      setNewName(""); setCurrentProject(r.id); await loadProjects(); setPid(r.id);
    } catch (e) { setMsg("✗ " + (e as Error).message); }
  }

  const idx = Math.min(STEP_GUIDE.length, Math.max(1, sel || 1)) - 1;
  const g = STEP_GUIDE[idx];
  const s = pr?.steps[idx];

  return (
    <LearnChrome emoji="🛰️" title="项目工作台" subtitle="人判断 / AI 执行 · 用真实用户证据驱动 V0.1 → V0.2" wide>
      {authed === false && <div style={box}>请先登录（右上角），再进入你的项目工作台。</div>}
      {authed && (
        <>
          <div style={{ ...box, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 14 }}>
            <div style={{ minWidth: 260 }}>
              <span style={lab}>当前项目</span>
              <select value={pid} onChange={(e) => { setPid(e.target.value); setCurrentProject(e.target.value); }} style={field}>
                {projects.length === 0 && <option value="" style={{ background: "#fff" }}>还没有项目</option>}
                {projects.map((p) => <option key={p.id} value={p.id} style={{ background: "#fff" }}>{p.name}（{p.role === "owner" ? "负责人" : "成员"} · {p.members} 人）</option>)}
              </select>
            </div>
            <div style={{ minWidth: 180 }}><span style={lab}>新建项目</span><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="项目名称" style={field} /></div>
            <Btn ghost onClick={createProject}>新建</Btn>
            {pr && <span style={{ marginLeft: "auto", fontSize: 14.5, color: "var(--mut)" }}>已完成 {pr.done} / 8 步</span>}
          </div>
          {msg && <div style={{ fontSize: 14.5, color: "#B91C1C", marginBottom: 10 }}>{msg}</div>}

          {!pid && <div style={{ ...box, fontSize: 14.5, color: "var(--mut)" }}>先新建一个项目。队友可以在“项目本体”页里由负责人按学号拉进来。</div>}

          {pr && (
            <>
              {/* 阶段流程：6 个阶段 × 8 步，彩色框 + 箭头，一眼看出走到哪 */}
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 14, color: "var(--mut)", margin: "4px 0 10px" }}>
                <b style={{ color: "var(--ink)", fontSize: 14 }}>产品线流程</b>状态由已认证的本体对象自动判定
                <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>{(["done", "doing", "todo"] as StepStatus[]).map((k) => <Tag key={k} color={COLOR[k]}>{STEP_STATUS_LABEL[k]}</Tag>)}</span>
              </div>
              <div style={{ display: "flex", alignItems: "stretch", gap: 6, flexWrap: "wrap", rowGap: 10 }}>
                {PHASES.map((ph, pi) => (
                  <div key={ph.name} style={{ display: "flex", alignItems: "center", gap: 6, flex: `${ph.steps.length} 1 ${ph.steps.length * 128 + 24}px` }}>
                    <div style={{ flex: 1, borderRadius: 16, padding: 8, background: `linear-gradient(160deg, ${ph.color}2e, ${ph.color}0d)`, border: `1px solid ${ph.color}55` }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: ph.color, margin: "0 2px 6px" }}>{pi + 1} · {ph.name}</div>
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(${ph.steps.length},1fr)`, gap: 6 }}>
                        {ph.steps.map((no) => {
                          const step = STEP_GUIDE[no - 1], st = pr.steps[no - 1], on = sel === no, doneSt = st.status === "done", doing = st.status === "doing";
                          return (
                            <button key={no} onClick={() => setSel(no)} aria-pressed={on} title={step.goal} style={{
                              textAlign: "left", cursor: "pointer", fontFamily: "inherit", borderRadius: 12, padding: "9px 10px", minHeight: 74,
                              color: doneSt ? "#fff" : "var(--ink)",
                              background: doneSt ? ph.color : doing ? `${ph.color}26` : "#F1F5F9",
                              border: on ? "2px solid #fff" : `1px solid ${doing ? ph.color : ph.color + "44"}`,
                              boxShadow: doing ? `0 0 16px ${ph.color}88` : on ? `0 0 12px ${ph.color}66` : "none",
                              opacity: st.status === "todo" ? 0.72 : 1,
                            }}>
                              <div style={{ fontSize: 14.5, fontWeight: 700, opacity: 0.8 }}>第 {no} 步 {doneSt ? "✓" : doing ? "● 进行中" : ""}</div>
                              <div style={{ fontSize: 14, fontWeight: 800, marginTop: 2 }}>{step.label}</div>
                              <div style={{ fontSize: 14.5, marginTop: 3, opacity: 0.8 }}>已认证 {st.certified}{st.draft ? ` · 草稿 ${st.draft}` : ""}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {pi < PHASES.length - 1 && <span style={{ color: PHASES[pi + 1].color, fontSize: 20, fontWeight: 900 }}>➜</span>}
                  </div>
                ))}
              </div>
              <div style={{ height: 8, borderRadius: 4, background: "#F1F5F9", overflow: "hidden", margin: "8px 0 14px" }} title={`已完成 ${pr.done} / 8 步`}>
                <div style={{ width: `${(pr.done / 8) * 100}%`, height: "100%", background: "linear-gradient(90deg,#0E7490,#6D28D9,#BE185D,#15803D)" }} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: wide ? "minmax(0,2fr) minmax(300px,1fr)" : "minmax(0,1fr)", gap: 12 }}>
                <div style={{ ...box, borderColor: phaseOf(g.step).color + "88", }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: phaseOf(g.step).color }}>{phaseOf(g.step).name}</span>
                    <h3 style={{ fontSize: 17, fontWeight: 800 }}>第 {g.step} 步 · {g.label}</h3>
                    {s && <Tag color={COLOR[s.status]}>{STEP_STATUS_LABEL[s.status]}</Tag>}
                    <span style={{ fontSize: 14.5, color: "var(--mut)" }}>{g.goal}</span>
                  </div>
                  {/* 本步流程：AI 起草 → 你来认证 → 完成条件 */}
                  <div style={{ display: "flex", alignItems: "stretch", gap: 6, margin: "12px 0", flexWrap: "wrap" }}>
                    {[{ t: "① AI 起草", c: "#6D28D9", d: g.ai }, { t: "② 你来认证", c: "#0E7490", d: g.you }, { t: "③ 完成条件", c: "#15803D", d: g.doneWhen }].map((x, i, arr) => (
                      <div key={x.t} style={{ display: "flex", alignItems: "center", gap: 6, flex: "1 1 200px" }}>
                        <div style={{ flex: 1, alignSelf: "stretch", borderRadius: 12, padding: "10px 12px", background: `${x.c}1f`, border: `1px solid ${x.c}66` }}>
                          <div style={{ fontSize: 14.5, fontWeight: 800, color: x.c, marginBottom: 4 }}>{x.t}</div>
                          <div style={{ fontSize: 14.5, lineHeight: 1.65 }}>{x.d}</div>
                        </div>
                        {i < arr.length - 1 && <span style={{ color: arr[i + 1].c, fontSize: 18, fontWeight: 900 }}>➜</span>}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {STEP_GEN[g.step] && <Btn small disabled={busy} onClick={() => aiDraft(g.step)}>{busy ? "处理中…" : "AI 起草本步"}</Btn>}
                    {g.step === 2 && <Link href="/apply/ontology" style={{ textDecoration: "none" }}><Btn small>上传资料 → AI 自动建本体</Btn></Link>}
                    {STEP_ARTIFACT[g.step] && <Btn small disabled={busy} onClick={() => artifactAct({ action: "artifact.generate", project_id: pid, kind: STEP_ARTIFACT[g.step] }, g.step === 7 ? "已生成路演页，请预览审阅" : "已生成项目档案")}>{g.step === 7 ? "生成路演页" : "生成项目档案"}</Btn>}
                    {g.tools.map((t) => (
                      <Link key={t.href + t.label} href={t.href} style={{ textDecoration: "none" }}><Btn small ghost>{t.label} →</Btn></Link>
                    ))}
                  </div>
                  {STEP_GEN[g.step] && <div style={{ fontSize: 15, color: "var(--mut)", marginTop: 8 }}>AI 只依据本项目已认证的内容和术语口径起草，结果都是草稿；按“文本生成”扣积分，用自己的密钥不扣。</div>}
                  {note && (
                    <div style={{ marginTop: 10, fontSize: 14.5, lineHeight: 1.7, color: note.ok ? "#15803D" : "#B91C1C" }}>
                      {note.text}
                      {note.warnings?.map((w, i) => <div key={i} style={{ color: "#B45309" }}>⚠ {w}</div>)}
                      {note.ok && STEP_GEN[g.step] && <div><Link href="/apply/ontology?filter=draft" style={{ color: "var(--cyan)" }}>去项目本体认证 →</Link></div>}
                    </div>
                  )}
                  {STEP_ARTIFACT[g.step] && (
                    <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                      {pr.artifacts.filter((a) => a.kind === STEP_ARTIFACT[g.step]).length === 0 && <div style={{ fontSize: 14, color: "var(--mut)" }}>还没有生成。只收录已认证 / 教师已确认的内容，不调用模型、不扣积分。</div>}
                      {pr.artifacts.filter((a) => a.kind === STEP_ARTIFACT[g.step]).map((a) => (
                        <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", fontSize: 14.5, borderTop: "1px solid var(--line)", paddingTop: 6 }}>
                          <Tag color={a.status === "certified" ? "#15803D" : "#B45309"}>{a.status === "certified" ? (a.kind === "pitch" ? "已审阅确认" : "已归档") : "待审阅"}</Tag>
                          <span style={{ color: "var(--mut)" }}>{new Date(a.created_at).toLocaleString("zh-CN", { hour12: false })}</span>
                          <a href={`/api/ontology/artifact?id=${a.id}`} target="_blank" rel="noreferrer" style={{ color: "var(--cyan)" }}>预览</a>
                          <a href={`/api/ontology/artifact?id=${a.id}&download=1`} style={{ color: "var(--cyan)" }}>下载 HTML</a>
                          {a.status === "draft" && <Btn small color="#15803D" disabled={busy} onClick={() => artifactAct({ action: "artifact.certify", id: a.id }, "已审阅确认")}>审阅确认</Btn>}
                          <Btn small ghost color="#B91C1C" disabled={busy} onClick={() => artifactAct({ action: "artifact.revoke", id: a.id }, "已撤回")}>撤回</Btn>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 14, paddingTop: 10, borderTop: "1px solid var(--line)", fontSize: 14 }}>
                    <span style={{ color: "var(--mut)" }}>本体与口径：</span>
                    <Link href="/apply/ontology" style={{ color: "var(--cyan)" }}>项目本体</Link>
                    <Link href="/apply/ontology?tab=glossary" style={{ color: "var(--cyan)" }}>术语口径</Link>
                    <Link href="/apply/ontology?tab=audit" style={{ color: "var(--cyan)" }}>操作记录</Link>
                    <span style={{ color: "var(--mut)", marginLeft: 8 }}>知识星球：</span>
                    {[["理论", "/learn/theory"], ["案例", "/learn/cases"], ["模板", "/learn/templates"], ["政策", "/learn/policy"]].map(([l, h]) => (
                      <Link key={h} href={h} style={{ color: "var(--cyan)" }}>{l}</Link>
                    ))}
                  </div>
                </div>
                <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
                  {pr.abilities && (
                    <div style={box}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                        <h3 style={{ fontSize: 15, fontWeight: 800 }}>学情画像 · 五力雷达</h3>
                        <span style={{ fontSize: 14.5, color: "var(--mut)" }}>只统计已认证的记录，不由 AI 打分</span>
                      </div>
                      <RadarChart size={260} accent="#0E7490" axes={pr.abilities.map((a) => ({ label: a.label, score: a.score, max: 100 }))} valueText={(i) => `${pr.abilities![i].count} 条`} />
                      <div style={{ display: "grid", gap: 4 }}>
                        {pr.abilities.map((a, i) => (
                          <details key={a.key}>
                            <summary style={{ cursor: "pointer", fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}>
                              <span style={{ width: 8, height: 8, borderRadius: 4, background: ABILITY_COLOR[i] }} />{a.label}<b style={{ marginLeft: "auto" }}>{a.count}</b>
                            </summary>
                            <div style={{ fontSize: 14.5, color: "var(--mut)", padding: "2px 0 4px 14px", lineHeight: 1.7 }}>{a.basis.map((b) => `${b.label} ${b.n}`).join(" · ")}</div>
                          </details>
                        ))}
                      </div>
                    </div>
                  )}
                  <div style={{ ...box, borderColor: pr.blockers.length ? "#B4530966" : "var(--line)" }}>
                    <h3 style={{ fontSize: 14, fontWeight: 800, marginBottom: 6 }}>卡点提醒</h3>
                    {pr.blockers.length === 0 ? <div style={{ fontSize: 14, color: "var(--mut)" }}>暂无卡点</div> :
                      pr.blockers.map((b) => <div key={b.key} style={{ fontSize: 14, color: "#B45309", lineHeight: 1.8 }}>⚠ {b.n} {b.text}</div>)}
                    <div style={{ fontSize: 15, color: "var(--mut)", marginTop: 8, lineHeight: 1.7 }}>AI 助手小闯在 <Link href="/" style={{ color: "var(--cyan)" }}>知识星球</Link>、小创在 <Link href="/apply/cockpit" style={{ color: "var(--cyan)" }}>创业星舰</Link>，都会读取本项目已认证的本体并标注出处。</div>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </LearnChrome>
  );
}

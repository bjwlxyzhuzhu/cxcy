"use client";
// 我的课程：一学期 8 次课 = 产品线 8 步。每次课 课前 → 课中 → 课后，学生在同一个项目上从头推进到尾。
// 单元状态直接取项目工作台的 8 步进度（由已认证的本体记录自动判定），不另设打分。
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import LearnChrome from "../learn/LearnChrome";
import { box, Tag, api } from "@/components/arena/ui";
import { UNITS, REGION_THEMES } from "@/lib/course";
import { STEP_STATUS_LABEL, getCurrentProject, type StepStatus } from "@/lib/ontology/pipeline";

type Progress = { project: { id: string; name: string }; steps: { status: StepStatus; certified: number }[]; current: number; done: number };
type Me = { role: string; class: string; teachers: number };

export default function CoursePage() {
  const [me, setMe] = useState<Me | null>(null);
  const [pr, setPr] = useState<Progress | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [open, setOpen] = useState(0);

  const load = useCallback(async () => {
    try {
      const m = await api<Me>("/api/me/class"); setMe(m); setAuthed(true);
      const list = await api<{ items: { id: string }[] }>("/api/ontology/project");
      const pid = list.items.find((p) => p.id === getCurrentProject())?.id || list.items[0]?.id;
      if (pid) { const r = await api<Progress>(`/api/ontology/progress?project_id=${pid}`); setPr(r); setOpen(r.current); }
      else setOpen(1);
    } catch (e) { if (/未登录/.test((e as Error).message)) setAuthed(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const statusOf = (no: number): StepStatus => {
    const st = pr?.steps[no - 1]?.status || "todo";
    return st === "todo" && no === (pr?.current || 1) ? "doing" : st; // 当前所在的这次课显示“进行中”
  };

  return (
    <LearnChrome emoji="📘" title="我的课程" subtitle="《创新创业基础》· 8 次课贯穿一个项目：课前学 → 课中做 → 课后验" wide>
      {authed === false && <div style={box}>请先登录（右上角），登录后这里会显示你的课程进度。</div>}
      {authed && (
        <>
          <div style={{ ...box, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 15, color: "var(--mut)" }}>我的班级</div>
              <b style={{ fontSize: 15 }}>{me?.class || "未分班"}</b>
              <span style={{ fontSize: 15, color: "var(--mut)", marginLeft: 8 }}>{me?.teachers ? `已关联 ${me.teachers} 位任课教师` : "尚未关联任课教师（由教师或管理员导入名单时建立）"}</span>
            </div>
            <div>
              <div style={{ fontSize: 15, color: "var(--mut)" }}>贯穿项目</div>
              {pr ? <b style={{ fontSize: 15 }}>{pr.project.name}</b> : <Link href="/studio" style={{ color: "var(--cyan)", fontSize: 14 }}>先去项目工作台新建项目 →</Link>}
            </div>
            {pr && (
              <div style={{ flex: "1 1 240px" }}>
                <div style={{ fontSize: 15, color: "var(--mut)", marginBottom: 4 }}>课程进度 {pr.done} / 8</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {UNITS.map((u) => <span key={u.no} title={`第 ${u.no} 次课 · ${u.title}`} style={{ flex: 1, height: 10, borderRadius: 5, background: statusOf(u.no) === "done" ? u.color : statusOf(u.no) === "doing" ? u.color + "77" : "#F1F5F9" }} />)}
                </div>
              </div>
            )}
            <Link href="/studio" style={{ marginLeft: "auto", textDecoration: "none", fontWeight: 800, fontSize: 15, color: "#fff", background: "linear-gradient(120deg,var(--cyan),var(--violet))", padding: "9px 16px", borderRadius: 999 }}>进入项目工作台 →</Link>
          </div>

          <div style={{ display: "grid", gap: 10 }}>
            {UNITS.map((u) => {
              const st = statusOf(u.no), on = open === u.no;
              return (
                <div key={u.no} style={{ ...box, padding: 0, overflow: "hidden", borderColor: on ? u.color : u.color + "44" }}>
                  <button onClick={() => setOpen(on ? 0 : u.no)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: `linear-gradient(90deg, ${u.color}26, transparent)`, border: "none", color: "var(--ink)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                    <span style={{ width: 34, height: 34, borderRadius: 17, display: "grid", placeItems: "center", fontWeight: 900, background: st === "done" ? u.color : "transparent", color: st === "done" ? "#fff" : u.color, border: `2px solid ${u.color}` }}>{st === "done" ? "✓" : u.no}</span>
                    <span style={{ flex: 1 }}>
                      <b style={{ fontSize: 15.5 }}>第 {u.no} 次课 · {u.title}</b>
                      <span style={{ fontSize: 14, color: "var(--mut)", marginLeft: 10 }}>{u.question}</span>
                    </span>
                    <Tag color={u.color}>主练{u.ability}</Tag>
                    <Tag color={st === "done" ? "#15803D" : st === "doing" ? "#6D28D9" : "#475569"}>{STEP_STATUS_LABEL[st]}</Tag>
                  </button>
                  {on && (
                    <div style={{ padding: "4px 16px 16px" }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "stretch", flexWrap: "wrap" }}>
                        {[u.pre, u.inClass, u.post].map((ph, i) => (
                          <div key={ph.label} style={{ display: "flex", gap: 6, alignItems: "center", flex: "1 1 260px" }}>
                            <div style={{ flex: 1, alignSelf: "stretch", borderRadius: 14, padding: 12, background: `${u.color}${["14", "24", "14"][i]}`, border: `1px solid ${u.color}66` }}>
                              <div style={{ fontSize: 14.5, fontWeight: 900, color: u.color }}>{["① ", "② ", "③ "][i]}{ph.label}</div>
                              <div style={{ fontSize: 15, lineHeight: 1.65, margin: "4px 0 6px" }}>{ph.task}</div>
                              <div style={{ fontSize: 15, color: "var(--mut)", marginBottom: 8 }}>🤖 {ph.ai}</div>
                              <Link href={ph.module.href} style={{ fontSize: 14, fontWeight: 800, color: u.color, textDecoration: "none", border: `1px solid ${u.color}77`, borderRadius: 999, padding: "4px 12px" }}>{ph.module.label} →</Link>
                            </div>
                            {i < 2 && <span style={{ color: u.color, fontSize: 18, fontWeight: 900 }}>➜</span>}
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 14, color: "var(--mut)" }}>
                        <span>🏭 区域产业：{u.region}</span>
                        <span>🎗 课程思政：{u.values}</span>
                        {pr && <span>📌 对应项目第 {u.no} 步：已认证 {pr.steps[u.no - 1]?.certified || 0} 条</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ ...box, marginTop: 14 }}>
            <b style={{ fontSize: 14 }}>选题方向参考（区域产业）</b>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 10, marginTop: 8 }}>
              {REGION_THEMES.map((t) => (
                <div key={t.key} style={{ borderRadius: 12, padding: 12, border: "1px solid var(--line)", background: "#F1F5F9" }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{t.icon} {t.label}</div>
                  <div style={{ fontSize: 14, color: "var(--mut)", marginTop: 4, lineHeight: 1.6 }}>{t.hint}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </LearnChrome>
  );
}

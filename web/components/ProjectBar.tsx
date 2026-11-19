"use client";
// 模块顶部提示条：当前项目 · 本页对应产品线第几步 · 进度 · 回到工作台
// 未登录不显示；教师显示“教师工作台”入口；两个工作台页面本身不显示。
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MODULE_STEP, STEP_GUIDE, getCurrentProject, setCurrentProject } from "@/lib/ontology/pipeline";

type State =
  | { kind: "none" }
  | { kind: "teacher" }
  | { kind: "noproject" }
  | { kind: "project"; name: string; done: number; current: number };

export default function ProjectBar({ dark = true }: { dark?: boolean }) {
  const path = usePathname() || "";
  const [st, setSt] = useState<State>({ kind: "none" });
  const hidden = path.startsWith("/studio") || path.startsWith("/teacher");

  useEffect(() => {
    if (hidden) return;
    let alive = true;
    (async () => {
      try {
        const me = await fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json());
        if (!me?.user) return;
        if (me.profile?.role === "teacher" || me.profile?.role === "admin") { if (alive) setSt({ kind: "teacher" }); return; }
        const list = await fetch("/api/ontology/project", { cache: "no-store" }).then((r) => r.json());
        const items: { id: string; name: string }[] = list?.items || [];
        if (!items.length) { if (alive) setSt({ kind: "noproject" }); return; }
        const saved = getCurrentProject();
        const p = items.find((x) => x.id === saved) || items[0];
        if (p.id !== saved) setCurrentProject(p.id);
        const pr = await fetch(`/api/ontology/progress?project_id=${p.id}`, { cache: "no-store" }).then((r) => r.json());
        if (alive) setSt({ kind: "project", name: p.name, done: Number(pr?.done || 0), current: Number(pr?.current || 1) });
      } catch { /* 提示条失败不影响页面 */ }
    })();
    return () => { alive = false; };
  }, [hidden, path]);

  if (hidden || st.kind === "none") return null;
  const step = MODULE_STEP[path];
  const ink = dark ? "var(--ink)" : "#1f2937", mut = dark ? "var(--mut)" : "#6b7280";
  const wrap: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 12.5, color: ink,
    padding: "7px 14px", borderRadius: 12, border: "1px solid rgba(34,211,238,.35)", background: "rgba(34,211,238,.07)",
  };
  const link: React.CSSProperties = { color: "#22d3ee", textDecoration: "none", fontWeight: 700, marginLeft: "auto" };

  if (st.kind === "teacher") return (
    <div style={wrap}><span style={{ color: mut }}>教师视角</span><Link href="/teacher" style={link}>教师工作台 →</Link></div>
  );
  if (st.kind === "noproject") return (
    <div style={wrap}><span style={{ color: mut }}>还没有项目，先建一个项目，模块产出才能归到同一条产品线</span><Link href="/studio" style={link}>去项目工作台 →</Link></div>
  );
  return (
    <div style={wrap}>
      <span>当前项目：<b>{st.name}</b></span>
      {step && <span style={{ color: mut }}>本页对应第 {step} 步「{STEP_GUIDE[step - 1].label}」</span>}
      <span style={{ color: mut }}>进度 {st.done}/8 · 当前在第 {st.current} 步</span>
      <Link href="/studio" style={link}>回到工作台 →</Link>
    </div>
  );
}

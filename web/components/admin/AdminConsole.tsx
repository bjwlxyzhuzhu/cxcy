"use client";
import { useEffect, useState } from "react";
import LearnChrome from "@/app/learn/LearnChrome";
import RosterImport from "./RosterImport";
import StudentManager from "./StudentManager";
import KnowledgeAdmin from "./KnowledgeAdmin";
import UsageStats from "./UsageStats";
import ChaoxingAdmin from "./ChaoxingAdmin";
import InterventionAdmin from "./InterventionAdmin";
import EffectPanel from "./EffectPanel";
import ResearchExport from "./ResearchExport";
import TermCourse from "./TermCourse";
import GrowthReports from "./GrowthReports";
import TeachingRecord from "./TeachingRecord";

// 后台按“先设课 → 再导名单 → 看成长”的顺序排列；第二行是日常管理与数据
const TABS = [
  { key: "terms", label: "🗓 学期与课程", row: 1 },
  { key: "roster", label: "📋 名单导入（学生 / 教师）", row: 1 },
  { key: "growth", label: "📊 学生成长报告", row: 1 },
  { key: "record", label: "📘 课程教学记录", row: 1 },
  { key: "students", label: "👥 账号管理", row: 2 },
  { key: "interventions", label: "🦉 干预督导", row: 2 },
  { key: "effect", label: "📈 成效面板", row: 2 },
  { key: "usage", label: "📊 用量统计", row: 2 },
  { key: "knowledge", label: "📚 知识库", row: 2 },
  { key: "research", label: "📦 研究数据导出", row: 2 },
  { key: "chaoxing", label: "🔗 超星对接", row: 2 },
] as const;
type TabKey = typeof TABS[number]["key"];

export default function AdminConsole({ me }: { me: { id: string; name: string | null; role: string | null } }) {
  const [tab, setTab] = useState<TabKey>("terms");
  // 支持 /admin?tab=growth 这样的直达链接
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && TABS.some((x) => x.key === t)) setTab(t as TabKey);
  }, []);
  const pick = (k: TabKey) => { setTab(k); try { history.replaceState(null, "", `?tab=${k}`); } catch { /* 忽略 */ } };
  return (
    <LearnChrome emoji="🛠" title="管理后台" subtitle={`${me.name || ""} · ${me.role === "admin" ? "管理员" : "教师"}`} wide>
      {[1, 2].map((row) => (
        <div key={row} style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: row === 1 ? 8 : 22 }}>
          {TABS.filter((t) => t.row === row).map((t) => {
            const on = tab === t.key;
            return (
              <button key={t.key} onClick={() => pick(t.key)}
                style={{ padding: row === 1 ? "10px 18px" : "7px 14px", borderRadius: 999, fontSize: row === 1 ? 14 : 12.5, fontWeight: on ? 800 : 600, cursor: "pointer", fontFamily: "inherit",
                  border: "1px solid " + (on ? "rgba(34,211,238,.6)" : "var(--line)"),
                  background: on ? "rgba(34,211,238,.16)" : "rgba(255,255,255,.04)", color: on ? "var(--cyan)" : "var(--ink)" }}>
                {t.label}
              </button>
            );
          })}
        </div>
      ))}
      {tab === "terms" && <TermCourse />}
      {tab === "roster" && <RosterImport />}
      {tab === "growth" && <GrowthReports />}
      {tab === "record" && <TeachingRecord />}
      {tab === "students" && <StudentManager meId={me.id} />}
      {tab === "knowledge" && <KnowledgeAdmin />}
      {tab === "usage" && <UsageStats />}
      {tab === "effect" && <EffectPanel />}
      {tab === "interventions" && <InterventionAdmin />}
      {tab === "chaoxing" && <ChaoxingAdmin />}
      {tab === "research" && <ResearchExport />}
    </LearnChrome>
  );
}

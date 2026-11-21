"use client";
// 知识星球（浅色版入口）：把原星系里的知识与练习模块排成一页，按“学 → 练 → 评”分三组；数字人小闯在右下角答疑。
import Link from "next/link";
import AppShell from "@/components/AppShell";
import DigitalHuman from "@/components/DigitalHuman";
import { Section } from "@/components/ui/kit";

const GROUPS = [
  { title: "学：读懂创新创业", color: "#1E3A8A", items: [
    { href: "/learn/theory", name: "理论知识", d: "《创新创业基础》五个模块，AI 老师逐章讲解" },
    { href: "/learn/policy", name: "政策解读", d: "双创与赛事政策，自动划重点" },
    { href: "/learn/cases", name: "案例宝库", d: "区域产业案例与往届项目，拆解成可借鉴的思路" },
    { href: "/learn/ontology", name: "本体实验室", d: "看懂对象、关系、动作，动手画一张业务地图" },
  ] },
  { title: "练：把想法变成项目", color: "#0E7490", items: [
    { href: "/apply/topic", name: "选题匹配", d: "AI 多轮追问，结合区域产业找方向" },
    { href: "/learn/templates", name: "模板宝库", d: "商业计划书、专利、合同等常用模板" },
    { href: "/learn/links", name: "平台直达", d: "常用赛事与学习平台入口" },
  ] },
  { title: "评：找差距、练表达", color: "#C2410C", items: [
    { href: "/apply/defense", name: "模拟答辩", d: "多角色评委连环追问，雷达图反馈" },
    { href: "/apply/expert", name: "专家打磨", d: "AI 专家团逐项审阅，对照评审要点找差距" },
  ] },
];

export default function LearnHub() {
  return (
    <AppShell title="知识星球" subtitle="学 → 练 → 评：课前预习、课后巩固都在这里">
      <div style={{ display: "grid", gap: 18 }}>
        {GROUPS.map((g) => (
          <Section key={g.title} title={<span style={{ color: g.color }}>{g.title}</span>}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 14 }}>
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} style={{ textDecoration: "none", color: "var(--ink)", border: "1px solid var(--line)", borderRadius: 12, padding: 16, display: "flex", gap: 12, alignItems: "flex-start", background: "#fff" }}>
                  <span style={{ width: 44, height: 44, borderRadius: 12, background: `${g.color}14`, color: g.color, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 20, flex: "none" }}>{it.name.slice(0, 1)}</span>
                  <span>
                    <b style={{ fontSize: 17 }}>{it.name}</b>
                    <span style={{ display: "block", fontSize: 14.5, color: "var(--mut)", marginTop: 2, lineHeight: 1.6 }}>{it.d}</span>
                  </span>
                </Link>
              ))}
            </div>
          </Section>
        ))}
      </div>
      <DigitalHuman name="小闯" img="/human-water.jpg" color="#1E3A8A" hint="知识星球向导 · 小闯"
        greet="我是小闯，知识星球的向导。课程、政策、选题、比赛流程都可以问我；写商业计划书请到创业星舰找小创。"
        system="你叫“小闯”，是“双创AI星际·知识星球”的向导。语气冷静、条理清晰、简洁。回答大学生创新创业课程与竞赛相关问题；涉及本项目事实时只用项目本体里已认证的内容并标出处，没有的就直说。" />
    </AppShell>
  );
}

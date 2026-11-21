"use client";
// 知识星球 · 本体实验室：内嵌离线版 Ontology Playground（MIT，public/ontology-playground），外面加中文导读与术语对照。
// 工具界面是英文，本页负责“看什么、点哪里、对应我们平台的哪个概念”；动手建自己项目的本体请到“项目本体”。
import { useState } from "react";
import Link from "next/link";
import LearnChrome from "../LearnChrome";
import { box, Tag } from "@/components/arena/ui";

const VIEWS = [
  { key: "catalogue", label: "① 看样例：咖啡连锁", hash: "#/catalogue/official/cosmic-coffee", tip: "先看别人画好的本体：点任意节点看它有哪些属性、和谁相连。", color: "#0E7490" },
  { key: "manufacturing", label: "② 看样例：制造业", hash: "#/catalogue/official/manufacturing", tip: "和钛材加工、质检最接近的样例：工厂、产线、工单、缺陷是怎么连起来的？", color: "#B45309" },
  { key: "designer", label: "③ 自己画：设计器", hash: "#/designer", tip: "新建对象类型（Entity Type）→ 加属性 → 拖出关系并写清“一对多 / 多对多”。", color: "#6D28D9" },
  { key: "learn", label: "④ 本体学校", hash: "#/learn/ontology-fundamentals", tip: "英文短课：什么是本体、怎么设计；可开演示模式投屏。", color: "#15803D" },
];

const TERMS = [
  ["Ontology", "本体", "把业务里的对象、关系、动作说清楚的一张图，人和 AI 共用"],
  ["Entity Type", "对象类型", "比如“客户”“订单”“工单”；我们平台里的证据、决策、版本都是对象类型"],
  ["Property", "属性", "对象的字段，比如订单的金额、日期"],
  ["Relationship", "关系", "对象之间的连线，比如“客户 下了 订单”；平台里的“决策 引用 证据”"],
  ["Cardinality", "基数", "一对一、一对多、多对多：一个客户能下几张订单？"],
  ["Instance", "实例", "某一个具体的客户、某一张订单"],
  ["Catalogue", "目录", "现成的样例本体库"],
  ["Designer", "设计器", "自己画本体的地方，可导出 RDF / JSON"],
  ["Query", "查询", "用自然语言提问，看它沿着哪些关系找答案"],
];

export default function OntologyLab() {
  const [view, setView] = useState(VIEWS[0]);
  return (
    <LearnChrome emoji="🧩" title="本体实验室" subtitle="看懂“对象 · 关系 · 动作”：人判断、AI 执行的共同语言" wide>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 10, marginBottom: 12 }}>
        <div style={{ ...box, borderColor: "#0E749055" }}>
          <b style={{ fontSize: 15 }}>一句话</b>
          <div style={{ fontSize: 15, lineHeight: 1.75, marginTop: 4 }}>本体就是给一个业务画一张“说明书式的地图”：有哪些<b>对象</b>，它们之间有什么<b>关系</b>，人能对它们做什么<b>动作</b>。地图画清楚了，AI 才知道每个词指的是什么，回答才不会乱编。</div>
        </div>
        <div style={{ ...box, borderColor: "#6D28D955" }}>
          <b style={{ fontSize: 15 }}>和我们的项目有什么关系</b>
          <div style={{ fontSize: 15, lineHeight: 1.75, marginTop: 4 }}>你的创业项目也是一张本体：用户原话（证据）→ HMW 问题 → 任务书 → V0.1 → 测试报告 → 决策 → V0.2。在 <Link href="/apply/ontology" style={{ color: "var(--cyan)" }}>项目本体</Link> 里，AI 起草的对象都要经过你认证才算数。</div>
        </div>
        <div style={{ ...box, borderColor: "#B4530955" }}>
          <b style={{ fontSize: 15 }}>课堂玩法</b>
          <div style={{ fontSize: 15, lineHeight: 1.75, marginTop: 4 }}>分组用区域产业场景画本体、互相出题查询、按证据计分。教师在 <Link href="/teacher/ontology-game" style={{ color: "var(--cyan)" }}>本体拼图 · 分组对抗</Link> 主持投屏。</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => setView(v)} style={{ padding: "8px 14px", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontWeight: 800, fontSize: 14.5,
            border: `1px solid ${v.color}`, background: view.key === v.key ? v.color : "transparent", color: view.key === v.key ? "#fff" : v.color }}>{v.label}</button>
        ))}
        <a href={`/ontology-playground/index.html${view.hash}`} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 14.5, color: "var(--cyan)", alignSelf: "center" }}>全屏打开 ↗</a>
      </div>
      <div style={{ fontSize: 14.5, color: view.color, marginBottom: 8 }}>👉 {view.tip}</div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(240px,300px)", gap: 12 }} className="lab-grid">
        <iframe key={view.key} src={`/ontology-playground/index.html${view.hash}`} title="本体实验室（Ontology Playground）"
          style={{ width: "100%", height: "72vh", minHeight: 520, border: "1px solid var(--line)", borderRadius: 16, background: "#fff" }} />
        <div style={{ ...box, alignSelf: "start" }}>
          <b style={{ fontSize: 14 }}>界面术语对照</b>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {TERMS.map(([en, zh, d]) => (
              <div key={en} style={{ fontSize: 14, lineHeight: 1.6 }}>
                <Tag color="#0369A1">{en}</Tag> <b>{zh}</b>
                <div style={{ color: "var(--mut)" }}>{d}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 14.5, color: "var(--mut)", marginTop: 10, lineHeight: 1.6 }}>
            工具来自开源项目 Ontology Playground（MIT 协议），离线部署在本站，不访问外网；“推送到 Fabric”“提交到 GitHub”两个按钮需要外部账号，课堂上不用。
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 900px){ .lab-grid{ grid-template-columns: minmax(0,1fr) !important; } }`}</style>
    </LearnChrome>
  );
}

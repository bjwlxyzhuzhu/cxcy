"use client";
import LearnChrome from "@/app/learn/LearnChrome";
import { guideSections } from "@/lib/user-guide";
import { downloadMarkdown } from "@/lib/download";
export default function GuidePage() {
  return (
    <LearnChrome
      emoji="📖"
      title="用户使用手册"
      subtitle="按实际页面编写 · 从入门到复盘"
    >
      <section className="work-panel">
        <h2>建议第一次这样走</h2>
        <p>
          登录 → 看一个获奖案例 → 填写BP摘要 → 专家打磨 → 模拟答辩 →
          查看成长记录。
        </p>
        <button
          className="resource-button"
          onClick={() =>
            downloadMarkdown(
              "双创AI使用手册.md",
              "# 双创AI使用手册\n\n" +
                guideSections
                  .map((s) => `## ${s.title}\n\n${s.body}\n\n入口：${s.href}`)
                  .join("\n\n"),
            )
          }
        >
          下载完整手册
        </button>
        <nav style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {guideSections.map((s, i) => (
            <a key={s.title} href={`#guide-${i}`}>
              {s.title}
            </a>
          ))}
        </nav>
      </section>
      {guideSections.map((s, i) => (
        <section key={s.title} id={`guide-${i}`} className="work-panel">
          <h2>{s.title}</h2>
          <p>{s.body}</p>
          <a href={s.href}>打开对应页面 →</a>
        </section>
      ))}
    </LearnChrome>
  );
}

"use client";
import { useState } from "react";
import {
  awardCases,
  awardNotice,
  awardSource,
  starterTemplates,
} from "@/lib/resource-library";
import { downloadWord } from "@/lib/download";

export default function ResourceLibrary({
  kind,
}: {
  kind: "cases" | "templates";
}) {
  const [search, setSearch] = useState("");
  return (
    <section
      className="resource-library"
      aria-label={kind === "cases" ? "往届获奖项目" : "基础教学模板"}
    >
      <h2>
        {kind === "cases"
          ? "往届获奖项目 · 看案例，学方法"
          : "即取即用 · 基础教学模板"}
      </h2>
      <p className="resource-note">
        {kind === "cases"
          ? "简介、奖项来源和视频入口分开标注。学习问题为本站编写，不代表获奖团队原话。"
          : "本站原创填写框架，可免费预览、下载并用 Word/WPS 编辑；专利与合同另附官方资料入口。"}
      </p>
      <label>
        筛选{kind === "cases" ? "项目" : "模板"}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="输入名称或类别"
        />
      </label>
      <div className="resource-grid">
        {kind === "cases"
          ? awardCases
              .filter((c) => JSON.stringify(c).includes(search.trim()))
              .map((c) => (
                <article key={c.id} className="resource-card">
                  <small>
                    {c.award} · {c.category}
                  </small>
                  <h3>{c.title}</h3>
                  <p>{c.school}</p>
                  <p>{c.summary}</p>
                  <p>
                    <strong>学习问题：</strong>
                    {c.lesson}
                  </p>
                  <div className="resource-actions">
                    <a href={c.source} target="_blank" rel="noreferrer">
                      项目来源 ↗
                    </a>
                    <a href={awardSource} target="_blank" rel="noreferrer">
                      奖项核验 ↗
                    </a>
                    <a href={c.video} target="_blank" rel="noreferrer">
                      {c.videoLabel} ↗
                    </a>
                  </div>
                </article>
              ))
          : starterTemplates
              .filter((t) => (t.title + t.category).includes(search.trim()))
              .map((t) => (
                <article key={t.id} className="resource-card">
                  <small>{t.category} · 原创教学模板</small>
                  <h3>{t.title}</h3>
                  <p>{t.intro}</p>
                  <details>
                    <summary>展开内容与填写指导</summary>
                    <pre className="resource-text">{t.content}</pre>
                  </details>
                  <button
                    className="resource-button"
                    onClick={() =>
                      downloadWord(t.id + ".doc", t.title, t.content)
                    }
                  >
                    下载 Word 教学模板
                  </button>
                </article>
              ))}
      </div>
      {kind === "cases" && (
        <p className="resource-note">
          核对日期：2026-09-26 ·{" "}
          <a href={awardNotice} target="_blank" rel="noreferrer">
            教育部获奖通知
          </a>
          。视频为站外分享或合集，可能需要平台登录；无法播放时可先阅读学校来源。本站不复制第三方视频。
        </p>
      )}
    </section>
  );
}

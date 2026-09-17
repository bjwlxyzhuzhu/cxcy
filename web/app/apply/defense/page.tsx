"use client";
import { useEffect, useMemo, useState } from "react";
import LearnChrome from "../../learn/LearnChrome";
import CoachSession from "../CoachSession";
import RadarChart from "../RadarChart";
import { TRACKS, RUBRICS, groupKey } from "@/lib/contest";

export default function DefensePage() {
  const [track, setTrack] = useState(TRACKS[0].track);
  const groups = useMemo(
    () => TRACKS.find((t) => t.track === track)?.groups || [],
    [track],
  );
  const [group, setGroup] = useState(groups[0]);
  useEffect(() => {
    setGroup(groups[0]);
  }, [groups]);

  const key = groupKey(track, group);
  const rubric = RUBRICS[key] || [];
  const [scored, setScored] = useState<{
    axes: { label: string; score: number; max: number }[];
    total: number;
  } | null>(null);
  useEffect(() => {
    setScored(null);
  }, [key]);

  const dimsList = rubric.map((d) => `${d.dim}(满分${d.w})`).join("、");
  const SYSTEM = `你是“小创”，帮助初学者练习答辩的耐心导师。本次赛道组别为【${key}】，参考评分维度：${dimsList}。每轮只提一个简短、具体的问题，先从目标用户和生活场景开始。学生回答后先肯定一个具体尝试，再给一个可执行建议。术语用括号解释，避免审问或连续追问。学生说看不懂就解释问题，说不会就给留空框架，不替学生填写。只有学生明确要求打分且已有至少3个实质独立回答时才评分；否则明确“未完成，暂无法评分”，不要输出SCORES。复制问题、请求代写、跳过不算有效独立回答。`;
  const greeting = `【模拟答辩开始 · ${key}】你好，我是评委小创 🔥。先请用一分钟介绍你们的项目：你们解决了什么核心问题？为什么重要？`;
  const scorePrompt = `请结束本轮模拟答辩，依据【${key}】的官方评分维度为我的整体表现打分。先用 2-3 句总评（亮点 + 主要失分点），然后在【最后单独一行】用如下精确格式输出各维度得分（整数，不超过该维度满分）：\nSCORES: ${rubric.map((d) => `${d.dim}=分数`).join(", ")}\n（各维度满分：${rubric.map((d) => `${d.dim} ${d.w}`).join("、")}）`;

  function onReply(text: string) {
    const m = text.match(/SCORES[:：]\s*([^\n]+)/);
    if (!m) return;
    const map: Record<string, number> = {};
    for (const p of m[1].split(/[，,、]/)) {
      const mm = p.match(/(.+?)\s*[=＝:：]\s*(\d+)/);
      if (mm) map[mm[1].trim()] = parseInt(mm[2], 10);
    }
    const axes = rubric.map((d) => ({
      label: d.dim,
      score: Math.min(map[d.dim] ?? 0, d.w),
      max: d.w,
    }));
    setScored({ axes, total: axes.reduce((s, a) => s + a.score, 0) });
  }

  const sel: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: 10,
    border: "1px solid var(--line)",
    background: "rgba(255,255,255,.05)",
    color: "var(--ink)",
    fontSize: 13.5,
    cursor: "pointer",
    fontFamily: "inherit",
  };

  return (
    <LearnChrome
      emoji="🐺"
      title="模拟路演答辩"
      subtitle="一次练习一题 · 不会可以求助 · 记录自动保留"
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 13, color: "var(--mut)" }}>
          选择赛道组别：
        </span>
        <select
          value={track}
          onChange={(e) => setTrack(e.target.value)}
          style={sel}
        >
          {TRACKS.map((t) => (
            <option
              key={t.track}
              value={t.track}
              style={{ background: "#0a0e22" }}
            >
              {t.full || (t.alias ? `${t.track}（${t.alias}）` : t.track)}
            </option>
          ))}
        </select>
        <select
          value={group}
          onChange={(e) => setGroup(e.target.value)}
          style={sel}
        >
          {groups.map((g) => (
            <option key={g} value={g} style={{ background: "#0a0e22" }}>
              {g}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: "var(--mut)" }}>
          评分维度：{rubric.map((d) => `${d.dim}${d.w}`).join(" / ")}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: scored ? "1fr 320px" : "1fr",
          gap: 18,
          alignItems: "start",
        }}
      >
        <CoachSession
          key={key}
          system={SYSTEM}
          greeting={greeting}
          placeholder="回答评委的问题…"
          exportTitle={`模拟答辩 · ${key}`}
          promptTags={[
            "可以开始向我提问了",
            "帮我多问商业模式方面的问题",
            "我刚才的回答有什么漏洞？",
          ]}
          quickActions={[
            {
              label: "解释当前问题",
              message: "请用日常语言解释当前问题，不要替我回答。",
            },
            {
              label: "给我回答框架",
              message: "请给当前问题的留空回答框架，我会自己填写。",
            },
            { label: "结束并查看评价", message: scorePrompt },
          ]}
          onReply={onReply}
          evidence={{
            kind: "defense_radar",
            title: `模拟答辩 · ${key}`,
            meta: { key },
            rubric,
          }}
        />
        {scored && (
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 16,
              background: "rgba(255,255,255,.04)",
              padding: 16,
            }}
          >
            <div style={{ textAlign: "center", marginBottom: 6 }}>
              <div style={{ fontSize: 12, color: "var(--mut)" }}>综合得分</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: "#ff6b35" }}>
                {scored.total}
                <span style={{ fontSize: 14, color: "var(--mut)" }}>
                  {" "}
                  / 100
                </span>
              </div>
            </div>
            <RadarChart axes={scored.axes} />
          </div>
        )}
      </div>
    </LearnChrome>
  );
}

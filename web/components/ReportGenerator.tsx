"use client";
import { useState } from "react";
import { downloadWord, downloadMarkdown } from "@/lib/download";
import { REPORT_COST } from "@/lib/reward-policy";
export default function ReportGenerator({
  kind,
  track = "",
}: {
  kind: "expert" | "defense";
  track?: string;
}) {
  const [project, setProject] = useState("");
  const [requestId, setRequestId] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const title = kind === "expert" ? "专家打磨完整报告" : "模拟答辩准备稿";
  async function generate() {
    if (busy) return;
    const id = requestId || crypto.randomUUID();
    setRequestId(id);
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/ai/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: id, kind, project, track }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "生成失败");
      setText(d.text);
      setMessage(
        `已保存到我的测试记录。${d.ownKey ? "使用个人API额度" : `当前积分：${d.remaining}`}。`,
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "网络中断，请重试同一请求核对结果",
      );
    } finally {
      setBusy(false);
      window.dispatchEvent(new Event("credits-updated"));
    }
  }
  return (
    <section className="work-panel">
      <h2>一键生成 · {title}</h2>
      <p>
        {kind === "expert"
          ? "得到诊断、改写摘要和下一步行动清单。下方仍可逐题与专家讨论。"
          : "得到开场陈述、评委问题、回答框架与排练清单。准备稿不计入答辩成绩，正式练习仍在下方进行。"}
      </p>
      <p>
        每份{REPORT_COST}积分；失败退还，个人 API Key 不扣平台分。
        <a href="/me/credits">免费获取积分</a>
      </p>
      <label>
        项目材料（30—12000字）
        <textarea
          value={project}
          maxLength={12000}
          disabled={busy || !!requestId}
          onChange={(e) => setProject(e.target.value)}
          placeholder="目标用户、核心问题、解决方案、已有证据、团队与当前困难…"
        />
      </label>
      <div className="resource-actions">
        <button
          className="resource-button"
          disabled={busy || project.trim().length < 30 || !!text}
          onClick={generate}
        >
          {busy
            ? "正在生成并保存…"
            : text
              ? "已生成并保存"
              : requestId
                ? "重试同一请求"
                : `生成${title}`}
        </button>
        <button
          disabled={busy}
          onClick={() => {
            setRequestId("");
            setText("");
            setMessage("");
          }}
        >
          新建请求 / 修改材料
        </button>
      </div>
      <p role="status">{message}</p>
      {requestId && <small>请求编号：{requestId}</small>}
      {text && (
        <>
          <pre className="resource-text">{text}</pre>
          <div className="resource-actions">
            <button
              className="resource-button"
              onClick={() => downloadWord(kind + "-report.doc", title, text)}
            >
              下载 Word
            </button>
            <button onClick={() => downloadMarkdown(kind + "-report.md", text)}>
              下载 Markdown
            </button>
            <a href="/me/records">查看已保存报告</a>
          </div>
        </>
      )}
    </section>
  );
}

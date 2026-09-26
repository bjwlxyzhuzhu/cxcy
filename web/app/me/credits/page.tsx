"use client";
import { useEffect, useState } from "react";
import LearnChrome from "@/app/learn/LearnChrome";
import { REWARDS, REPORT_COST } from "@/lib/reward-policy";
const labels: Record<string, string> = {
  daily: "每日登录奖励",
  reflection: "学习反思奖励",
  chat: "AI 对话",
  tts: "语音播报",
  expert_report: "专家报告",
  defense_report: "答辩准备稿",
  report_refund: "生成失败退还",
  ppt: "幻灯生成",
  image: "图片生成",
};
export default function CreditsPage() {
  const [data, setData] = useState<{
    credits: number;
    entries: {
      action: string;
      amount: number;
      created_at: string;
      content?: string;
    }[];
  } | null>(null);
  const [content, setContent] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const r = await fetch("/api/credits/history");
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "加载失败");
    setData(d);
    window.dispatchEvent(new Event("credits-updated"));
  }
  useEffect(() => {
    refresh().catch((e) => setMessage(e.message));
  }, []);
  async function claim(reflection = false) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch(
        reflection ? "/api/credits/rewards" : "/api/credits/daily",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        },
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "请登录后领取");
      setMessage(
        d.granted
          ? `已获得 ${d.added} 积分`
          : d.message || "今日已领取，不会重复发放",
      );
      if (reflection && d.granted) setContent("");
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "请求失败，请重试");
    } finally {
      setBusy(false);
    }
  }
  return (
    <LearnChrome emoji="✦" title="积分中心" subtitle="通过学习持续补充积分">
      <section className="work-panel">
        <h2>当前余额：{data ? data.credits : "—"}</h2>
        <p>
          每天登录 +{REWARDS.daily}；提交一份学习反思 +{REWARDS.reflection}
          （每天一次）。均按北京时间自然日计算。
        </p>
        <button
          className="resource-button"
          disabled={busy}
          onClick={() => claim()}
        >
          领取今日登录奖励
        </button>
        <p>
          尚未登录？<a href="/login">前往登录</a>
        </p>
      </section>
      <section className="work-panel">
        <h2>学习反思 · +{REWARDS.reflection}</h2>
        <p>
          记录今天学到了什么、有哪些依据、接下来准备验证什么。仅自己可查，暂不设公开讨论区。80—2000字，同一内容不能重复领分。
        </p>
        <label>
          我的学习反思
          <textarea
            maxLength={2000}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </label>
        <p>{content.trim().length} / 2000字</p>
        <button
          className="resource-button"
          disabled={busy || content.trim().length < 80}
          onClick={() => claim(true)}
        >
          保存反思并领取积分
        </button>
      </section>
      <p role="status" style={{ margin: "16px 0" }}>
        {message}
      </p>
      <section className="work-panel">
        <h2>使用规则</h2>
        <p>
          普通文本问答每次1分；完整专家报告 / 答辩准备稿每份{REPORT_COST}
          分；语音每次1分。其他生成操作以对应模块提示为准。绑定个人 API Key
          的调用不扣平台积分。
        </p>
        <p>
          新报告生成先预扣积分；生成失败自动退还，重复提交同一请求不重复收费。案例阅读、模板下载、查看历史记录免费。积分为学习额度，不兑换现金。
        </p>
        <a href="/learn/cases">去看获奖案例</a> ·{" "}
        <a href="/learn/templates">免费使用模板</a>
      </section>
      <section className="work-panel" style={{ overflowX: "auto" }}>
        <h2>最近100条积分记录</h2>
        <p>旧版登录奖励没有流水，历史余额保留；新奖励与消耗在此列出。</p>
        <table>
          <thead>
            <tr>
              <th>时间（北京时间）</th>
              <th>事项</th>
              <th>变动</th>
            </tr>
          </thead>
          <tbody>
            {data?.entries.map((e, i) => (
              <tr key={i}>
                <td>
                  {new Date(e.created_at).toLocaleString("zh-CN", {
                    timeZone: "Asia/Shanghai",
                  })}
                </td>
                <td>
                  {labels[e.action] || e.action}
                  {e.content && (
                    <details>
                      <summary>查看我的反思</summary>
                      <p>{e.content}</p>
                    </details>
                  )}
                </td>
                <td>
                  {e.amount > 0 ? "+" : ""}
                  {e.amount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.entries.length === 0 && <p>暂无记录，领取今日奖励即可开始。</p>}
      </section>
    </LearnChrome>
  );
}

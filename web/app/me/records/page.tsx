"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import LearnChrome from "@/app/learn/LearnChrome";
import RecordExport from "@/components/RecordExport";
type Session = {
  id: string;
  module: string;
  title: string;
  updated_at: string;
};
export default function Records() {
  const [sessions, setSessions] = useState<Session[]>([]),
    [selected, setSelected] = useState<Session | null>(null),
    [records, setRecords] = useState<
      { role: string; content: string; created_at: string }[]
    >([]),
    [error, setError] = useState(""),
    [more, setMore] = useState(false);
  async function load(offset = 0) {
    try {
      const r = await fetch("/api/records?offset=" + offset);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSessions((s) => (offset ? [...s, ...d.sessions] : d.sessions));
      setMore(d.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function view(s: Session) {
    setError("");
    try {
      const r = await fetch("/api/records?sessionId=" + s.id);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSelected(s);
      setRecords(d.records);
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取失败");
    }
  }
  return (
    <LearnChrome
      emoji="📚"
      title="我的测试记录"
      subtitle="退出登录后仍保留，重新登录即可查看"
    >
      <p>
        每次提交的原话和AI回复都会保存到当前账号。课堂实验请进入
        <Link href="/experiment">实验入口</Link>恢复。
      </p>
      {error && (
        <p role="alert">
          {error} <button onClick={() => load()}>重试</button>
        </p>
      )}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <aside style={{ flex: "1 1 260px" }}>
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => view(s)}
              style={{
                display: "block",
                width: "100%",
                padding: 14,
                marginBottom: 8,
                textAlign: "left",
                background: "rgba(255,255,255,.06)",
                color: "inherit",
                border: "1px solid var(--line)",
                borderRadius: 10,
              }}
            >
              {s.title}
              <small style={{ display: "block" }}>
                {new Date(s.updated_at).toLocaleString("zh-CN")}
              </small>
            </button>
          ))}
          {!sessions.length && !error && (
            <p>还没有保存的记录。完成一次对话后会出现在这里。</p>
          )}
          {more && (
            <button onClick={() => load(sessions.length)}>加载更多</button>
          )}
        </aside>
        <section style={{ flex: "2 1 400px", minWidth: 0 }}>
          {selected && (
            <>
              <h2>{selected.title}</h2>
              <RecordExport
                endpoint={"/api/records/export?sessionId=" + selected.id}
              />
              <p>
                <Link
                  href={
                    selected.module === "learn"
                      ? "/learn/theory"
                      : "/apply/" + selected.module + "?sessionId=" + selected.id
                  }
                >
                  回到模块继续
                </Link>
              </p>
              {records.map((r, i) => (
                <article
                  key={i}
                  style={{
                    padding: 14,
                    borderBottom: "1px solid var(--line)",
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                  }}
                >
                  <b>{r.role === "user" ? "我的原话" : "AI回复"}</b>
                  <p>{r.content}</p>
                </article>
              ))}
            </>
          )}
        </section>
      </div>
    </LearnChrome>
  );
}

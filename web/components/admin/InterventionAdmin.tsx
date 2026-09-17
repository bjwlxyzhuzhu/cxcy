"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
type Card = {
  id: number;
  user_id: string | null;
  sharp: string;
  evidence: string;
  advice: string;
  status: string;
  student_note: string;
  teacher_note: string;
  created_at: string;
  resolved_at: string | null;
  context: {
    kind?: string;
    run_id?: string;
    run_title?: string;
    group_label?: string;
    participant_code?: string;
    title?: string;
    source?: string;
    excerpts?: string[];
  };
  student: { name: string; student_no: string } | null;
};
const STATUS: Record<string, string> = {
  open: "待学生回应",
  accepted: "已接受",
  improved: "学生反馈已改进",
  disputed: "申诉中",
  retracted: "已撤回",
};
export default function InterventionAdmin() {
  const [cards, setCards] = useState<Card[]>([]),
    [total, setTotal] = useState(0),
    [more, setMore] = useState(false),
    [pending, setPending] = useState(false);
  const [kind, setKind] = useState("overview");
  const [status, setStatus] = useState(""),
    [cohort, setCohort] = useState(""),
    [runId, setRunId] = useState("");
  const [runs, setRuns] = useState<{ id: string; title: string }[]>([]),
    [error, setError] = useState(""),
    [refreshed, setRefreshed] = useState(""),
    [busy, setBusy] = useState(false);
  const [noteFor, setNoteFor] = useState<number | null>(null),
    [note, setNote] = useState("");
  const load = useCallback(
    async (offset = 0) => {
      try {
        const r = await fetch(
          "/api/interventions?all=1&" +
            new URLSearchParams({
              status,
              cohort,
              runId,
              kind,
              offset: String(offset),
            }),
          { signal: AbortSignal.timeout(30000) },
        );
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setCards((old) =>
          offset
            ? [
                ...old,
                ...d.cards.filter((c: Card) => !old.some((o) => o.id === c.id)),
              ]
            : d.cards,
        );
        setTotal(d.total);
        setMore(d.hasMore);
        setPending(d.hasPending);
        setRuns(d.runs);
        setRefreshed(d.refreshedAt);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "读取失败，请重试");
      }
    },
    [status, cohort, runId, kind],
  );
  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (!document.hidden) void load();
    }, 30000);
    return () => clearInterval(t);
  }, [load]);
  async function act(id: number, action: string, note: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/interventions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, note }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setNoteFor(null);
      setNote("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }
  const selectStyle = {
    color: "#111",
    background: "#fff",
    padding: 8,
    borderRadius: 8,
    maxWidth: "100%",
  };
  return (
    <section style={{ lineHeight: 1.8 }}>
      <h2>干预督导与测试复盘</h2>
      <p>
        每位学生有一张“个人历史综合督导卡”，自动回查已保存的成长证据、项目、方案版本、历史答辩与对话，以及新课堂实验；新数据更新原卡。没有记录时明确标为待核对，不编造评价。匿名课堂按原参与编号单独保留。
      </p>
      <p>
        数量没有“三张”上限。学生完成普通练习回复、课堂跳过/多次求助/完成实验时自动更新；关闭课堂时检查前后测缺项。后台每30秒补查新增记录，无需学生打开成长星图。
      </p>
      <p>
        同一次练习、同一规则更新原卡，不反复发卡；不同实验分别生成。新卡根据已保存记录生成，属于教学支持提示，不是能力诊断。学生回应与教师备注会保留；已撤回的卡不会自动重发。
      </p>
      <div
        style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "16px 0" }}
      >
        <label>
          卡片类型{" "}
          <select
            aria-label="督导卡片类型"
            style={selectStyle}
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setRunId("");
              setCohort("");
            }}
          >
            <option value="overview">个人历史综合卡（每人一张）</option>
            <option value="experiment">课堂实验提示</option>
            <option value="learning">普通练习复盘</option>
            <option value="">全部（含历史卡片）</option>
          </select>
        </label>
        <label>
          实验{" "}
          <select
            aria-label="督导实验筛选"
            style={selectStyle}
            value={runId}
            onChange={(e) => {
              setRunId(e.target.value);
              if (e.target.value) setKind("experiment");
            }}
          >
            <option value="">全部实验及普通练习</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          分组{" "}
          <select
            aria-label="督导分组筛选"
            style={selectStyle}
            value={cohort}
            onChange={(e) => {
              setCohort(e.target.value);
              if (e.target.value) setKind("experiment");
            }}
          >
            <option value="">全部分组</option>
            <option value="single">A组·综合专家</option>
            <option value="panel">B组·五位专家</option>
          </select>
        </label>
        <label>
          状态{" "}
          <select
            aria-label="督导状态筛选"
            style={selectStyle}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">全部状态</option>
            {Object.entries(STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => void load()}>检查新增记录并刷新</button>
      </div>
      {error && (
        <p role="alert" style={{ color: "#ff9c9c" }}>
          {error}
        </p>
      )}
      <p role="status">
        筛选结果共 {total} 张，已显示 {cards.length} 张。
        {refreshed &&
          "最后检查：" + new Date(refreshed).toLocaleTimeString("zh-CN")}
        {pending && "；仍有历史记录待补查，下次刷新继续。"}
      </p>
      {!cards.length && !error && (
        <p>
          当前没有符合筛选的卡片。未提交、没有命中课堂提示条件，或教师演示账号不会自动生成新的学生卡。
        </p>
      )}
      {cards.map((c) => (
        <article
          key={c.id}
          style={{
            padding: 18,
            border: "1px solid var(--line)",
            borderRadius: 14,
            marginBottom: 12,
            background: "rgba(255,255,255,.03)",
          }}
        >
          <b>
            🦉{" "}
            {c.student
              ? c.student.name + " · " + c.student.student_no
              : "匿名参与者 " + (c.context.participant_code || "")}
          </b>
          　
          <span>
            {STATUS[c.status] || c.status}
            {c.resolved_at ? " · 触发条件已消失" : ""}
          </span>
          <p>
            {c.context.kind === "experiment"
              ? `${c.context.run_title} · ${c.context.group_label} · ${c.context.participant_code}`
              : c.context.kind === "overview"
                ? "个人历史综合督导 · 按账号归属汇总"
                : c.context.kind === "learning"
                  ? "普通练习 · " + c.context.title + "（无实验分组/前后测）"
                  : "历史证据链规则卡"}
          </p>
          <h3>{c.sharp}</h3>
          <p>依据：{c.evidence}</p>
          <p>建议：{c.advice}</p>
          {!!c.context.excerpts?.length && (
            <details>
              <summary>查看生成依据：已保存的历史原文片段</summary>
              {c.context.excerpts.map((s, i) => (
                <p key={i} style={{ whiteSpace: "pre-wrap" }}>
                  {s}
                </p>
              ))}
            </details>
          )}
          {c.student_note && <p>学生回应：{c.student_note}</p>}
          {c.teacher_note && <p>教师备注：{c.teacher_note}</p>}
          <small>
            生成时间：{new Date(c.created_at).toLocaleString("zh-CN")} ·{" "}
            {c.context.source ? "已保存记录的规则提示" : "历史AI辅助提示"}
          </small>
          <p>
            <Link
              href={
                c.context.run_id
                  ? "/admin?tab=experiment&run=" + c.context.run_id
                  : "/admin?tab=experiment&student=" + c.user_id
              }
            >
              查看对应测试记录 →
            </Link>
            {c.user_id && (
              <>
                　
                <Link href={"/me/growth?user=" + c.user_id}>
                  查看成长星图 →
                </Link>
              </>
            )}
          </p>
          <button
            disabled={busy || c.status === "retracted"}
            onClick={() => void act(c.id, "retract", "教师复核后撤回本卡")}
          >
            撤回卡片
          </button>
          　
          <button
            disabled={busy}
            onClick={() => {
              setNoteFor(c.id);
              setNote(c.teacher_note || "");
            }}
          >
            写教师备注
          </button>
          {noteFor === c.id && (
            <div>
              <label>
                教师备注（学生可见）
                <textarea
                  style={{
                    display: "block",
                    width: "100%",
                    background: "#15243c",
                    color: "white",
                    padding: 10,
                  }}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button
                disabled={busy || !note.trim()}
                onClick={() => void act(c.id, "note", note)}
              >
                保存备注
              </button>
            </div>
          )}
        </article>
      ))}
      {more && (
        <button onClick={() => void load(cards.length)}>加载更多督导卡</button>
      )}
    </section>
  );
}

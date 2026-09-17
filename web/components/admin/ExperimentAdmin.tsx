"use client";
import { useEffect, useState } from "react";
import RecordExport from "@/components/RecordExport";
import { STAGE_LABELS } from "@/lib/experiment-protocol";
type Run = {
  id: string;
  title: string;
  join_code: string;
  status: string;
  participants: number;
  protocol_version: string;
};
type Participant = {
  id: string;
  participant_code: string;
  student_no: string | null;
  cohort: string;
  stage: string;
  paired: boolean;
  completed: boolean;
  answers: number;
  skipped: number;
  help: number;
};
type Session = {
  id: string;
  student_no: string;
  title: string;
  updated_at: string;
};
export default function ExperimentAdmin() {
  const [runs, setRuns] = useState<Run[]>([]),
    [sessions, setSessions] = useState<Session[]>([]),
    [run, setRun] = useState<Run | null>(null),
    [participants, setParticipants] = useState<Participant[]>([]),
    [title, setTitle] = useState("双创课堂练习"),
    [msg, setMsg] = useState(""),
    [busy, setBusy] = useState(false),
    [more, setMore] = useState(false),
    [detail, setDetail] = useState<
      { role: string; content: string; label?: string }[] | null
    >(null),
    [closing, setClosing] = useState(false);
  const [events, setEvents] = useState<
    {
      participant_id: string;
      event_type: string;
      stage: string;
      payload: Record<string, unknown>;
    }[]
  >([]);
  async function load(offset = 0) {
    try {
      const r = await fetch(
        "/api/admin/records?offset=" +
          offset +
          "&userId=" +
          (new URLSearchParams(window.location.search).get("student") || ""),
      );
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRuns(d.runs);
      setSessions((s) => (offset ? [...s, ...d.sessions] : d.sessions));
      setMore(d.hasMore);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "读取失败");
    }
  }
  async function select(id: string) {
    setClosing(false);
    try {
      const r = await fetch("/api/admin/records?runId=" + id);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setRun(d.run);
      setParticipants(d.participants);
      setEvents(d.events || []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "读取失败");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!run) return;
    const id = run.id;
    const t = setInterval(() => void select(id), 15000);
    return () => clearInterval(t);
  }, [run?.id]);
  async function action(action: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/experiment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, title, runId: run?.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
      await select(d.id);
      setMsg(
        action === "teacher_create"
          ? "已创建，请将实验码发给学生"
          : "状态已更新",
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }
  async function view(id: string) {
    try {
      const r = await fetch("/api/admin/records?sessionId=" + id);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDetail(d.records);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "读取失败");
    }
  }
  return (
    <div style={{ lineHeight: 1.8 }}>
      <h2>课堂实验与测试记录</h2>
      <p>
        ① 创建实验 → ② 把实验码和 /experiment 地址发给学生 → ③ 开放实验 → ④
        查看进度并导出。学生按完成情况前进，不强制限时。
      </p>
      <p>
        A组为综合专家，B组为五位专家；按加入顺序交替分配，不宣称随机分组。两组问题数量一致。历史实验单独保留。
      </p>
      <input
        aria-label="实验名称"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{ padding: 10, color: "#111", width: "min(100%,420px)" }}
      />
      <button disabled={busy} onClick={() => action("teacher_create")}>
        创建新版实验
      </button>
      <p role="status">{msg}</p>
      <label>
        已有实验{" "}
        <select
          value={run?.id || ""}
          onChange={(e) => e.target.value && select(e.target.value)}
          style={{ color: "#111", maxWidth: "100%" }}
        >
          <option value="">选择实验</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title} · {r.join_code} · {r.participants}人 · {r.status}
            </option>
          ))}
        </select>
      </label>
      {run && (
        <section
          style={{
            border: "1px solid var(--line)",
            padding: 16,
            margin: "16px 0",
          }}
        >
          <h3>{run.title}</h3>
          <p>
            实验码：<b style={{ fontSize: 26 }}>{run.join_code}</b>　状态：
            {run.status}　协议：{run.protocol_version}
          </p>
          {run.status === "draft" && (
            <button disabled={busy} onClick={() => action("teacher_start")}>
              开放实验
            </button>
          )}
          {run.status === "active" &&
            (closing ? (
              <span>
                关闭后学生只能查看和导出。
                <button disabled={busy} onClick={() => action("teacher_close")}>
                  确认关闭本次实验
                </button>
                <button onClick={() => setClosing(false)}>取消</button>
              </span>
            ) : (
              <button onClick={() => setClosing(true)}>关闭实验</button>
            ))}
          <button onClick={() => select(run.id)}>刷新进度</button>
          <p>
            已完成 {participants.filter((p) => p.completed).length} /{" "}
            {participants.length}；前后测可配对{" "}
            {participants.filter((p) => p.paired).length}
            。这只是完成情况，不是能力提升统计。
          </p>
          <RecordExport
            endpoint={"/api/admin/records?runId=" + run.id}
            label="导出本次实验"
          />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", marginTop: 14 }}>
              <thead>
                <tr>
                  {[
                    "固定编号 / 账号",
                    "分组",
                    "当前步骤",
                    "前后测",
                    "回答/跳过",
                    "求助",
                    "个人记录",
                  ].map((v) => (
                    <th key={v}>{v}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {participants.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.participant_code}
                      <small style={{ display: "block" }}>
                        {p.student_no || "匿名参加"}
                      </small>
                    </td>
                    <td>{p.cohort === "single" ? "A 综合" : "B 五位"}</td>
                    <td>{STAGE_LABELS[p.stage] || p.stage}</td>
                    <td>{p.paired ? "已配对" : "有缺项"}</td>
                    <td>
                      {p.answers}/{p.skipped}
                    </td>
                    <td>{p.help}</td>
                    <td>
                      <button
                        onClick={() =>
                          setDetail(
                            events
                              .filter((e) => e.participant_id === p.id)
                              .map((e) => ({
                                role: e.event_type,
                                label:
                                  (STAGE_LABELS[e.stage] || e.stage) +
                                  " · " +
                                  e.event_type,
                                content:
                                  typeof e.payload.text === "string"
                                    ? e.payload.text
                                    : JSON.stringify(e.payload, null, 2),
                              })),
                          )
                        }
                      >
                        查看个人记录
                      </button>
                      <RecordExport
                        endpoint={
                          "/api/admin/records?runId=" +
                          run.id +
                          "&participantId=" +
                          p.id
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <h3>账号测试记录</h3>
      <p>
        <a href="/admin?tab=experiment">查看全部学生</a>
      </p>
      <p>
        各模块对话自动同步到这里。此处含账号身份，仅供教学管理；科研匿名数据请使用“研究数据导出”。自由文本发布前仍需检查学生自行填写的个人信息。
      </p>
      <button onClick={() => load()}>刷新账号记录</button>
      {sessions.map((s) => (
        <div
          key={s.id}
          style={{
            padding: 12,
            borderBottom: "1px solid var(--line)",
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <span>
            {s.student_no} · {s.title} ·{" "}
            {new Date(s.updated_at).toLocaleString()}
          </span>
          <button onClick={() => view(s.id)}>查看全文</button>
          <RecordExport endpoint={"/api/admin/records?sessionId=" + s.id} />
        </div>
      ))}
      {more && <button onClick={() => load(sessions.length)}>加载更多</button>}
      {detail && (
        <section>
          <h3>完整对话</h3>
          <button onClick={() => setDetail(null)}>收起</button>
          {detail.map((r, i) => (
            <p
              key={i}
              style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
            >
              <b>{r.label || (r.role === "user" ? "学生原话" : "AI回复")}：</b>
              {r.content}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

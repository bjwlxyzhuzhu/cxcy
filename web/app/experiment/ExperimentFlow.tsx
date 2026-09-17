"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  GUIDES,
  MODULE_PATHS,
  SCENARIOS,
  experimentPath,
  type Scenario,
} from "@/lib/experiment-scenarios";
import RecordExport from "@/components/RecordExport";
import {
  STAGE_LABELS,
  STEPS,
  CORE_ITEMS,
  replies,
  completionProblem,
  summarize,
  type ExpEvent,
} from "@/lib/experiment-protocol";
type P = {
  id: string;
  participant_code: string;
  cohort: string;
  run_title: string;
  stage: string;
  protocol_version: string;
  recovery_code: string;
};
type Draft = {
  text: string;
  judgment: string;
  assumptions: string;
  risk: string;
  confidence: number;
  change: string;
  rating: number;
};
const empty: Draft = {
  text: "",
  judgment: "",
  assumptions: "",
  risk: "",
  confidence: 0,
  change: "",
  rating: 0,
};
export default function Experiment() {
  const router = useRouter();
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [myExperiments, setMyExperiments] = useState<
    { id: string; title: string; stage: string; participant_code: string }[]
  >([]);
  const requestSerial = useRef(0);
  const [p, setP] = useState<P | null>(null),
    [stage, setStage] = useState("waiting"),
    [events, setEvents] = useState<ExpEvent[]>([]),
    [caseText, setCase] = useState(""),
    [draft, setDraft] = useState<Draft>(empty);
  const [code, setCode] = useState(""),
    [recovery, setRecovery] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [save, setSave] = useState(""),
    [help, setHelp] = useState(""),
    [ready, setReady] = useState(false);
  const [exportStage, setExportStage] = useState("t0");
  const loadedStage = useRef("");
  const pending = useRef<{ body: string; id: string } | null>(null);
  async function load() {
    const serial = ++requestSerial.current;
    const r = await fetch("/api/experiment", {
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error);
    if (serial !== requestSerial.current) return;
    setP(d.participant);
    setReady(true);
    if (d.participant) {
      setCase(d.caseText);
      setScenario(d.scenario || SCENARIOS[0]);
      setEvents(d.events || []);
      setStage(d.stage.key);
      const key = d.participant.id + ":" + d.stage.key;
      if (loadedStage.current !== key) {
        loadedStage.current = key;
        let local = null;
        try {
          local = JSON.parse(
            localStorage.getItem("experiment-draft:" + key) || "null",
          );
        } catch {}
        const server = d.drafts?.find(
          (x: { stage: string }) => x.stage === d.stage.key,
        );
        const latest =
          local && (!server || local.updated_at > server.updated_at)
            ? local.payload
            : server?.payload;
        const answerStage = ["expert", "defense"].includes(d.stage.key);
        const currentRound = replies(d.events || [], d.stage.key).length + 1;
        setDraft({
          ...empty,
          ...latest,
          ...(answerStage && latest?.round !== currentRound
            ? { text: "" }
            : {}),
        });
        setHelp("");
        setSave(latest ? "已恢复本阶段草稿" : "输入后自动保存草稿");
        requestAnimationFrame(() =>
          stageHeading.current?.scrollIntoView({ block: "start" }),
        );
      }
      const target = experimentPath(d.stage.key);
      if (window.location.pathname + window.location.search !== target)
        router.replace(target);
    } else {
      loadedStage.current = "";
      setMyExperiments(d.myExperiments || []);
    }
  }
  useEffect(() => {
    void load().catch((e) => {
      setMessage(e.message);
      setReady(true);
    });
    const timer = setInterval(() => {
      void load().catch(() => setSave("连接中断，本地草稿保留，请稍后重试"));
    }, 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (
      !p ||
      !STEPS.includes(stage as (typeof STEPS)[number]) ||
      stage === "completed"
    )
      return;
    const key = p.id + ":" + stage;
    const updated_at = new Date().toISOString();
    const payload = { ...draft, round: replies(events, stage).length + 1 };
    try {
      localStorage.setItem(
        "experiment-draft:" + key,
        JSON.stringify({ payload, updated_at }),
      );
    } catch {
      setSave("浏览器无法保存草稿，正在尝试云端保存");
    }
    const timer = setTimeout(async () => {
      try {
        const r = await fetch("/api/experiment", {
          signal: AbortSignal.timeout(12000),
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "draft", stage, payload }),
        });
        if (!r.ok) throw new Error();
        setSave("草稿已同步到服务器");
      } catch {
        setSave("草稿尚未同步，请保留页面并重试；已提交记录不受影响");
      }
    }, 900);
    return () => clearTimeout(timer);
  }, [draft, p?.id, stage, events.length]);
  function update(key: keyof Draft, value: string | number) {
    setSave("正在保存草稿…");
    setDraft((d) => ({ ...d, [key]: value }));
  }
  async function act(action: string, extra: Record<string, unknown> = {}) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    const body = JSON.stringify({ action, stage, ...extra });
    const id =
      pending.current?.body === body ? pending.current.id : crypto.randomUUID();
    pending.current = { body, id };
    try {
      const r = await fetch("/api/experiment", {
        signal: AbortSignal.timeout(15000),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...JSON.parse(body), requestId: id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      pending.current = null;
      if (action === "leave") {
        setP(null);
        loadedStage.current = "";
        setMessage("记录已保留，可用恢复码或原账号再次加入");
        router.replace("/experiment");
        await load();
      } else {
        if (action === "reply") {
          setDraft((x) => ({ ...x, text: "" }));
          setHelp("");
        }
        await load();
        setMessage("已保存到服务器");
      }
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "操作失败，内容仍保留，请重试",
      );
    } finally {
      setBusy(false);
    }
  }
  async function ask(kind: string) {
    setBusy(true);
    try {
      const r = await fetch("/api/experiment/ai", {
        signal: AbortSignal.timeout(35000),
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, kind }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setHelp(d.text);
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "求助失败");
    } finally {
      setBusy(false);
    }
  }
  const round = replies(events, stage).length + 1;
  const total = stage === "expert" ? 5 : 3;
  const question = events.find(
    (e) =>
      e.stage === stage &&
      e.event_type === "question" &&
      e.payload.round === round,
  );
  const problem = completionProblem(stage, events);
  const summary = summarize(events);
  const submitted = events.some(
    (e) =>
      e.stage === stage &&
      e.event_type === (stage === "survey" ? "survey" : "assessment"),
  );
  return (
    <main className="experiment-page">
      <style>{`
 .experiment-page{max-width:980px;margin:auto;padding:30px 20px 70px;color:#eef5ff}
 .experiment-page h1{font-size:28px}.experiment-page h2{font-size:21px}
 .experiment-page section{padding:22px;margin:18px 0;border:1px solid #40506c;background:#0d1830;border-radius:14px}
 .experiment-page p{line-height:1.8}.experiment-page label{display:block;margin:14px 0}
 .experiment-page input:not([type=checkbox]),.experiment-page textarea,.experiment-page select{display:block;width:100%;padding:12px;margin-top:8px;background:#17263d;border:1px solid #62738f;border-radius:8px;color:white;font:inherit}
 .experiment-page textarea{min-height:115px;resize:vertical}.experiment-page button{padding:10px 15px;margin:6px 8px 6px 0;border:0;border-radius:8px;background:#8bdde8;color:#071722;font-weight:700;cursor:pointer}
 .experiment-page button:disabled{opacity:.5;cursor:default}.experiment-page a{color:#80e5ef}.experiment-page small{color:#b8c8df}
 .experiment-page .steps{display:flex;gap:10px;flex-wrap:wrap;font-size:13px}.experiment-page .steps span{padding:7px;border-bottom:2px solid #50617a}
 .experiment-page .steps [aria-current=step]{border-color:#80e5ef;color:#80e5ef}
 .experiment-page ol{list-style:decimal;padding-left:24px;margin:12px 0}.experiment-page li{margin:7px 0;line-height:1.6}.experiment-page h2{scroll-margin-top:20px}
 .experiment-page .question{font-size:19px;line-height:1.8}.experiment-page article{white-space:pre-wrap;overflow-wrap:anywhere;border-top:1px solid #394960;padding:12px 0}
 `}</style>
      <Link href="/">返回首页</Link> ·{" "}
      <Link href="/me/records">账号测试记录</Link>
      <h1>{p ? p.run_title : "双创课堂实验"}</h1>
      <p role="status" aria-live="polite">
        {busy ? "正在保存或读取，请稍候…" : message}
      </p>
      <details open={!p}>
        <summary>操作指导：第一次参加请先读这里</summary>
        <p>
          老师：到管理后台 →
          课堂实验，选择实验一、实验二、实验三或自定义案例，创建后点击“开放实验”，将实验码发给学生。每个案例可开设多场课堂。
        </p>
        <p>
          学生：登录 → 输入老师发的实验码 → 前测 → 项目导读 → 驾驶舱写 V0 →
          专家打磨5轮并写 V1 → 模拟答辩3题 → 后测 → 学习反馈 →
          导出。多数步骤点击一个“提交并进入…”按钮即可跳转。
        </p>
        <p>
          驾驶舱、专家打磨和答辩会自动打开对应页面的“课堂实验模式”。系统带入本次案例、方案与历史回答，无需复制粘贴。不要另开普通练习代替课堂步骤。
        </p>
        <p>
          输入会自动保存为草稿，但草稿不算正式提交。以“已保存到服务器”和当前步骤为准；断网时保留页面，恢复网络后重试。刷新、退出和换设备不清除已经提交的记录。
        </p>
      </details>
      {!ready ? (
        <p>正在读取记录…</p>
      ) : !p ? (
        <section>
          {myExperiments.length > 0 && (
            <>
              <h2>继续我参加过的实验</h2>
              {myExperiments.map((r) => (
                <p key={r.id}>
                  <b>{r.title}</b> · {STAGE_LABELS[r.stage] || "已加入"} ·{" "}
                  {r.participant_code}
                  <button
                    disabled={busy}
                    onClick={() => act("resume", { runId: r.id })}
                  >
                    继续或查看记录
                  </button>
                </p>
              ))}
            </>
          )}
          <h2>第一次参加</h2>
          <p>
            建议先<Link href="/login">登录账号</Link>
            ，再输入老师的实验码。再次登录后输入同一实验码，会恢复原编号和记录。
          </p>
          <label>
            实验码
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />{" "}
            同意本次课堂过程数据用于教学研究
          </label>
          <button
            disabled={busy || !consent || !code}
            onClick={() => act("join", { joinCode: code, consent })}
          >
            加入或恢复我的实验
          </button>
          <hr />
          <h2>已有恢复码</h2>
          <p>
            匿名参加或更换设备时，用恢复码找回记录。不要把恢复码发给其他同学。
          </p>
          <label>
            恢复码
            <input
              value={recovery}
              onChange={(e) => setRecovery(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !recovery}
            onClick={() => act("restore", { recoveryCode: recovery })}
          >
            恢复记录
          </button>
          <button onClick={() => load().catch((e) => setMessage(e.message))}>
            重新读取
          </button>
          <details>
            <summary>有哪些实验主题？</summary>
            <p>
              以下为可选题材。请使用老师为对应题材创建的实验码加入；一个编号对应一场实验，不在前后测之间换题材。
            </p>
            {SCENARIOS.map((s) => (
              <article key={s.id}>
                <h3>{s.title}</h3>
                <p>{s.plain}</p>
              </article>
            ))}
          </details>
        </section>
      ) : (
        <>
          <p>
            固定编号：<b>{p.participant_code}</b>　
            {p.cohort === "panel"
              ? "B组：五位专家，每位一轮"
              : "A组：一位综合专家，五个角度"}
          </p>
          <details>
            <summary>查看恢复码（请妥善保存）</summary>
            <p style={{ overflowWrap: "anywhere" }}>{p.recovery_code}</p>
            <p>编号用于数据配对；恢复码用于找回自己的记录。</p>
          </details>
          <nav className="steps" aria-label="实验步骤">
            {STEPS.map((s) => (
              <span key={s} aria-current={s === stage ? "step" : undefined}>
                {STAGE_LABELS[s]}
              </span>
            ))}
          </nav>
          <p>
            按自己的节奏完成，系统不会到点清空或强制换题。不会回答时先求助，也可写明原因后跳过。
          </p>
          <section>
            <h2>{scenario.title}</h2>
            <small>
              本场实验题材固定。其他题材请完成或退出后使用另一个实验码加入，原记录会保留。
            </small>
            <p>{caseText}</p>
            <details>
              <summary>用简单的话理解项目</summary>
              <p>{scenario.plain}</p>
              <p>
                商业计划书＝说明给谁用、解决什么问题、怎样运营。假设＝还没确认、需要验证的想法。验证＝通过访谈或试用收集信息。证据＝实际观察、记录或可靠资料。
              </p>
            </details>
          </section>
          <section>
            <h2 ref={stageHeading} tabIndex={-1}>
              {STAGE_LABELS[stage] || "旧版实验记录"}
            </h2>
            {GUIDES[stage] && (
              <aside
                style={{ background: "#16273e", padding: 16, borderRadius: 10 }}
              >
                <b>本步目标：{GUIDES[stage].goal}</b>
                <ol>
                  {GUIDES[stage].steps.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <p>完成后：{GUIDES[stage].result}</p>
                <details>
                  <summary>随时查看本次案例</summary>
                  <p>{scenario.caseText}</p>
                  <p>{scenario.plain}</p>
                </details>
              </aside>
            )}
            {MODULE_PATHS[stage] && (
              <>
                <p>
                  <strong>课堂实验模式 · 内容已对接</strong>　固定编号{" "}
                  {p.participant_code}，与课堂总记录实时共用。
                </p>
                <details open>
                  <summary>已带入的方案与前序记录</summary>
                  {events.filter((e) =>
                    ["plan", "revision"].includes(e.event_type),
                  ).length === 0 ? (
                    <p>这是你的第一份方案，请在下方写 V0。</p>
                  ) : (
                    events
                      .filter((e) =>
                        ["plan", "revision"].includes(e.event_type),
                      )
                      .map((e, i) => (
                        <article key={e.id || i}>
                          <b>
                            {String(e.payload.version)} ·{" "}
                            {STAGE_LABELS[e.stage]}
                          </b>
                          <p>{String(e.payload.text)}</p>
                        </article>
                      ))
                  )}
                  {stage === "defense" && (
                    <details>
                      <summary>回看5轮专家打磨</summary>
                      {events
                        .filter(
                          (e) =>
                            e.stage === "expert" && e.event_type === "reply",
                        )
                        .map((e, i) => (
                          <article key={e.id || i}>
                            <b>
                              第{String(e.payload.round)}题：
                              {String(e.payload.question)}
                            </b>
                            <p>{String(e.payload.text)}</p>
                          </article>
                        ))}
                    </details>
                  )}
                </details>
                <p>
                  <Link href="/experiment">
                    回到课堂实验总入口（自动定位当前步骤）
                  </Link>
                </p>
              </>
            )}
            {p.protocol_version !== "guided-v2" ? (
              <p>
                这是旧版实验，可查看和导出原记录。新版流程请老师另建实验，不覆盖原始数据。
              </p>
            ) : stage === "waiting" ? (
              <p>已加入，等老师点击“开放实验”。页面会自动刷新。</p>
            ) : stage === "closed" || stage === "completed" ? (
              <>
                <p>
                  {stage === "completed"
                    ? "本次流程已完成。"
                    : "老师已关闭本次实验。"}
                  你的记录仍然保留。
                </p>
                <p>
                  前测：{summary.pre ? "已提交" : "未提交"}；后测：
                  {summary.post ? "已提交" : "未提交"}；回答 {summary.answers}{" "}
                  条；跳过 {summary.skipped} 条。未完成不会自动记为0分。
                </p>
              </>
            ) : (
              <>
                {(stage === "t0" || stage === "t1") && (
                  <>
                    <p>
                      请独立判断，不需要专业术语。前后测核心问题相同，系统按固定编号配对。
                    </p>
                    {CORE_ITEMS.map((item) => (
                      <label key={item.key}>
                        {item.label}
                        {item.key === "judgment" ? (
                          <select
                            disabled={submitted}
                            value={draft.judgment}
                            onChange={(e) => update("judgment", e.target.value)}
                          >
                            <option value="">请选择</option>
                            {["支持", "有条件支持", "暂不支持", "尚不确定"].map(
                              (v) => (
                                <option key={v}>{v}</option>
                              ),
                            )}
                          </select>
                        ) : item.key === "confidence" ? (
                          <select
                            disabled={submitted}
                            value={draft.confidence}
                            onChange={(e) =>
                              update("confidence", Number(e.target.value))
                            }
                          >
                            <option value={0}>请选择1—5分</option>
                            {[1, 2, 3, 4, 5].map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <textarea
                            disabled={submitted}
                            value={draft[item.key]}
                            onChange={(e) => update(item.key, e.target.value)}
                            placeholder="按自己的理解写；不确定也可以如实说明"
                          />
                        )}
                      </label>
                    ))}
                    {stage === "t1" && (
                      <label>
                        补充：你的想法改变了吗？什么影响了你？
                        <textarea
                          disabled={submitted}
                          value={draft.change}
                          onChange={(e) => update("change", e.target.value)}
                        />
                      </label>
                    )}
                    <button
                      disabled={busy || submitted}
                      onClick={() =>
                        act("assessment", { payload: draft, advance: true })
                      }
                    >
                      {submitted
                        ? "独立判断已提交"
                        : stage === "t0"
                          ? "提交并进入项目导读"
                          : "提交并进入学习反馈"}
                    </button>
                  </>
                )}
                {stage === "orient" && (
                  <>
                    <p>
                      先看懂三个问题：给谁用？帮他们解决什么？哪些信息还不知道？上方可展开简单解释。这里不需要读懂整份商业计划书。
                    </p>
                    <button
                      disabled={busy}
                      onClick={() =>
                        act("orientation", { understood: true, advance: true })
                      }
                    >
                      我已读懂，进入驾驶舱写方案
                    </button>
                  </>
                )}
                {stage === "cockpit" && (
                  <>
                    <p>
                      用3—5句话写初步方案：帮助谁、解决什么、先怎样试一试。无需完整商业计划书，没有的数据不要编造。
                    </p>
                    <textarea
                      aria-label="初步方案"
                      value={draft.text}
                      onChange={(e) => update("text", e.target.value)}
                    />
                    <button
                      disabled={busy || !draft.text.trim()}
                      onClick={() =>
                        act("plan", { text: draft.text, advance: true })
                      }
                    >
                      保存 V0 并进入专家打磨
                    </button>
                  </>
                )}
                {(stage === "expert" || stage === "defense") && (
                  <>
                    <p>
                      {stage === "expert"
                        ? "专家打磨：固定5轮，每轮只问1个问题。"
                        : "模拟答辩：共3题，用自己的话回答，不要求专业表达。"}
                    </p>
                    {round <= total ? (
                      <>
                        <p>
                          当前第 {round} / {total} 题
                        </p>
                        {!question ? (
                          <button
                            disabled={busy}
                            onClick={() => act("question")}
                          >
                            查看本轮问题
                          </button>
                        ) : (
                          <>
                            <small>{String(question.payload.role)}</small>
                            <p className="question">
                              {String(question.payload.text)}
                            </p>
                            <button
                              disabled={busy}
                              onClick={() => ask("explain")}
                            >
                              看不懂，解释一下
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => ask("framework")}
                            >
                              给我回答框架
                            </button>
                            <label>
                              我的回答 / 暂时不会的原因
                              <textarea
                                value={draft.text}
                                onChange={(e) => update("text", e.target.value)}
                                placeholder="我的想法是……理由是……还需要确认……"
                              />
                            </label>
                            <button
                              disabled={busy || !draft.text.trim()}
                              onClick={() =>
                                act("reply", {
                                  text: draft.text,
                                  round,
                                  responseStatus: "answered",
                                  advance:
                                    stage === "defense" && round === total,
                                })
                              }
                            >
                              {stage === "defense" && round === total
                                ? "提交最后一题并进入后测"
                                : "提交回答，进入下一题"}
                            </button>
                            <button
                              disabled={busy || !draft.text.trim()}
                              onClick={() =>
                                act("reply", {
                                  text: draft.text,
                                  round,
                                  responseStatus: "skipped",
                                  advance:
                                    stage === "defense" && round === total,
                                })
                              }
                            >
                              记录原因，跳过本题
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      <p>本模块问题已全部处理。</p>
                    )}
                    {round > 1 && (
                      <button disabled={busy} onClick={() => ask("feedback")}>
                        查看上一题的改进建议
                      </button>
                    )}
                    {help && <article>{help}</article>}
                    {stage === "expert" && round > total && (
                      <>
                        <label>
                          打磨后的方案 V1
                          <textarea
                            value={draft.text}
                            onChange={(e) => update("text", e.target.value)}
                            placeholder="写修改后的方案；保留原方案时，写出理由。"
                          />
                        </label>
                        <button
                          disabled={busy || !draft.text.trim()}
                          onClick={() =>
                            act("revision", { text: draft.text, advance: true })
                          }
                        >
                          保存 V1 并进入模拟答辩
                        </button>
                      </>
                    )}
                  </>
                )}
                {stage === "survey" && (
                  <>
                    <label>
                      这次操作体验如何？（1很困难—5很顺畅）
                      <select
                        disabled={submitted}
                        value={draft.rating}
                        onChange={(e) =>
                          update("rating", Number(e.target.value))
                        }
                      >
                        <option value={0}>请选择</option>
                        {[1, 2, 3, 4, 5].map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      最有帮助或最困惑的地方（选填）
                      <textarea
                        disabled={submitted}
                        value={draft.text}
                        onChange={(e) => update("text", e.target.value)}
                      />
                    </label>
                    <button
                      disabled={busy || submitted}
                      onClick={() =>
                        act("survey", {
                          rating: draft.rating,
                          text: draft.text,
                          advance: true,
                        })
                      }
                    >
                      {submitted ? "反馈已提交" : "提交反馈，完成实验并导出"}
                    </button>
                  </>
                )}
                <p>
                  <small role="status">{save}</small>
                </p>
                <p role="status" aria-live="polite">
                  {busy
                    ? "正在处理，请稍候；保存成功后会自动更新步骤。"
                    : message}
                </p>
                <p>{problem || "本步要求已完成，可以继续。"}</p>
                {!problem && (
                  <button
                    disabled={busy || !!problem}
                    onClick={() => act("advance")}
                  >
                    {stage === "survey"
                      ? "完成实验并查看记录"
                      : "保存进度，进入下一步"}
                  </button>
                )}
              </>
            )}
          </section>
          <section>
            <h2>查看和导出</h2>
            <p>
              每一阶段都可单独导出，也可下载完整记录。草稿、原话、问题和AI帮助有独立标记。
            </p>
            <RecordExport
              endpoint="/api/experiment/export"
              label="导出全部记录"
            />{" "}
            <label>
              选择要导出的模块
              <select
                value={exportStage}
                onChange={(e) => setExportStage(e.target.value)}
              >
                {STEPS.filter((s) => s !== "completed").map((s) => (
                  <option key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <RecordExport
              endpoint={"/api/experiment/export?stage=" + exportStage}
              label="导出所选模块"
            />
            <details>
              <summary>查看已保存记录（{events.length}条）</summary>
              {events.map((e, i) => (
                <article key={e.id || i}>
                  <b>
                    {STAGE_LABELS[e.stage] || e.stage} · {e.event_type}
                  </b>
                  <p>
                    {typeof e.payload.text === "string"
                      ? e.payload.text
                      : JSON.stringify(e.payload, null, 2)}
                  </p>
                </article>
              ))}
            </details>
            <button disabled={busy} onClick={() => act("leave")}>
              退出或换一个实验（保留记录）
            </button>
          </section>
        </>
      )}
    </main>
  );
}

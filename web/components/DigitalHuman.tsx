"use client";
// 数字人向导（浮动头像 + 对话框）：小闯在知识星球（首页自带），小创在创业星舰（本组件）。
// 走 /api/ai/ask，带当前项目 project_id（会读取已认证的本体并标注出处）；可开关浏览器朗读。
import { useEffect, useRef, useState } from "react";
import { getCurrentProject } from "@/lib/ontology/pipeline";

type Msg = { role: "user" | "assistant"; content: string };

export default function DigitalHuman({ name, img, color, greet, system, hint }: {
  name: string; img: string; color: string; greet: string; system: string; hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "assistant", content: greet }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [speak, setSpeak] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.scrollTo({ top: 1e9 }); }, [msgs, open]);
  useEffect(() => { if (!open) try { window.speechSynthesis?.cancel(); } catch { /* 忽略 */ } }, [open]);

  function say(text: string) {
    if (!speak) return;
    try {
      const u = new SpeechSynthesisUtterance(text.replace(/[〔［\[][A-Z]\d{1,3}[〕］\]]/g, "").slice(0, 400));
      u.lang = "zh-CN"; window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
    } catch { /* 浏览器不支持朗读则静默 */ }
  }
  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    const next = [...msgs, { role: "user" as const, content: q }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const res = await fetch("/api/ai/ask", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.slice(-12), system, project_id: getCurrentProject() || undefined }) });
      const d = await res.json().catch(() => ({}));
      const text = res.status === 401 ? "请先登录后再和我聊（右上角 → 登录）。" : res.status === 402 ? "积分不足啦，可以在账户中心绑定自己的模型密钥。" : !res.ok ? `出错了：${d.error || res.status}` : d.text || "（没有回答）";
      setMsgs((m) => [...m, { role: "assistant", content: text }]); if (res.ok) say(text);
    } catch { setMsgs((m) => [...m, { role: "assistant", content: "网络出错了，请稍后再试。" }]); }
    setBusy(false);
  }

  return (
    <>
      <button onClick={() => setOpen((o) => !o)} title={hint || `和${name}聊聊`} aria-label={`数字人${name}`}
        style={{ position: "fixed", right: 18, bottom: 18, width: 68, height: 68, borderRadius: 34, padding: 0, cursor: "pointer", zIndex: 60,
          border: `2px solid ${color}`, boxShadow: `0 0 22px ${color}99`, background: "#0a0e22", overflow: "hidden" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </button>
      {open && (
        <div style={{ position: "fixed", right: 18, bottom: 96, width: "min(380px, calc(100vw - 36px))", height: "min(520px, calc(100vh - 140px))", zIndex: 60,
          display: "flex", flexDirection: "column", borderRadius: 18, overflow: "hidden", background: "rgba(10,14,34,.96)", border: `1px solid ${color}88`, boxShadow: "0 18px 48px rgba(0,0,0,.5)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: `linear-gradient(90deg, ${color}44, transparent)` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img} alt="" style={{ width: 34, height: 34, borderRadius: 17, objectFit: "cover" }} />
            <b style={{ color: "#fff" }}>{name}</b>
            <button onClick={() => setSpeak((v) => !v)} title="朗读回答" style={{ marginLeft: "auto", background: "none", border: "1px solid rgba(255,255,255,.2)", borderRadius: 999, color: "#fff", cursor: "pointer", padding: "2px 10px", fontSize: 12, fontFamily: "inherit" }}>{speak ? "🔊 朗读开" : "🔈 朗读关"}</button>
            <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#cbd5ff", cursor: "pointer", fontSize: 18 }}>×</button>
          </div>
          <div ref={listRef} style={{ flex: 1, overflowY: "auto", padding: 12, display: "grid", gap: 8, alignContent: "start" }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ justifySelf: m.role === "user" ? "end" : "start", maxWidth: "86%", whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.65, padding: "8px 11px", borderRadius: 12,
                background: m.role === "user" ? color : "rgba(255,255,255,.07)", color: m.role === "user" ? "#05060f" : "#e6ecff" }}>{m.content}</div>
            ))}
            {busy && <div style={{ fontSize: 12.5, color: "#94a3c8" }}>{name}正在想…</div>}
          </div>
          <div style={{ display: "flex", gap: 6, padding: 10, borderTop: "1px solid rgba(255,255,255,.08)" }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) send(); }}
              placeholder={`问${name}…`} style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,.15)", background: "rgba(255,255,255,.05)", color: "#fff", fontFamily: "inherit", fontSize: 13.5, outline: "none" }} />
            <button onClick={send} disabled={busy || !input.trim()} style={{ padding: "0 14px", borderRadius: 10, border: "none", background: color, color: "#05060f", fontWeight: 800, cursor: "pointer", fontFamily: "inherit", opacity: busy || !input.trim() ? 0.5 : 1 }}>发送</button>
          </div>
        </div>
      )}
    </>
  );
}

"use client";
import { useEffect, useState } from "react";
import AccountPanel from "./AccountPanel";
import LoginModal from "./LoginModal";

const ANIMALS = ["🐼", "🐯", "🦊", "🐰", "🐻", "🐶", "🐱", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦆", "🦉", "🦅", "🦄", "🐝"];
type Prof = { name: string | null; studentNo: string | null; role: string | null; credits: number | null };

/** 子页右上角账户入口：自取登录态/档案/头像，点击打开账户中心。供 LearnChrome 等子页复用。 */
export default function AccountButton({ accent = "#22d3ee" }: { accent?: string }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [prof, setProf] = useState<Prof | null>(null);
  const [av, setAv] = useState("");
  const [open, setOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  function loadAuth() {
    // 由服务端读 httpOnly 会话 cookie 判断登录态，并一并返回档案
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then(({ user, profile: p }) => {
        if (!user) { setAuthed(false); return; }
        setAuthed(true);
        setProf({ name: p?.name ?? null, studentNo: p?.student_no ?? null, role: p?.role ?? null, credits: p?.credits ?? null });
      })
      .catch(() => setAuthed(false));
  }
  useEffect(() => {
    try { setAv(localStorage.getItem("av_xj") || ""); } catch { /* ignore */ }
    loadAuth();
  }, []);

  if (authed === null) return <span style={{ width: 40, height: 34 }} />; // 占位防抖动
  if (authed === false) {
    return (
      <>
        <button onClick={() => setLoginOpen(true)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#05060f", border: "none", cursor: "pointer", fontFamily: "inherit", padding: "8px 16px", borderRadius: 999, background: `linear-gradient(120deg,${accent},var(--violet))` }}>
          登录 →
        </button>
        <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} onSuccess={() => { setAuthed(null); loadAuth(); }} accent={accent} />
      </>
    );
  }

  const isImg = av.startsWith("data:");
  const avatar = av && !isImg ? av : ANIMALS[0];
  return (
    <>
      <button onClick={() => setOpen(true)} title="账户中心"
        style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 12px 4px 5px", borderRadius: 999, border: "1px solid var(--line)", background: "rgba(255,255,255,.05)", backdropFilter: "blur(12px)", cursor: "pointer", fontFamily: "inherit", color: "var(--ink)" }}>
        <span style={{ width: 30, height: 30, borderRadius: "50%", overflow: "hidden", display: "grid", placeItems: "center", fontSize: 17, background: `${accent}22`, border: `1px solid ${accent}55` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {isImg ? <img src={av} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : avatar}
        </span>
        <span style={{ fontSize: 12.5, lineHeight: 1.2, textAlign: "left" }}>
          <b style={{ display: "block" }}>{prof?.name || "我的账户"}</b>
          {prof?.credits != null && <span style={{ color: "var(--mut)", fontSize: 11 }}>积分 {prof.credits}</span>}
        </span>
      </button>
      <AccountPanel open={open} onClose={() => setOpen(false)} profile={{ name: prof?.name ?? null, studentNo: prof?.studentNo ?? null, role: prof?.role ?? null, credits: prof?.credits ?? null }} />
    </>
  );
}

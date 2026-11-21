"use client";
// 当前页登录弹窗：在任意页面点「登录」即就地弹出，登录成功后停留在当前页（不跳首页）。
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginModal({ open, onClose, onSuccess, accent = "#0E7490" }: { open: boolean; onClose: () => void; onSuccess?: () => void; accent?: string }) {
  const [no, setNo] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!no.trim() || !pwd) { setErr("请输入学号和密码"); return; }
    setErr(""); setLoading(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account: no.trim(), password: pwd }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr("登录失败：" + (data.error || "学号或密码错误")); setLoading(false); return; }
      router.refresh();      // 刷新当前页服务端内容，URL 不变、不跳首页
      onSuccess?.();
      onClose();
    } catch { setErr("网络错误，请检查与平台服务器的连接"); setLoading(false); }
  }

  const input: React.CSSProperties = { width: "100%", padding: "11px 13px", borderRadius: 11, border: "1px solid rgba(120,200,255,.25)", background: "#F1F5F9", color: "var(--ink)", fontSize: 15, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 2000, display: "grid", placeItems: "center", background: "rgba(4,3,15,.66)", backdropFilter: "blur(5px)" }}>
      <form className="theme-light" onClick={(e) => e.stopPropagation()} onSubmit={submit} style={{ width: "min(380px,92vw)", background: "#fff", backdropFilter: "blur(16px)", border: "1px solid #E2E8F0", borderRadius: 20, padding: 26, boxShadow: "0 20px 50px rgba(15,23,42,.18)", color: "var(--ink)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" width={40} height={40} style={{ borderRadius: 12 }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>双创AI星际</div>
            <div style={{ fontSize: 14.5, color: "var(--mut)", letterSpacing: 1 }}>DOUBLE INNOVATION AI COSMOS</div>
          </div>
          <button type="button" onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--mut)", cursor: "pointer", fontSize: 18, fontFamily: "inherit" }}>✕</button>
        </div>
        <p style={{ color: "var(--mut)", fontSize: 14.5, margin: "10px 0 16px" }}>用学号登录，登录后停留在当前页面</p>

        <label style={{ fontSize: 15, color: "var(--mut)" }}>学号</label>
        <input style={{ ...input, margin: "6px 0 13px" }} value={no} onChange={(e) => setNo(e.target.value)} placeholder="如 202596057038 或 admin" autoComplete="username" />
        <label style={{ fontSize: 15, color: "var(--mut)" }}>密码</label>
        <input style={{ ...input, margin: "6px 0 4px" }} type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="密码" autoComplete="current-password" />

        {err && <div style={{ color: "#B91C1C", fontSize: 14.5, marginTop: 11 }}>{err}</div>}

        <button type="submit" disabled={loading} style={{ width: "100%", marginTop: 16, padding: "12px 0", borderRadius: 11, border: "none", cursor: loading ? "default" : "pointer", fontWeight: 800, fontSize: 15, color: "#fff", background: `linear-gradient(120deg,${accent},var(--violet))`, opacity: loading ? 0.7 : 1, fontFamily: "inherit" }}>
          {loading ? "登录中…" : "登录 →"}
        </button>

        <div style={{ marginTop: 14, fontSize: 15, color: "var(--mut)", lineHeight: 1.7, borderTop: "1px solid rgba(120,200,255,.18)", paddingTop: 11 }}>
          请使用管理员单独发放的账号登录。首次登录后请立即修改临时密码。
        </div>
      </form>
    </div>
  );
}

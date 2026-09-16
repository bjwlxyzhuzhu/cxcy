"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const fields = [
  ["studentNo", "学号", "请输入学号"], ["name", "姓名", "请输入真实姓名"], ["className", "班级", "例如：2024级创新创业班"],
  ["major", "专业", "请输入专业名称"], ["college", "学院", "请输入学院名称"],
] as const;

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ studentNo: "", name: "", className: "", major: "", college: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const update = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (form.password !== form.confirm) { setError("两次输入的密码不一致"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "注册失败"); setBusy(false); return; }
      router.push("/login?registered=1");
    } catch { setError("网络错误，请稍后重试"); setBusy(false); }
  }
  const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "11px 13px", borderRadius: 11, border: "1px solid var(--line)", background: "rgba(255,255,255,.04)", color: "var(--ink)", fontSize: 14, outline: "none" };
  return <><div className="deep" /><div className="neb n1" /><div className="neb n2" /><main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, position: "relative", zIndex: 2 }}><form onSubmit={submit} style={{ width: "min(460px, 94vw)", background: "rgba(10,14,34,.82)", backdropFilter: "blur(16px)", border: "1px solid var(--line)", borderRadius: 22, padding: 28, boxShadow: "0 30px 80px #0008" }}><h1 style={{ margin: 0, fontSize: 24 }}>创建学生账号</h1><p style={{ color: "var(--mut)", fontSize: 13, lineHeight: 1.7, margin: "9px 0 18px" }}>填写真实教学信息，注册后使用学号和密码登录。</p><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 14px" }}>{fields.map(([key, label, placeholder]) => <label key={key} style={{ fontSize: 12, color: "var(--mut)" }}>{label}<input required value={form[key]} onChange={(e) => update(key, e.target.value)} placeholder={placeholder} style={{ ...input, marginTop: 6 }} /></label>)}</div><label style={{ display: "block", marginTop: 14, fontSize: 12, color: "var(--mut)" }}>密码<input required type="password" minLength={8} value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="至少 8 位" style={{ ...input, marginTop: 6 }} /></label><label style={{ display: "block", marginTop: 12, fontSize: 12, color: "var(--mut)" }}>确认密码<input required type="password" minLength={8} value={form.confirm} onChange={(e) => update("confirm", e.target.value)} placeholder="再次输入密码" style={{ ...input, marginTop: 6 }} /></label>{error && <div style={{ color: "#ff7a8a", fontSize: 13, marginTop: 12 }}>{error}</div>}<button type="submit" disabled={busy} style={{ width: "100%", marginTop: 18, padding: "12px 0", border: 0, borderRadius: 11, fontWeight: 800, cursor: busy ? "default" : "pointer", color: "#05060f", background: "linear-gradient(120deg,var(--cyan),var(--violet))" }}>{busy ? "注册中…" : "注册账号"}</button><a href="/login" style={{ display: "block", textAlign: "center", marginTop: 14, color: "var(--cyan)", fontSize: 13 }}>已有账号？返回登录</a></form></main></>;
}

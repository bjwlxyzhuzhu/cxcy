"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [no, setNo] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!no.trim() || !pwd) {
      setErr("请输入学号和密码");
      return;
    }
    setErr("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ studentNo: no.trim(), password: pwd }),
      });
      const body = await response.json();
      if (!response.ok) {
        setErr("登录失败：" + (body.error || "学号或密码错误"));
        setLoading(false);
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setErr("网络错误，请稍后重试");
      setLoading(false);
    }
  }

  const input: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid var(--line)",
    background: "rgba(255,255,255,.04)",
    color: "var(--ink)",
    fontSize: 15,
    outline: "none",
  };

  return (
    <>
      <div className="deep" />
      <div className="neb n1" />
      <div className="neb n2" />
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
          position: "relative",
          zIndex: 2,
        }}
      >
        <form
          onSubmit={submit}
          style={{
            width: "min(380px, 92vw)",
            background: "rgba(10,14,34,.7)",
            backdropFilter: "blur(16px)",
            border: "1px solid var(--line)",
            borderRadius: 22,
            padding: 28,
            boxShadow: "0 30px 80px #0008",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.svg"
              alt="双创AI星际"
              width={44}
              height={44}
              style={{ borderRadius: 13, objectFit: "cover" }}
            />
            <div>
              <div style={{ fontWeight: 800, fontSize: 19 }}>双创AI星际</div>
              <div style={{ fontSize: 11, color: "var(--mut)", letterSpacing: 1 }}>
                DOUBLE INNOVATION AI COSMOS
              </div>
            </div>
          </div>
          <p style={{ color: "var(--mut)", fontSize: 13, margin: "10px 0 18px" }}>
            用学号登录进入你的创赛星系
          </p>

          <label style={{ fontSize: 12, color: "var(--mut)" }}>学号</label>
          <input
            style={{ ...input, margin: "6px 0 14px" }}
            value={no}
            onChange={(e) => setNo(e.target.value)}
            placeholder="请输入学号或管理员账号"
            autoComplete="username"
          />
          <label style={{ fontSize: 12, color: "var(--mut)" }}>密码</label>
          <input
            style={{ ...input, margin: "6px 0 4px" }}
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="密码"
            autoComplete="current-password"
          />

          {err && (
            <div style={{ color: "#ff7a8a", fontSize: 13, marginTop: 12 }}>{err}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              marginTop: 18,
              padding: "13px 0",
              borderRadius: 12,
              border: "none",
              cursor: loading ? "default" : "pointer",
              fontWeight: 800,
              fontSize: 15,
              color: "#05060f",
              background: "linear-gradient(120deg,var(--cyan),var(--violet))",
              opacity: loading ? 0.7 : 1,
              fontFamily: "inherit",
            }}
          >
            {loading ? "登录中…" : "登录 →"}
          </button>

          <a href="/register" style={{ display: "block", textAlign: "center", marginTop: 14, fontSize: 13, color: "var(--cyan)" }}>
            还没有账号？立即注册
          </a>

          <a href="/" style={{ display: "inline-block", marginTop: 14, fontSize: 13, color: "var(--cyan)" }}>
            ← 返回首页
          </a>
        </form>
      </main>
    </>
  );
}

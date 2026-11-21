"use client";
// 登录页（清爽教育蓝）：左侧品牌区讲清“平台做什么”，右侧白色登录卡，学生 / 教师 / 管理员三个标签。
// 角色标签只改变提示文字；登录后按账号的真实角色进入各自首页。
import { useState } from "react";
import Link from "next/link";

const ROLES = [
  { key: "student", label: "学生", account: "学号", hint: "用学号和老师发给你的初始密码登录，首次登录后请修改密码" },
  { key: "teacher", label: "教师", account: "工号", hint: "教师账号由管理员导入，登录后进入班级总览" },
  { key: "admin", label: "管理员", account: "工号", hint: "管理员负责设置学期课程、导入名单" },
] as const;

const POINTS = [
  { t: "一条主线", d: "8 次课贯穿一个创业项目：课前学、课中做、课后验" },
  { t: "人判断，AI 执行", d: "AI 起草的内容都要学生核对认证才算数" },
  { t: "用数据看成长", d: "过程性、增值性、终结性评价都来自真实记录" },
];

export default function LoginPortal() {
  const [role, setRole] = useState<(typeof ROLES)[number]>(ROLES[0]);
  const [acc, setAcc] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!acc.trim() || !pwd) { setErr(`请输入${role.account}和密码`); return; }
    setErr(""); setBusy(true);
    try {
      const r = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ account: acc.trim(), password: pwd }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error || `${role.account}或密码不正确`); setBusy(false); return; }
      const me = await fetch("/api/auth/me", { cache: "no-store" }).then((x) => x.json()).catch(() => ({}));
      const real = me?.profile?.role;
      window.location.href = real === "admin" ? "/admin?tab=terms" : real === "teacher" ? "/teacher" : "/course";
    } catch { setErr("网络连接出错，请稍后再试"); setBusy(false); }
  }

  return (
    <div className="lp">
      <div className="lp-brand">
        <div className="lp-logo">创</div>
        <h1 className="lp-h1">双创 AI 星际</h1>
        <div className="lp-sub">创新创业课程智能体</div>
        <div className="lp-points">
          {POINTS.map((p, i) => (
            <div key={p.t} className="lp-point">
              <span className="lp-num">{i + 1}</span>
              <div><b>{p.t}</b><div>{p.d}</div></div>
            </div>
          ))}
        </div>
        <svg className="lp-curve" viewBox="0 0 600 180" aria-hidden>
          <path d="M0 160 C 120 150, 200 120, 280 100 S 440 50, 600 20" fill="none" stroke="#67E8F9" strokeWidth="4" strokeLinecap="round" />
          {[[0, 160], [140, 146], [280, 100], [420, 62], [600, 20]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="7" fill="#fff" stroke="#67E8F9" strokeWidth="3" />)}
        </svg>
      </div>

      <div className="lp-side">
        <form className="lp-card" onSubmit={submit}>
          <div className="lp-tabs" role="tablist">
            {ROLES.map((r) => (
              <button key={r.key} type="button" role="tab" aria-selected={role.key === r.key} className={role.key === r.key ? "on" : ""} onClick={() => { setRole(r); setErr(""); }}>{r.label}</button>
            ))}
          </div>
          <label className="lp-lab" htmlFor="acc">{role.account}</label>
          <input id="acc" className="lp-in" value={acc} onChange={(e) => setAcc(e.target.value)} placeholder={`请输入${role.account}`} autoComplete="username" />
          <label className="lp-lab" htmlFor="pwd">密码</label>
          <input id="pwd" className="lp-in" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="请输入密码" autoComplete="current-password" />
          {err && <div className="lp-err">{err}</div>}
          <button className="lp-btn" disabled={busy}>{busy ? "登录中…" : "登录"}</button>
          <div className="lp-hint">{role.hint}</div>
        </form>
        <div className="lp-links">
          <Link href="/galaxy">星系展示模式</Link><span>·</span><Link href="/compliance">合规与隐私说明</Link>
        </div>
      </div>

      <style>{`
        .lp{min-height:100vh;display:flex;background:var(--page)}
        .lp-brand{flex:1.4;position:relative;overflow:hidden;color:#fff;padding:64px 64px 40px;display:flex;flex-direction:column;justify-content:center;background:linear-gradient(140deg,#1E3A8A 0%,#1E40AF 55%,#0E7490 100%)}
        .lp-logo{width:56px;height:56px;border-radius:14px;background:#fff;color:#1E3A8A;display:grid;place-items:center;font-size:28px;font-weight:900}
        .lp-h1{font-size:44px;font-weight:800;margin:18px 0 4px;line-height:1.2;letter-spacing:1px}
        .lp-sub{font-size:20px;color:#CFE0FF}
        .lp-points{display:grid;gap:16px;margin-top:36px;max-width:520px;position:relative;z-index:1}
        .lp-point{display:flex;gap:14px;align-items:flex-start;font-size:16px;color:#E0EAFF;line-height:1.6}
        .lp-point b{font-size:18px;color:#fff}
        .lp-num{width:32px;height:32px;border-radius:16px;background:#fff;color:#1E3A8A;display:grid;place-items:center;font-weight:800;flex:none}
        .lp-curve{position:absolute;left:0;right:0;bottom:24px;width:100%;opacity:.55}
        .lp-side{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 24px}
        .lp-card{width:100%;max-width:400px;background:#fff;border:1px solid var(--line);border-radius:16px;box-shadow:0 10px 30px rgba(15,23,42,.08);padding:28px}
        .lp-tabs{display:flex;border-bottom:2px solid #E2E8F0;margin-bottom:22px}
        .lp-tabs button{flex:1;background:none;border:none;font-family:inherit;font-size:17px;padding:10px 0;cursor:pointer;color:#5B6577;border-bottom:3px solid transparent;margin-bottom:-2px}
        .lp-tabs button.on{color:#1E3A8A;font-weight:800;border-bottom-color:#1E3A8A}
        .lp-lab{display:block;font-size:15px;color:#374151;margin:12px 0 6px}
        .lp-in{width:100%;padding:12px 14px;font-size:16px;border:1px solid #CBD5E1;border-radius:10px;font-family:inherit;outline:none;color:#111827}
        .lp-in:focus{border-color:#1E3A8A;box-shadow:0 0 0 3px #1E3A8A22}
        .lp-err{color:#B91C1C;font-size:15px;margin-top:10px}
        .lp-btn{width:100%;margin-top:20px;padding:13px;font-size:17px;font-weight:800;color:#fff;background:#1E3A8A;border:none;border-radius:10px;cursor:pointer;font-family:inherit}
        .lp-btn:disabled{opacity:.6}
        .lp-hint{font-size:14px;color:#5B6577;margin-top:14px;line-height:1.6}
        .lp-links{display:flex;gap:8px;margin-top:18px;font-size:14.5px;color:#94A3B8}
        @media (max-width:900px){.lp{flex-direction:column}.lp-brand{padding:32px 22px 90px}.lp-h1{font-size:32px}.lp-points{margin-top:20px}}
      `}</style>
    </div>
  );
}

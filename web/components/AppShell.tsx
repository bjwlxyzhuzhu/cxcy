"use client";
// 全站外壳（浅色·清爽教育蓝）：左侧深蓝导航按角色显示，顶部白色标题栏，内容区大字留白。
// 学生 / 教师 / 管理员各自只看到自己的主线入口；星系展示模式放在侧栏底部，不再作为默认首页。
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AccountButton from "./AccountButton";
import ProjectBar from "./ProjectBar";

type Role = "student" | "teacher" | "admin" | "guest";
type Item = { href: string; label: string; icon: keyof typeof ICONS; hard?: boolean };

const NAV: Record<Role, { title: string; items: Item[] }[]> = {
  student: [
    { title: "学习主线", items: [
      { href: "/course", label: "我的课程", icon: "book" },
      { href: "/studio", label: "项目工作台", icon: "layers" },
      { href: "/me/growth", label: "我的成长", icon: "chart" },
    ] },
    { title: "学习资源", items: [
      { href: "/learn", label: "知识星球", icon: "planet" },
      { href: "/apply/cockpit", label: "创业星舰", icon: "rocket" },
    ] },
  ],
  teacher: [
    { title: "教学", items: [
      { href: "/teacher", label: "班级总览", icon: "home" },
      { href: "/teacher/live", label: "授课工作台", icon: "screen" },
      { href: "/admin?tab=growth", label: "学生成长报告", icon: "chart", hard: true },
      { href: "/teacher/ontology-game", label: "课堂游戏", icon: "puzzle" },
    ] },
    { title: "资源与管理", items: [
      { href: "/learn", label: "知识星球", icon: "planet" },
      { href: "/admin?tab=terms", label: "学期与名单", icon: "users", hard: true },
    ] },
  ],
  admin: [
    { title: "管理", items: [
      { href: "/admin?tab=terms", label: "学期与课程", icon: "calendar", hard: true },
      { href: "/admin?tab=roster", label: "名单导入", icon: "users", hard: true },
      { href: "/admin?tab=growth", label: "学生成长报告", icon: "chart", hard: true },
      { href: "/admin?tab=record", label: "课程教学记录", icon: "book", hard: true },
    ] },
    { title: "教学", items: [
      { href: "/teacher", label: "班级总览", icon: "home" },
      { href: "/teacher/live", label: "授课工作台", icon: "screen" },
      { href: "/learn", label: "知识星球", icon: "planet" },
    ] },
  ],
  guest: [
    { title: "开始", items: [
      { href: "/", label: "登录", icon: "home" },
      { href: "/course", label: "课程主线", icon: "book" },
      { href: "/learn", label: "知识星球", icon: "planet" },
    ] },
  ],
};

const ICONS = {
  home: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7",
  layers: "M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17.5l10 5 10-5",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  planet: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM3 15c-1 2 0 3 3 2.5 3-.4 8-2.8 12-6 3-2.4 4-4.5 2.5-5",
  rocket: "M5 15c-1.5 1.5-2 4-2 6 2 0 4.5-.5 6-2M9 13l-2-2c1-4 5-8 13-8 0 8-4 12-8 13l-2-2M14 9a1 1 0 1 0 2 0 1 1 0 0 0-2 0",
  screen: "M3 4h18v12H3zM8 20h8M12 16v4",
  puzzle: "M9 3h6v3a2 2 0 1 0 4 0V3h2v6h-3a2 2 0 1 0 0 4h3v8h-6v-3a2 2 0 1 0-4 0v3H3v-8h3a2 2 0 1 0 0-4H3V3z",
  users: "M16 20v-2a4 4 0 0 0-8 0v2M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M20 20v-1.5a3.5 3.5 0 0 0-3-3.4M17 4.3a3.5 3.5 0 0 1 0 6.4",
  calendar: "M4 5h16v16H4zM4 10h16M9 3v4M15 3v4",
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICONS[name]} /></svg>;
}

let roleCache: Role | null = null;

export default function AppShell({ title, subtitle, children, actions }: { title: string; subtitle?: string; children: ReactNode; actions?: ReactNode }) {
  const path = usePathname() || "";
  const [role, setRole] = useState<Role | null>(roleCache);
  const [search, setSearch] = useState("");
  useEffect(() => {
    setSearch(window.location.search);
    if (roleCache) return;
    fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).then(({ user, profile }) => {
      const r: Role = !user ? "guest" : profile?.role === "admin" ? "admin" : profile?.role === "teacher" ? "teacher" : "student";
      roleCache = user ? r : null; setRole(r);
    }).catch(() => setRole("guest"));
  }, [path]);

  const groups = NAV[role || "guest"];
  // 当前高亮：路径完全相同或为其子路径，取最长匹配；带 ?tab= 的链接还要求参数一致
  const matches = (href: string) => {
    const [p, q] = href.split("?");
    if (q) return path === p && search.includes(q);
    return path === p || (p !== "/" && path.startsWith(p + "/"));
  };
  const activeHref = groups.flatMap((g) => g.items.map((i) => i.href)).filter(matches).sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === activeHref;
  const roleLabel = role === "admin" ? "管理员" : role === "teacher" ? "教师" : role === "student" ? "学生" : "";

  return (
    <div className="app-shell">
      <aside className="app-side">
        <Link href="/" className="app-brand">
          <span className="app-logo">创</span>
          <span><b>双创 AI 星际</b><small>创新创业课程智能体</small></span>
        </Link>
        {roleLabel && <div className="app-role">{roleLabel}端</div>}
        <div className="app-nav">
          {groups.map((g) => (
            <div key={g.title} className="app-group">
              <div className="app-group-title">{g.title}</div>
              {g.items.map((it) => {
                const on = isActive(it.href);
                const cls = "app-link" + (on ? " on" : "");
                return it.hard
                  ? <a key={it.href} href={it.href} className={cls}><Icon name={it.icon} />{it.label}</a>
                  : <Link key={it.href} href={it.href} className={cls}><Icon name={it.icon} />{it.label}</Link>;
              })}
            </div>
          ))}
        </div>
        <Link href="/galaxy" className="app-galaxy">星系展示模式 →</Link>
      </aside>

      <div className="app-main">
        <div className="app-top">
          <div style={{ minWidth: 0 }}>
            <div className="app-title">{title}</div>
            {subtitle && <div className="app-sub">{subtitle}</div>}
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            {actions}
            <AccountButton />
          </div>
        </div>
        <div className="app-content">
          {role === "student" && <div style={{ marginBottom: 14 }}><ProjectBar dark={false} /></div>}
          {children}
          <div className="app-foot">AI 生成内容仅供参考，最终判断由师生作出 · 数据最小化采集 · <Link href="/compliance">合规与隐私说明</Link></div>
        </div>
      </div>

      <style>{`
        .app-shell{display:flex;min-height:100vh;background:var(--page)}
        .app-side{width:232px;flex:none;background:#1E3A8A;color:#DBE4FF;position:sticky;top:0;height:100vh;display:flex;flex-direction:column;padding:18px 14px}
        .app-brand{display:flex;gap:10px;align-items:center;text-decoration:none;color:#fff;padding:0 6px 14px}
        .app-brand b{display:block;font-size:17px;line-height:1.3}.app-brand small{display:block;font-size:12.5px;color:#B9C6F0}
        .app-logo{width:38px;height:38px;border-radius:10px;background:#fff;color:#1E3A8A;display:grid;place-items:center;font-weight:900;font-size:19px;flex:none}
        .app-role{font-size:13px;color:#1E3A8A;background:#DBEAFE;border-radius:999px;padding:2px 12px;align-self:flex-start;margin:0 6px 10px;font-weight:700}
        .app-nav{flex:1;overflow-y:auto}
        .app-group{margin-bottom:14px}
        .app-group-title{font-size:13px;color:#93A7E0;padding:4px 10px}
        .app-link{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;color:#E0E8FF;text-decoration:none;font-size:16px;margin:2px 0}
        .app-link:hover{background:#2E4BA8}
        .app-link.on{background:#fff;color:#1E3A8A;font-weight:700}
        .app-galaxy{font-size:13.5px;color:#B9C6F0;text-decoration:none;padding:8px 10px;border-top:1px solid #34509E}
        .app-main{flex:1;min-width:0;display:flex;flex-direction:column}
        .app-top{display:flex;align-items:center;gap:14px;flex-wrap:wrap;background:#fff;border-bottom:1px solid var(--line);padding:16px 28px;position:sticky;top:0;z-index:20}
        .app-title{font-size:24px;font-weight:800;color:#111827;line-height:1.3}
        .app-sub{font-size:15px;color:var(--mut);margin-top:2px}
        .app-content{padding:22px 28px 40px;max-width:1440px;width:100%}
        .app-foot{margin-top:40px;padding-top:14px;border-top:1px solid var(--line);font-size:13.5px;color:var(--mut)}
        @media (max-width:900px){
          .app-shell{flex-direction:column}
          .app-side{width:auto;height:auto;position:static;padding:10px 12px}
          .app-brand{padding-bottom:8px}.app-role,.app-group-title,.app-galaxy{display:none}
          .app-nav{display:flex;overflow-x:auto;gap:4px}.app-group{display:flex;gap:4px;margin:0}
          .app-link{white-space:nowrap;font-size:15px;padding:8px 10px}
          .app-top{padding:12px 16px;position:static}.app-content{padding:16px}
        }
      `}</style>
    </div>
  );
}

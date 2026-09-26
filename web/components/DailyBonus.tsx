"use client";
// 每日登录积分：登录用户每天首次进站自动 +30 积分，弹一条祝贺浮条。未登录/已领过 → 后端静默返回，不打扰。
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";

export default function DailyBonus() {
  const router = useRouter();
  const pathname = usePathname();
  const [toast, setToast] = useState<{ added: number; credits: number } | null>(null);

  useEffect(() => {
    // 判重由服务端事务负责，匿名访问不会占用登录后的领取机会。
    let alive = true;
    fetch("/api/credits/daily", { method: "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d?.granted) return;
        setToast({ added: d.added ?? 30, credits: d.credits ?? 0 });
        window.dispatchEvent(new Event("credits-updated"));
        router.refresh(); // 刷新服务端渲染的积分显示
        setTimeout(() => alive && setToast(null), 5200);
      })
      .catch(() => { /* 积分中心可重试 */ });

    return () => { alive = false; };
  }, [router, pathname]);

  if (!toast) return null;
  return (
    <div role="status" style={{ position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)", zIndex: 4000, pointerEvents: "none", animation: "dbIn .45s cubic-bezier(.2,.9,.3,1.2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 18px", borderRadius: 999, background: "linear-gradient(120deg, rgba(16,22,48,.96), rgba(28,18,52,.96))", border: "1px solid rgba(255,210,120,.5)", boxShadow: "0 12px 36px rgba(0,0,0,.5), 0 0 24px rgba(255,200,90,.25)", color: "#ffe9c2", fontSize: 14.5, fontWeight: 700, whiteSpace: "nowrap" }}>
        <span style={{ fontSize: 18 }}>🎁</span>
        今日登录 <b style={{ color: "#ffd24a", fontSize: 16 }}>+{toast.added}</b> 积分
        <span style={{ color: "#a9bbe0", fontWeight: 500, fontSize: 12.5 }}>· 余额 {toast.credits}</span>
      </div>
      <style>{`@keyframes dbIn{from{opacity:0;transform:translate(-50%,-14px)}to{opacity:1;transform:translate(-50%,0)}}`}</style>
    </div>
  );
}

"use client";
import type { CSSProperties, ReactNode } from "react";

/** 旧的霓虹色 → 浅色主题下可读的深色调（对比度 ≥ 4.5:1）。按钮、标签统一经过这里 */
const TONE: Record<string, string> = {
  "#22d3ee": "#0E7490", "#34d399": "#15803D", "#a78bfa": "#6D28D9", "#f87171": "#B91C1C", "#fbbf24": "#B45309",
  "#94a3b8": "#475569", "#f472b6": "#BE185D", "#7dd3fc": "#0369A1", "#fb923c": "#C2410C", "#60a5fa": "#1D4ED8",
  "#38bdf8": "#0369A1", "#818cf8": "#4338CA", "#10b981": "#047857", "#ff6b35": "#C2410C", "#7aa8ff": "#1D4ED8",
};
export const tone = (c: string) => TONE[(c || "").toLowerCase()] || c;

export const box: CSSProperties = {
  border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)", boxShadow: "var(--shadow)", padding: 18,
};
export const field: CSSProperties = {
  width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #CBD5E1",
  background: "#fff", color: "var(--ink)", fontSize: 15, fontFamily: "inherit", outline: "none",
};
export const lab: CSSProperties = { fontSize: 14, color: "var(--mut)", marginBottom: 6, display: "block" };

export function Btn({ children, onClick, color = "#1E3A8A", ghost, disabled, small, title }: {
  children: ReactNode; onClick?: () => void; color?: string; ghost?: boolean; disabled?: boolean; small?: boolean; title?: string;
}) {
  const c = tone(color);
  return (
    <button title={title} disabled={disabled} onClick={onClick}
      style={{
        padding: small ? "6px 14px" : "10px 20px", borderRadius: 10, fontSize: small ? 14 : 15, fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.5 : 1,
        border: `1px solid ${c}`, color: ghost ? c : "#fff", background: ghost ? "#fff" : c, whiteSpace: "nowrap",
      }}>
      {children}
    </button>
  );
}

export function Tag({ children, color = "#1E3A8A" }: { children: ReactNode; color?: string }) {
  const c = tone(color);
  return <span style={{ fontSize: 13, fontWeight: 600, color: c, background: `${c}14`, border: `1px solid ${c}33`, borderRadius: 999, padding: "2px 10px", whiteSpace: "nowrap" }}>{children}</span>;
}

export async function api<T = Record<string, unknown>>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method || (init?.body ? "POST" : "GET"),
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `请求失败 ${res.status}`);
  return data as T;
}

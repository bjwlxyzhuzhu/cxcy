"use client";
import type { CSSProperties, ReactNode } from "react";

export const box: CSSProperties = {
  border: "1px solid var(--line)", borderRadius: 16, background: "rgba(255,255,255,.04)",
  backdropFilter: "blur(12px)", padding: 16,
};
export const field: CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid var(--line)",
  background: "rgba(255,255,255,.05)", color: "var(--ink)", fontSize: 13.5, fontFamily: "inherit", outline: "none",
};
export const lab: CSSProperties = { fontSize: 12, color: "var(--mut)", marginBottom: 4, display: "block" };

export function Btn({ children, onClick, color = "#22d3ee", ghost, disabled, small, title }: {
  children: ReactNode; onClick?: () => void; color?: string; ghost?: boolean; disabled?: boolean; small?: boolean; title?: string;
}) {
  return (
    <button title={title} disabled={disabled} onClick={onClick}
      style={{
        padding: small ? "5px 11px" : "9px 16px", borderRadius: 999, fontSize: small ? 12 : 13.5, fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: disabled ? 0.5 : 1,
        border: `1px solid ${color}${ghost ? "88" : ""}`, color: ghost ? color : "#0a0e1f",
        background: ghost ? "transparent" : color, whiteSpace: "nowrap",
      }}>
      {children}
    </button>
  );
}

export function Tag({ children, color = "#22d3ee" }: { children: ReactNode; color?: string }) {
  return <span style={{ fontSize: 11.5, color, border: `1px solid ${color}66`, borderRadius: 999, padding: "2px 9px", whiteSpace: "nowrap" }}>{children}</span>;
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

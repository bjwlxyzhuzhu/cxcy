"use client";
// 浅色界面组件：区块卡片、大数字卡、一句话结论、柱状图、折线面积图、环形进度、步骤条。
// 纯 SVG / CSS，不引入第三方图表库；字号不小于 13px，颜色对比度按 4.5:1 选取。
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

export const C = {
  primary: "#1E3A8A", accent: "#0891B2", orange: "#EA580C", ok: "#15803D", warn: "#B45309", danger: "#B91C1C", mut: "#5B6577",
  chart: ["#6366F1", "#EC4899", "#06B6D4", "#F59E0B", "#10B981", "#8B5CF6"],
};

export function Section({ title, extra, children, style }: { title?: ReactNode; extra?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <section style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 14, boxShadow: "var(--shadow)", padding: 20, ...style }}>
      {(title || extra) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
          {title && <h2 style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", margin: 0, lineHeight: 1.4 }}>{title}</h2>}
          {extra && <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>{extra}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** 大数字卡：标签在上、数字大号、可带一行说明或变化量 */
export function Stat({ label, value, unit, note, color = C.primary, href }: { label: string; value: ReactNode; unit?: string; note?: ReactNode; color?: string; href?: string }) {
  const body = (
    <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 14, boxShadow: "var(--shadow)", padding: "16px 18px", height: "100%" }}>
      <div style={{ fontSize: 14, color: "var(--mut)" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
        <span style={{ fontSize: 34, fontWeight: 800, color, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>{value}</span>
        {unit && <span style={{ fontSize: 15, color: "var(--mut)" }}>{unit}</span>}
      </div>
      {note && <div style={{ fontSize: 13.5, color: "var(--mut)", marginTop: 4 }}>{note}</div>}
    </div>
  );
  return href ? <Link href={href} style={{ textDecoration: "none", display: "block" }}>{body}</Link> : body;
}

export function StatRow({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 14 }}>{children}</div>;
}

/** 一图一结论：图表上方一句话写清“看出了什么” */
export function Insight({ children, color = C.primary }: { children: ReactNode; color?: string }) {
  return <div style={{ fontSize: 15.5, fontWeight: 600, color, background: `${color}0D`, borderLeft: `4px solid ${color}`, padding: "8px 12px", margin: "0 0 12px", borderRadius: 0 }}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 15, color: "var(--mut)", padding: "18px 4px" }}>{children}</div>;
}

/** 柱状图：数值标在柱顶，横轴标签在下 */
export function Bars({ data, height = 180, unit = "", color = C.chart[0] }: { data: { label: string; value: number; color?: string }[]; height?: number; unit?: string; color?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height, borderBottom: "1px solid #CBD5E1", padding: "0 4px" }}>
        {data.map((d) => (
          <div key={d.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>{d.value}{unit}</span>
            <div style={{ width: "72%", maxWidth: 46, height: `${(d.value / max) * 82}%`, minHeight: d.value ? 4 : 1, borderRadius: "6px 6px 0 0", background: `linear-gradient(180deg, ${d.color || color}, ${d.color || color}AA)` }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, padding: "6px 4px 0" }}>
        {data.map((d) => <span key={d.label} style={{ flex: 1, textAlign: "center", fontSize: 13.5, color: "var(--mut)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</span>)}
      </div>
    </div>
  );
}

/** 折线面积图：多条序列，渐变填充；labels 为横轴 */
export function Lines({ labels, series, height = 200, unit = "" }: { labels: string[]; series: { name: string; values: number[]; color?: string }[]; height?: number; unit?: string }) {
  const W = 640, H = height, P = { l: 36, r: 12, t: 14, b: 26 };
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const x = (i: number) => P.l + (labels.length <= 1 ? 0 : (i * (W - P.l - P.r)) / (labels.length - 1));
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);
  const step = Math.max(1, Math.ceil(labels.length / 8));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label={series.map((s) => s.name).join("、")}>
        <defs>
          {series.map((s, k) => (
            <linearGradient key={k} id={`lg${k}-${s.name.length}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color || C.chart[k]} stopOpacity=".28" /><stop offset="100%" stopColor={s.color || C.chart[k]} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {[0, 0.5, 1].map((g) => <g key={g}><line x1={P.l} x2={W - P.r} y1={y(max * g)} y2={y(max * g)} stroke="#E2E8F0" /><text x={P.l - 6} y={y(max * g) + 4} fontSize="12" textAnchor="end" fill="#64748B">{Math.round(max * g)}{unit}</text></g>)}
        {series.map((s, k) => {
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          const col = s.color || C.chart[k];
          return (
            <g key={s.name}>
              {s.values.length > 1 && <polygon points={`${x(0)},${y(0)} ${pts} ${x(s.values.length - 1)},${y(0)}`} fill={`url(#lg${k}-${s.name.length})`} />}
              <polyline points={pts} fill="none" stroke={col} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3.5" fill="#fff" stroke={col} strokeWidth="2" />)}
            </g>
          );
        })}
        {labels.map((l, i) => (i % step === 0 || i === labels.length - 1) && <text key={i} x={x(i)} y={H - 6} fontSize="12" textAnchor="middle" fill="#64748B">{l}</text>)}
      </svg>
      {series.length > 1 && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 14, color: "var(--mut)", marginTop: 4 }}>
          {series.map((s, k) => <span key={s.name}><span style={{ display: "inline-block", width: 12, height: 4, borderRadius: 2, background: s.color || C.chart[k], marginRight: 6, verticalAlign: "middle" }} />{s.name}</span>)}
        </div>
      )}
    </div>
  );
}

/** 环形进度：中心大数字 */
export function Ring({ value, max = 100, label, color = C.accent, size = 132 }: { value: number; max?: number; label?: string; color?: string; size?: number }) {
  const r = 52, len = 2 * Math.PI * r, p = Math.max(0, Math.min(1, max ? value / max : 0));
  return (
    <div style={{ width: size, textAlign: "center" }}>
      <svg viewBox="0 0 132 132" style={{ width: size, height: size }} role="img" aria-label={`${label || ""} ${Math.round(p * 100)}%`}>
        <circle cx="66" cy="66" r={r} fill="none" stroke="#E2E8F0" strokeWidth="12" />
        <circle cx="66" cy="66" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${len * p} ${len}`} transform="rotate(-90 66 66)" />
        <text x="66" y="72" textAnchor="middle" fontSize="26" fontWeight="800" fill="#1F2937">{Math.round(p * 100)}%</text>
      </svg>
      {label && <div style={{ fontSize: 14, color: "var(--mut)", marginTop: 2 }}>{label}</div>}
    </div>
  );
}

/** 步骤条：编号圆点 + 连线，done / doing / todo */
export function Steps({ items, onPick, active }: { items: { label: string; status: "done" | "doing" | "todo" | "soon" }[]; onPick?: (i: number) => void; active?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", overflowX: "auto", paddingBottom: 4 }}>
      {items.map((it, i) => {
        const done = it.status === "done", doing = it.status === "doing", on = active === i;
        const col = done ? C.ok : doing ? C.primary : "#94A3B8";
        return (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", flex: 1, minWidth: 96 }}>
            <button onClick={() => onPick?.(i)} style={{ background: "none", border: "none", cursor: onPick ? "pointer" : "default", fontFamily: "inherit", padding: 0, textAlign: "center", width: 96 }}>
              <div style={{ width: 38, height: 38, borderRadius: 19, margin: "0 auto", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 16,
                background: done ? C.ok : doing ? C.primary : "#fff", color: done || doing ? "#fff" : "#64748B", border: `2px solid ${col}`, boxShadow: on ? `0 0 0 4px ${col}33` : "none" }}>{done ? "✓" : i + 1}</div>
              <div style={{ fontSize: 14, marginTop: 6, color: on ? "var(--ink)" : "var(--mut)", fontWeight: on ? 700 : 500, lineHeight: 1.35 }}>{it.label}</div>
            </button>
            {i < items.length - 1 && <div style={{ flex: 1, height: 3, marginTop: 18, minWidth: 12, background: done ? C.ok : "#E2E8F0", borderRadius: 2 }} />}
          </div>
        );
      })}
    </div>
  );
}

export const btn = (kind: "primary" | "ghost" | "orange" = "primary"): CSSProperties => ({
  display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textDecoration: "none",
  border: kind === "ghost" ? "1px solid #CBD5E1" : "none", background: kind === "primary" ? C.primary : kind === "orange" ? C.orange : "#fff", color: kind === "ghost" ? "var(--ink)" : "#fff",
});

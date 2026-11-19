"use client";
// 虚实对局 · 对战画面的共用部件：水晶头像、对战人物、头顶对话、能量条、回合横幅、舞台。
import { useEffect as useEffectSafe, useState as useStateSafe } from "react";
import type { CSSProperties, ReactNode } from "react";

export const C = { cyan: "#38D6EE", orange: "#FF9F5A", amber: "#FFD166", violet: "#B79CFF", green: "#5EE0A0", pink: "#E06BC0", panel: "#0D1428", ink: "#E8EEF9", mut: "#9FB0CC", line: "#26324F" };
export const ARCADE: CSSProperties = { fontWeight: 900, fontStyle: "italic", letterSpacing: 1 };
export const MONO: CSSProperties = { fontFamily: "ui-monospace, 'SF Mono', Consolas, 'Courier New', monospace", fontWeight: 800 };

export function Avatar({ src, size, alt = "", ring, style }: { src: string; size: number; alt?: string; ring?: string; style?: CSSProperties }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} width={size} height={size} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, boxShadow: ring ? `0 0 0 2px ${ring}, 0 0 18px ${ring}88` : undefined, ...style }} />;
}

export function Wave({ color, h = 24 }: { color: string; h?: number }) {
  return <span className="bt-wave" aria-hidden="true" style={{ height: h }}>{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ height: h, background: color }} />)}</span>;
}

/** 头顶对话：谁说话，就出现在谁的头顶 */
export function Speech({ color, name, children, fs = 16, extra }: { color: string; name: string; children: ReactNode; fs?: number; extra?: ReactNode }) {
  const a = Math.round(fs * 0.5);
  return (
    <div className="bt-cap" style={{ position: "relative", boxSizing: "border-box", width: "100%", border: `3px solid ${color}`, borderRadius: 14, background: C.panel, padding: `${Math.round(fs * 0.45)}px ${Math.round(fs * 0.7)}px`, marginBottom: Math.round(fs * 0.6) }}>
      <div style={{ fontSize: Math.max(11, Math.round(fs * 0.62)), color, fontWeight: 900 }}>{name}</div>
      <div style={{ fontSize: fs, lineHeight: 1.45, fontWeight: 500, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{children}</div>
      {extra}
      <div aria-hidden="true" style={{ position: "absolute", left: "50%", bottom: -Math.round(fs * 0.36), width: a, height: a, marginLeft: -a / 2, background: C.panel, borderRight: `3px solid ${color}`, borderBottom: `3px solid ${color}`, transform: "rotate(45deg)" }} />
    </div>
  );
}

/** 对战人物：水晶头像 + 旋转光环 + 底座 + 身份名牌；两人各向中间转一个角度，面对面 */
export function Fighter({ src, size, color, side, talking, lunge, title, sub, top, topH = 0, colW, second }: {
  src: string; size: number; color: string; side: "l" | "r"; talking?: boolean; lunge?: boolean;
  title: string; sub: string; top?: ReactNode; topH?: number; colW?: number; second?: boolean;
}) {
  const H = size;
  return (
    <div style={{ width: colW || Math.round(H * 1.3), display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
      <div style={{ width: "100%", minHeight: topH, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>{top}</div>
      <div className={lunge ? (side === "l" ? "bt-lgl" : "bt-lgr") : undefined}>
        <div style={{ transform: `perspective(900px) rotateY(${side === "l" ? 16 : -16}deg)` }}>
          <div className={second ? "bt-float2" : "bt-float"} style={{ position: "relative", width: H, height: H }}>
            <svg className="bt-spin" viewBox="0 0 100 100" aria-hidden="true" style={{ position: "absolute", left: "-8%", top: "-8%", width: "116%", height: "116%" }}>
              <circle cx="50" cy="50" r="48.5" fill="none" stroke={color} strokeWidth="0.7" strokeDasharray="1.5 4" />
              <circle cx="50" cy="1.5" r="1.8" fill={color} /><circle cx="50" cy="98.5" r="1.2" fill="#ffffff" />
            </svg>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={talking ? "bt-talk" : undefined} src={src} alt={title} style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", borderRadius: "50%", objectFit: "cover", boxShadow: `0 0 44px ${color}99` }} />
            {talking && <div style={{ position: "absolute", top: "60%", ...(side === "l" ? { left: "104%" } : { right: "104%" }) }}><Wave color={color} h={Math.max(16, Math.round(H * 0.14))} /></div>}
          </div>
        </div>
      </div>
      <div aria-hidden="true" style={{ width: Math.round(H * 1.25), maxWidth: "100%", height: Math.round(H * 0.14), borderRadius: "50%", background: `radial-gradient(ellipse at center, ${color}99 0%, transparent 70%)`, marginTop: Math.round(H * 0.05) }} />
      <div style={{ marginTop: -Math.round(H * 0.05), textAlign: "center", border: `2px solid ${color}`, borderRadius: 10, background: C.panel, padding: `${Math.max(3, Math.round(H * 0.02))}px ${Math.max(10, Math.round(H * 0.07))}px`, maxWidth: "100%" }}>
        <div style={{ fontSize: Math.max(14, Math.round(H * 0.095)), lineHeight: 1.25, fontWeight: 900 }}>{title}</div>
        <div style={{ fontSize: Math.max(11, Math.round(H * 0.062)), color }}>{sub}</div>
      </div>
    </div>
  );
}

/** 能量条：左侧条向中间靠齐，右侧条向外消耗 */
export function Bar({ w, h, color, value, side }: { w: number | string; h: number; color: string; value: number; side: "l" | "r" }) {
  return (
    <div style={{ width: w, maxWidth: "100%", height: h, boxSizing: "border-box", transform: "skewX(-18deg)", border: `${h > 20 ? 3 : 2}px solid ${C.ink}`, background: "#1A2238", overflow: "hidden", display: "flex", justifyContent: side === "l" ? "flex-end" : "flex-start" }}
      role="img" aria-label={`${Math.round(value)}%`}>
      <div style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: "100%", background: color, transition: "width .6s" }} />
    </div>
  );
}

/** 回合横幅：文字变化时重新"砸入" */
export function Banner({ text, color, stroke, size }: { text: string; color: string; stroke: string; size: number }) {
  if (!text) return null;
  return <div key={text} className="bt-slam" style={{ ...ARCADE, display: "inline-block", fontSize: size, lineHeight: 1, color, WebkitTextStroke: `${size > 60 ? 2 : 1}px ${stroke}`, whiteSpace: "nowrap" }}>{text}</div>;
}

const STARS = [[6, 12], [14, 40], [23, 8], [31, 30], [42, 16], [55, 6], [63, 34], [72, 14], [81, 28], [90, 10], [96, 44], [48, 46]];

/** 舞台：聚光背景 + 闪烁星点 + 流动的透视地板 */
export function Stage({ children, tint = "#1B2B6B", floorBottom = 0, floorH = 170, style }: { children: ReactNode; tint?: string; floorBottom?: number; floorH?: number; style?: CSSProperties }) {
  return (
    <div style={{ position: "relative", overflow: "hidden", background: "#0A1024", border: `1px solid ${C.line}`, borderRadius: 14, ...style }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: `radial-gradient(ellipse at 50% 36%, ${tint} 0%, #0A1024 66%)` }} />
      {STARS.map(([x, y], i) => <div key={i} aria-hidden="true" className="bt-tw" style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: 4, height: 4, borderRadius: "50%", background: "#fff", animationDelay: `-${(i * 0.37) % 2.4}s` }} />)}
      <div aria-hidden="true" className="bt-grid" style={{ position: "absolute", left: "-15%", width: "130%", bottom: floorBottom, height: floorH, transform: "perspective(700px) rotateX(64deg)", transformOrigin: "50% 100%", backgroundImage: "repeating-linear-gradient(0deg, #38D6EE55 0 2px, transparent 2px 80px), repeating-linear-gradient(90deg, #38D6EE55 0 2px, transparent 2px 80px)" }} />
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}

export function useNarrow(bp = 980): boolean {
  // 仅用于在手机宽度下缩小人物尺寸；首屏按桌面渲染，挂载后再校正
  const [n, setN] = useStateSafe(false);
  useEffectSafe(() => {
    const f = () => setN(window.innerWidth < bp);
    f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f);
  }, [bp]);
  return n;
}

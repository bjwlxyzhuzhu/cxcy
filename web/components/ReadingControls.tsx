"use client";
import { useEffect, useState } from "react";
export default function ReadingControls() {
  const [reading, setReading] = useState(true);
  useEffect(() => {
    let enabled = true;
    try {
      enabled = localStorage.getItem("cxcy-reading") !== "original";
    } catch {
      /* 默认阅读模式 */
    }
    setReading(enabled);
    document.documentElement.dataset.reading = enabled ? "on" : "off";
  }, []);
  function change() {
    const enabled = !reading;
    setReading(enabled);
    document.documentElement.dataset.reading = enabled ? "on" : "off";
    try {
      localStorage.setItem("cxcy-reading", enabled ? "on" : "original");
    } catch {
      /* 会话内仍生效 */
    }
  }
  return (
    <div className="reading-controls">
      <a href="/guide">使用手册</a>
      <a href="/me/credits">积分中心</a>
      <button onClick={change} aria-pressed={reading}>
        {reading ? "恢复原星空" : "开启阅读模式"}
      </button>
    </div>
  );
}

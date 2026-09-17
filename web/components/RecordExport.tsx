"use client";
import { useState } from "react";
const formats = [
  ["docx", "Word DOCX"],
  ["rtf", "Word RTF"],
  ["xlsx", "Excel"],
  ["pdf", "PDF"],
  ["csv", "CSV"],
  ["json", "JSON"],
  ["md", "Markdown"],
];
export default function RecordExport({
  endpoint,
  label = "导出记录",
}: {
  endpoint: string;
  label?: string;
}) {
  const [format, setFormat] = useState("docx"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        endpoint + (endpoint.includes("?") ? "&" : "?") + "format=" + format,
      );
      if (!res.ok) throw new Error((await res.json()).error || "导出失败");
      const blob = await res.blob();
      const name = res.headers
        .get("content-disposition")
        ?.match(/filename\*=UTF-8''(.+)/)?.[1];
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name ? decodeURIComponent(name) : "记录." + format;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "下载失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span
      style={{
        display: "inline-flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <select
        aria-label="导出格式"
        value={format}
        onChange={(e) => setFormat(e.target.value)}
        style={{ color: "#111", padding: 7, borderRadius: 6 }}
      >
        {formats.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
      <button
        disabled={busy}
        onClick={download}
        style={{
          padding: "8px 12px",
          borderRadius: 7,
          cursor: "pointer",
          background: "#67e8f9",
          color: "#071120",
          border: 0,
        }}
      >
        {busy ? "正在导出…" : label}
      </button>
      {error && (
        <span role="alert" style={{ color: "#ff9a9a" }}>
          {error}
        </span>
      )}
    </span>
  );
}

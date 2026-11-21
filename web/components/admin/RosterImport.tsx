"use client";
import { useState } from "react";

type Row = { student_no: string; name: string; class?: string; college?: string; major?: string; role?: string; teacher?: string; classes?: string };
type Res = { student_no: string; name: string; role?: string; status: "created" | "exists" | "failed"; password?: string; error?: string };

// 弹性表头匹配：把各种叫法归到标准字段
const ALIASES: Record<keyof Row, string[]> = {
  student_no: ["学号", "studentno", "student_no", "no", "编号", "工号", "学号/工号", "账号", "account"],
  name: ["姓名", "name", "名字", "学生姓名"],
  class: ["班级", "class", "行政班", "班级名称"],
  college: ["学院", "college", "院系", "二级学院"],
  major: ["专业", "major", "专业名称"],
  role: ["角色", "role", "身份", "类型"],
  teacher: ["任课教师", "任课教师工号", "教师工号", "teacher", "老师"],
  classes: ["授课班级", "负责班级", "classes", "所带班级"],
};
const ROLE_LABEL: Record<string, string> = { student: "学生", teacher: "教师", admin: "管理员" };
function fieldOf(header: string): keyof Row | null {
  const h = header.toString().trim().toLowerCase().replace(/\s/g, "");
  for (const f of Object.keys(ALIASES) as (keyof Row)[]) if (ALIASES[f].some((a) => a.toLowerCase() === h)) return f;
  return null;
}

export default function RosterImport() {
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [password, setPassword] = useState("Chuang@2026");
  const [defaultRole, setDefaultRole] = useState("student");
  const [credits, setCredits] = useState(120);
  const [randomPasswords, setRandomPasswords] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created: number; exists: number; failed: number; results: Res[]; linked?: number; missingTeachers?: string[] } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setErr(""); setResult(null); setRows([]); setFileName(f.name);
    try {
      const XLSX = await import("xlsx");
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false }) as unknown[][];
      if (!grid.length) { setErr("表格是空的"); return; }
      const headers = (grid[0] as unknown[]).map((x) => (x ?? "").toString());
      const colMap = headers.map(fieldOf);
      if (!colMap.includes("student_no")) { setErr("没找到「学号 / 工号」列，请确认表头含 学号 或 工号"); return; }
      const out: Row[] = [];
      for (let i = 1; i < grid.length; i++) {
        const r = grid[i] as unknown[];
        const row: Row = { student_no: "", name: "" };
        colMap.forEach((f, c) => { if (f) (row[f] as string) = (r[c] ?? "").toString().trim(); });
        if (row.student_no) out.push(row);
      }
      if (!out.length) { setErr("没有解析到有效行（每行需有学号 / 工号）"); return; }
      setRows(out);
    } catch (e2) {
      setErr("解析失败：" + (e2 instanceof Error ? e2.message : "请用 CSV 或 XLSX"));
    }
  }

  async function doImport() {
    if (!rows.length || busy) return;
    if (password.trim().length < 6) { setErr("初始密码至少 6 位"); return; }
    setBusy(true); setErr(""); setResult(null);
    try {
      const res = await fetch("/api/admin/import-roster", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, password: password.trim(), credits, randomPasswords, defaultRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(data.error || ("导入失败 " + res.status)); }
      else setResult(data);
    } catch { setErr("网络错误，请稍后重试"); }
    setBusy(false);
  }

  const inp: React.CSSProperties = { padding: "8px 12px", borderRadius: 10, border: "1px solid var(--line)", background: "#F1F5F9", color: "var(--ink)", fontSize: 15, outline: "none", fontFamily: "inherit" };

  return (
    <div>
      <div style={{ border: "1px solid var(--line)", borderRadius: 16, background: "#F1F5F9", padding: 18, marginBottom: 18 }}>
        <div style={{ fontSize: 15, color: "var(--mut)", lineHeight: 1.7, marginBottom: 14 }}>
          上传名单（CSV 或 XLSX），表头需包含 <b style={{ color: "var(--ink)" }}>学号（或工号）、姓名</b>，可选 <b style={{ color: "var(--ink)" }}>角色</b>（学生 / 教师 / 管理员，不填按下方默认）、班级、学院、专业。
          <br />学生与老师关联：教师行填 <b style={{ color: "var(--ink)" }}>授课班级</b>（多个用顿号隔开），或学生行填 <b style={{ color: "var(--ink)" }}>任课教师</b>（教师工号）。教师导入学生名单时，这些班级自动关联到本人；教师 / 管理员账号只能由管理员导入。已存在的账号会重置初始密码（可重复导入）。
          <div style={{ marginTop: 8 }}><button onClick={downloadTemplate} style={smallBtn}>⬇ 下载名单模板</button></div>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ ...inp, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
            📎 选择文件
            <input type="file" accept=".csv,.xlsx,.xls" onChange={onFile} style={{ display: "none" }} />
          </label>
          {fileName && <span style={{ fontSize: 14, color: "var(--mut)" }}>{fileName} · 解析到 {rows.length} 行</span>}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--mut)" }}>默认角色
            <select value={defaultRole} onChange={(e) => setDefaultRole(e.target.value)} style={{ ...inp, width: 100 }}>
              {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v} style={{ background: "#fff" }}>{l}</option>)}
            </select></span>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--mut)" }}><input type="checkbox" checked={randomPasswords} onChange={(e) => setRandomPasswords(e.target.checked)} /> 每人随机临时密码</label>
          {!randomPasswords && <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--mut)" }}>统一初始密码 <input value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...inp, width: 150 }} /></span>}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, color: "var(--mut)" }}>初始积分 <input type="number" value={credits} onChange={(e) => setCredits(Math.max(0, parseInt(e.target.value) || 0))} style={{ ...inp, width: 90 }} /></span>
          <button onClick={doImport} disabled={!rows.length || busy}
            style={{ padding: "9px 18px", borderRadius: 10, border: "none", fontWeight: 800, fontSize: 15, color: "#fff", cursor: (!rows.length || busy) ? "default" : "pointer", background: "linear-gradient(120deg,var(--cyan),var(--violet))", opacity: (!rows.length || busy) ? 0.5 : 1, fontFamily: "inherit" }}>
            {busy ? "导入中…" : `确认导入 ${rows.length} 个账号`}
          </button>
        </div>
        {err && <div style={{ color: "#B91C1C", fontSize: 14.5, marginTop: 12 }}>{err}</div>}
      </div>

      {rows.length > 0 && !result && (
        <Preview rows={rows} />
      )}

      {result && (
        <div style={{ border: "1px solid var(--line)", borderRadius: 16, background: "#F1F5F9", padding: 18 }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>
            导入完成：<span style={{ color: "var(--cyan)" }}>新建 {result.created}</span> · <span style={{ color: "var(--mut)" }}>已存在 {result.exists}</span>{result.failed > 0 && <> · <span style={{ color: "#B91C1C" }}>失败 {result.failed}</span></>}
          </div>
          {(result.linked || 0) > 0 && <div style={{ fontSize: 14, color: "#15803D", marginBottom: 6 }}>新建班级与教师关联 {result.linked} 条</div>}
          {(result.missingTeachers?.length || 0) > 0 && <div style={{ fontSize: 14, color: "#B45309", marginBottom: 6 }}>这些任课教师工号还没有教师账号，未能关联：{result.missingTeachers!.join("、")}（先导入教师再重导学生即可）</div>}
          <div style={{ fontSize: 14, color: "var(--mut)", marginBottom: 12 }}>{randomPasswords ? "已为每位生成独立临时密码，请下载凭据表后逐人发放；学生首次登录后须修改密码。" : <>所有账号初始密码：<b style={{ color: "var(--ink)" }}>{password}</b>，请通知首次登录后到「账户中心」修改。</>}</div>
          {randomPasswords && <button onClick={() => downloadCredentials(result.results)} style={{ ...smallBtn }}>⬇ 下载账号凭据 CSV</button>}
          {result.failed > 0 && (
            <div style={{ fontSize: 14, color: "#B91C1C" }}>
              失败明细：{result.results.filter((r) => r.status === "failed").map((r) => `${r.student_no || "(无学号)"}(${r.error})`).join("；")}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function downloadCredentials(rows: Res[]) {
  const esc = (v: string | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = "账号,姓名,角色,临时密码\n" + rows.filter((r) => r.status !== "failed").map((r) => [r.student_no, r.name, ROLE_LABEL[r.role || "student"], r.password].map(esc).join(",")).join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); a.download = `账号凭据_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

/** 名单模板：示例行只用占位账号，不含真实信息 */
function downloadTemplate() {
  const csv = "角色,学号/工号,姓名,班级,授课班级,任课教师,学院,专业\n管理员,A0001,管理员示例,,,,,\n教师,T0001,教师示例,,示例班1、示例班2,,,\n学生,S0001,学生示例,示例班1,,T0001,,\n";
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" })); a.download = "名单模板.csv"; a.click(); URL.revokeObjectURL(a.href);
}

const smallBtn: React.CSSProperties = { padding: "7px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "#F1F5F9", color: "var(--ink)", cursor: "pointer", fontFamily: "inherit" };

function Preview({ rows }: { rows: Row[] }) {
  const show = rows.slice(0, 8);
  const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 13.5, color: "var(--mut)", fontWeight: 600, borderBottom: "1px solid var(--line)" };
  const td: React.CSSProperties = { padding: "8px 10px", fontSize: 14.5, borderBottom: "1px solid #F1F5F9" };
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 16, background: "#F1F5F9", padding: 18, overflowX: "auto" }}>
      <div style={{ fontSize: 14.5, color: "var(--mut)", marginBottom: 10 }}>预览（前 {show.length} / 共 {rows.length} 行）：</div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr><th style={th}>角色</th><th style={th}>学号/工号</th><th style={th}>姓名</th><th style={th}>班级</th><th style={th}>授课班级 / 任课教师</th><th style={th}>学院</th></tr></thead>
        <tbody>
          {show.map((r, i) => (
            <tr key={i}><td style={td}>{r.role || "（默认）"}</td><td style={td}>{r.student_no}</td><td style={td}>{r.name}</td><td style={td}>{r.class || "—"}</td><td style={td}>{r.classes || r.teacher || "—"}</td><td style={td}>{r.college || "—"}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

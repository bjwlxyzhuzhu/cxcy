import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import * as XLSX from "xlsx";
import PDFDocument from "pdfkit";
import { existsSync } from "node:fs";
export type Report = {
  title: string;
  metadata: Record<string, unknown>;
  rows: Record<string, unknown>[];
};
export const FORMATS = [
  "docx",
  "rtf",
  "xlsx",
  "pdf",
  "json",
  "csv",
  "md",
] as const;
export type Format = (typeof FORMATS)[number];
const stringValue = (v: unknown): string =>
  v === null || v === undefined
    ? "NA"
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);
export function flatten(
  row: Record<string, unknown>,
  prefix = "",
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const key = prefix ? prefix + "." + k : k;
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date))
      Object.assign(out, flatten(v as Record<string, unknown>, key));
    else
      out[key] =
        v instanceof Date
          ? v.toISOString()
          : Array.isArray(v)
            ? JSON.stringify(v)
            : v;
  }
  return out;
}
export function spreadsheetRows(rows: Report["rows"]) {
  // Excel 单元格上限32767；长文本分段保留，不静默截断。
  return rows.flatMap((row, index) => {
    const r = flatten(row);
    const parts = Math.max(
      1,
      ...Object.values(r).map((v) => Math.ceil(stringValue(v).length / 30000)),
    );
    return Array.from({ length: parts }, (_, part) =>
      Object.fromEntries([
        ["record", index + 1],
        ["part", part + 1],
        ...Object.entries(r).map(([k, v]) => [
          k,
          typeof v === "string"
            ? v.slice(part * 30000, (part + 1) * 30000)
            : part === 0
              ? v
              : null,
        ]),
      ]),
    );
  });
}
const lines = (r: Report) => [
  r.title,
  ...Object.entries(r.metadata).map(([k, v]) => k + "：" + stringValue(v)),
  ...r.rows.flatMap((row, i) => [
    "",
    `记录 ${i + 1}`,
    ...Object.entries(flatten(row)).map(([k, v]) => k + "：" + stringValue(v)),
  ]),
];
const csvCell = (v: unknown) => {
  let s = stringValue(v);
  if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};
const rtfText = (s: string) =>
  Array.from(s)
    .map((c) =>
      c === "\\"
        ? "\\\\"
        : c === "{"
          ? "\\{"
          : c === "}"
            ? "\\}"
            : c === "\n"
              ? "\\line "
              : c.charCodeAt(0) > 127
                ? Array.from({ length: c.length }, (_, i) => {
                    const n = c.charCodeAt(i);
                    return "\\u" + (n > 32767 ? n - 65536 : n) + "?";
                  }).join("")
                : c,
    )
    .join("");
export async function renderReport(
  report: Report,
  format: Format,
): Promise<{ data: Buffer; type: string }> {
  if (format === "json")
    return {
      data: Buffer.from(JSON.stringify(report, null, 2)),
      type: "application/json",
    };
  if (format === "md")
    return {
      data: Buffer.from(lines(report).join("\n\n")),
      type: "text/markdown; charset=utf-8",
    };
  if (format === "rtf")
    return {
      data: Buffer.from(
        "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\uc1\\fs22 " +
          lines(report).map(rtfText).join("\\par\n") +
          "}",
        "ascii",
      ),
      type: "application/rtf",
    };
  if (format === "csv") {
    const rows = spreadsheetRows(report.rows);
    const cols = [...new Set(rows.flatMap(Object.keys))];
    return {
      data: Buffer.from(
        "\ufeff" +
          [
            cols.map(csvCell).join(","),
            ...rows.map((r) => cols.map((k) => csvCell(r[k])).join(",")),
          ].join("\r\n"),
      ),
      type: "text/csv; charset=utf-8",
    };
  }
  if (format === "xlsx") {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        Object.entries(report.metadata).map(([field, value]) => ({
          field,
          value: stringValue(value),
        })),
      ),
      "导出说明",
    );
    const sheet = XLSX.utils.json_to_sheet(spreadsheetRows(report.rows));
    sheet["!cols"] = Array.from({ length: 30 }, () => ({ wch: 24 }));
    XLSX.utils.book_append_sheet(wb, sheet, "完整记录");
    return {
      data: XLSX.write(wb, { type: "buffer", bookType: "xlsx" }),
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }
  if (format === "docx") {
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: { font: "宋体", size: 22 },
            paragraph: { spacing: { after: 140 } },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              size: { width: 11906, height: 16838 },
              margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 },
            },
          },
          children: lines(report).flatMap((s, i) =>
            s
              .split("\n")
              .map(
                (line) =>
                  new Paragraph({
                    ...(i === 0 ? { heading: HeadingLevel.TITLE } : {}),
                    children: [new TextRun({ text: line })],
                  }),
              ),
          ),
        },
      ],
    });
    return {
      data: await Packer.toBuffer(doc),
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }
  const candidates = [
    process.env.EXPORT_PDF_FONT,
    "/usr/share/fonts/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
    "C:/Windows/Fonts/simsun.ttc",
  ].filter(Boolean) as string[];
  const font = candidates.find(existsSync);
  if (!font)
    throw new Error(
      "PDF中文字体未安装：请配置 EXPORT_PDF_FONT 或安装 font-noto-cjk",
    );
  const pdf = new PDFDocument({
    size: "A4",
    margin: 48,
    info: { Title: report.title },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on("data", (c) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });
  if (font.toLowerCase().includes("simsun")) pdf.font(font, "SimSun");
  else if (font.endsWith(".ttc"))
    pdf.font(
      font,
      process.env.EXPORT_PDF_FONT_FAMILY || "NotoSansCJKsc-Regular",
    );
  else pdf.font(font);
  for (const [i, s] of lines(report).entries())
    pdf
      .fontSize(i === 0 ? 18 : 10)
      .text(s || " ", { lineGap: 4 })
      .moveDown(0.35);
  pdf.end();
  return { data: await done, type: "application/pdf" };
}
export async function reportResponse(report: Report, format: string) {
  if (!FORMATS.includes(format as Format))
    return Response.json({ error: "不支持此导出格式" }, { status: 400 });
  const result = await renderReport(report, format as Format);
  const filename =
    report.title.replace(/[\\/:*?"<>|\r\n]/g, "_").slice(0, 70) + "." + format;
  return new Response(new Uint8Array(result.data), {
    headers: {
      "Content-Type": result.type,
      "Content-Disposition": `attachment; filename="records.${format}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

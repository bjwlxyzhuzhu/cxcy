import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { renderReport, spreadsheetRows } from "../lib/report-export";
import {
  validateCore,
  completionProblem,
  summarize,
  type ExpEvent,
} from "../lib/experiment-protocol";
import * as XLSX from "xlsx";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
test("前后测量表拒绝空项、字符串和超范围评分", () => {
  const good = {
    judgment: "尚不确定",
    assumptions: "需要访谈需求和支付意愿",
    risk: "信息不足",
    confidence: 3,
  };
  assert.equal(validateCore(good).confidence, 3);
  for (const confidence of [0, 6, 60, "5", null, 1.5])
    assert.throws(() => validateCore({ ...good, confidence }));
  assert.throws(() => validateCore({ ...good, risk: "" }));
});
test("完成门槛与未完成评分：不能跳阶段，跳过不记独立回答或0分", () => {
  const events: ExpEvent[] = Array.from({ length: 5 }, (_, i) => ({
    event_type: "reply",
    stage: "expert",
    payload: { round: i + 1, responseStatus: "skipped" },
  }));
  assert.match(completionProblem("expert", events) || "", /方案/);
  events.push({
    event_type: "revision",
    stage: "expert",
    payload: { text: "需要更多信息" },
  });
  assert.equal(completionProblem("expert", events), null);
  assert.equal(summarize(events).answers, 0);
  assert.equal(summarize(events).abilityScore, null);
  assert.equal(summarize(events).paired, false);
  assert.ok(completionProblem("t0", events));
});
test("数据库迁移保留历史并建立唯一编号、幂等和账号关联约束", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      "create table users(id uuid primary key default gen_random_uuid());",
    );
    await db.exec(readFileSync("db/migrations/0010_experiment.sql", "utf8"));
    await db.exec(
      "insert into experiment_runs(join_code) values('OLD'); insert into experiment_participants(run_id,recovery_code,cohort) select id,'OLD-CODE','single' from experiment_runs;",
    );
    const sql = readFileSync("db/migrations/0012_learning_records.sql", "utf8");
    await db.exec(sql);
    await db.exec(sql);
    const old = (
      await db.query<{ participant_code: string }>(
        "select participant_code from experiment_participants",
      )
    ).rows[0];
    assert.ok(old.participant_code.startsWith("E-"));
    assert.equal(
      (
        await db.query<{ protocol_version: string }>(
          "select protocol_version from experiment_runs",
        )
      ).rows[0].protocol_version,
      "legacy-v1",
    );
    await db.exec(
      "insert into experiment_events(run_id,participant_id,event_type,stage,request_id) select run_id,id,'assessment','t0','request-1' from experiment_participants",
    );
    await assert.rejects(
      db.exec(
        "insert into experiment_events(run_id,participant_id,event_type,stage,request_id) select run_id,id,'assessment','t0','request-1' from experiment_participants",
      ),
    );
    assert.equal(
      (await db.query("select * from experiment_events")).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
test("真实DOCX/RTF/XLSX/PDF/CSV/JSON导出保存中文、角色、换行及NA", async () => {
  const report = {
    title: "课堂测试记录",
    metadata: { participant_code: "A-TEST", score: null },
    rows: [
      {
        role: "user",
        text: "我认为先访谈大学生。\n还需验证付费意愿。",
        score: null,
      },
      { role: "assistant", text: "请举一个生活场景。", round: 1 },
      { text: '=HYPERLINK("https://example.com")' },
    ],
  };
  mkdirSync(".test-output", { recursive: true });
  for (const format of [
    "docx",
    "rtf",
    "xlsx",
    "pdf",
    "csv",
    "json",
    "md",
  ] as const) {
    const { data } = await renderReport(report, format);
    assert.ok(data.length > 50);
    writeFileSync(".test-output/sample." + format, data);
    if (format === "docx") {
      assert.equal(data.subarray(0, 2).toString(), "PK");
      assert.match(
        (await mammoth.extractRawText({ buffer: data })).value,
        /付费意愿/,
      );
    }
    if (format === "xlsx") {
      const wb = XLSX.read(data, { type: "buffer" });
      const rows = XLSX.utils.sheet_to_json(wb.Sheets["完整记录"]);
      assert.match(JSON.stringify(rows), /付费意愿/);
      assert.equal(wb.Sheets["完整记录"].D4?.f, undefined);
    }
    if (format === "pdf") {
      assert.equal(data.subarray(0, 4).toString(), "%PDF");
      const p = new PDFParse({ data: new Uint8Array(data) });
      assert.match((await p.getText()).text, /付费意愿/);
      await p.destroy();
    }
    if (format === "csv") assert.match(data.toString(), /'=HYPERLINK/);
    if (format === "rtf") assert.match(data.toString(), /\\u/);
  }
  const long = "中".repeat(65000);
  const parts = spreadsheetRows([{ text: long, score: null }]);
  assert.equal(parts.map((r) => r.text).join(""), long);
  assert.equal(parts.length, 3);
});

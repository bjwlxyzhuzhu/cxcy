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
import {
  experimentReport,
  beijingTime,
  type ExportEvent,
} from "../lib/experiment-report";
import { experimentSignals } from "../lib/supervision-rules";
test("实验导出分组、前后测、缺项、北京时间及阶段用时可核对", async () => {
  const run = {
    id: "run-1",
    title: "测试课堂",
    protocol_version: "guided-v2",
    starts_at: "2026-09-17T00:00:00Z",
  };
  const people = [
    {
      id: "p1",
      run_id: run.id,
      participant_code: "A-1",
      cohort: "single",
      stage: "completed",
      created_at: "2026-09-16T23:50:00Z",
    },
    {
      id: "p2",
      run_id: run.id,
      participant_code: "B-1",
      cohort: "panel",
      stage: "t0",
    },
  ];
  const core = {
    instrument: "core-v2",
    judgment: "有条件支持",
    assumptions: "需求和成本",
    risk: "隐私",
    confidence: 3,
  };
  const events: ExportEvent[] = [
    {
      participant_id: "p1",
      stage: "t0",
      event_type: "assessment",
      payload: core,
      created_at: "2026-09-17T00:02:00Z",
    },
    {
      participant_id: "p1",
      stage: "t0",
      event_type: "advance",
      payload: { next: "orient" },
      created_at: "2026-09-17T00:03:00Z",
    },
    {
      participant_id: "p1",
      stage: "t1",
      event_type: "assessment",
      payload: core,
      created_at: "2026-09-17T00:30:00Z",
    },
    {
      participant_id: "p1",
      stage: "survey",
      event_type: "advance",
      payload: { next: "completed" },
      created_at: "2026-09-17T00:40:00Z",
    },
  ];
  const report = experimentReport({
    title: "分组报告",
    runs: [run],
    participants: people,
    events,
  });
  assert.equal(beijingTime(events[0].created_at), "2026-09-17 08:02:00");
  const paired = report.sections!.find((s) => s.name === "前后测配对")!.rows;
  assert.equal(paired[0].配对状态, "同量表已配对");
  assert.equal(paired[1].配对状态, "前后测均缺失");
  assert.equal(paired[1].后测_把握程度1至5, null);
  assert.equal(
    report.sections!.find((s) => s.name === "阶段用时")!.rows[0].阶段经过秒数,
    180,
  );
  assert.equal(
    report.sections!.find((s) => s.name === "参与者与缺项")!.rows[0]
      .全程经过秒数,
    2400,
  );
  const wb = XLSX.read((await renderReport(report, "xlsx")).data, {
    type: "buffer",
  });
  for (const name of [
    "分组汇总",
    "前测",
    "后测",
    "前后测配对",
    "阶段用时",
    "过程记录",
  ])
    assert.ok(wb.Sheets[name]);
  assert.match(
    JSON.stringify(XLSX.utils.sheet_to_json(wb.Sheets["前测"])),
    /A组（综合专家）/,
  );
  assert.match(
    (await renderReport(report, "csv")).data.toString(),
    /2026-09-17 08:02:00/,
  );
  assert.match(
    (
      await mammoth.extractRawText({
        buffer: (await renderReport(report, "docx")).data,
      })
    ).value,
    /【前后测配对】/,
  );
  const filtered = experimentReport({
    title: "B组",
    runs: [run],
    participants: people,
    events,
    cohort: "panel",
  });
  assert.ok(!JSON.stringify(filtered.rows).includes("A-1"));
});
test("督导根据缺项和求助事实生成，不把正在进行当缺测或能力不足", () => {
  const events: ExpEvent[] = [
    { event_type: "assessment", stage: "t0", payload: {} },
  ];
  assert.equal(experimentSignals(events, false).length, 0);
  assert.equal(experimentSignals(events, true)[0].rule, "experiment_missing");
  events.push({
    event_type: "reply",
    stage: "expert",
    payload: { responseStatus: "skipped" },
  });
  assert.equal(experimentSignals(events, false)[0].rule, "experiment_skipped");
  events.push({
    event_type: "advance",
    stage: "survey",
    payload: { next: "completed" },
  });
  assert.ok(
    experimentSignals(events, false).some(
      (s) => s.rule === "experiment_review",
    ),
  );
});
import {
  createScenario,
  SCENARIOS,
  scenarioFor,
  experimentPath,
} from "../lib/experiment-scenarios";
test("题材快照、旧案例兼容与模块路径", () => {
  assert.equal(scenarioFor(null).id, "ai-campus-v1");
  for (const s of SCENARIOS) {
    assert.equal(createScenario(s.id).questions.length, 5);
    assert.deepEqual(scenarioFor(JSON.parse(JSON.stringify(s))), s);
  }
  assert.throws(() => createScenario("missing"));
  assert.throws(() => createScenario("custom", { title: "不完整" }));
  assert.equal(experimentPath("expert"), "/apply/expert?experiment=1");
  assert.equal(experimentPath("t1"), "/experiment");
});
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
    const scenariosSql = readFileSync(
      "db/migrations/0014_experiment_scenarios.sql",
      "utf8",
    );
    await db.exec(scenariosSql);
    await db.exec(scenariosSql);
    assert.equal(
      (
        await db.query<{ scenario: { id: string } }>(
          "select scenario from experiment_runs",
        )
      ).rows[0].scenario.id,
      "ai-campus-v1",
    );
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

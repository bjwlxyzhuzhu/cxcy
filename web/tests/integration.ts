// 在隔离的内存PostgreSQL及本地AI替身上测试真实HTTP接口，不访问真实学生数据或付费AI。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import bcrypt from "bcryptjs";

async function main() {
  const db = new PGlite();
  await db.exec(`create table users(id uuid primary key default gen_random_uuid(),student_no text unique,password_hash text,name text,role text);
 create table profiles(id uuid primary key,name text,student_no text,role text,credits int,research_consent boolean,class text,country text,native_lang text,hsk_level int,research_pid text,created_at timestamptz default now());
 create table sessions(user_id uuid,token_hash text,expires_at timestamptz);
 create table user_api_keys(user_id uuid,purpose text,base_url text,api_key text,model text);
 create table evidence_events(id serial,user_id uuid,project_id uuid,kind text,title text,dims jsonb,payload jsonb);
 create table challenge_sessions(id uuid,user_id uuid);create table dialogue_turns(id uuid,user_id uuid);create table plan_versions(id uuid,user_id uuid);create table ct_ratings(id uuid,user_id uuid);create table peer_feedback(id uuid,user_id uuid);create table usage_logs(id uuid,user_id uuid);create table projects(id uuid,user_id uuid);`);
  await db.exec(readFileSync("db/migrations/0010_experiment.sql", "utf8"));
  await db.exec(
    readFileSync("db/migrations/0012_learning_records.sql", "utf8"),
  );
  await db.exec(readFileSync("db/migrations/0013_presence.sql", "utf8"));
  await db.exec(
    readFileSync("db/migrations/0014_experiment_scenarios.sql", "utf8"),
  );
  const initialSchema = readFileSync("db/migrations/0001_init.sql", "utf8");
  const cardsStart = initialSchema.indexOf(
    "create table if not exists public.intervention_cards",
  );
  const cardsEnd = initialSchema.indexOf("-- 学生可读自己的卡", cardsStart);
  await db.exec(initialSchema.slice(cardsStart, cardsEnd));
  await db.exec(
    readFileSync("db/migrations/0015_supervision_sources.sql", "utf8"),
  );
  const pass = await bcrypt.hash("Fixture-only-2026", 4);
  for (const [studentNo, role] of [
    ["teacher-test", "admin"],
    ["ordinary-teacher", "teacher"],
    ["student-test", "student"],
    ["other-test", "student"],
  ]) {
    const id = randomUUID();
    await db.query("insert into users values($1,$2,$3,$4,$5)", [
      id,
      studentNo,
      pass,
      studentNo,
      role,
    ]);
    await db.query(
      "insert into profiles(id,name,student_no,role,credits,research_consent) values($1,$2,$2,$3,100,true)",
      [id, studentNo, role],
    );
    await db.query(
      "insert into user_api_keys values($1,'chat','http://127.0.0.1:3319/v1','fixture-key','fixture-model')",
      [id],
    );
  }
  const pg = new PGLiteSocketServer({
    db,
    port: 55439,
    host: "127.0.0.1",
    maxConnections: 64,
  });
  await pg.start();
  const aiPrompts: string[] = [];
  const ai = createServer(async (req, res) => {
    let input = "";
    for await (const chunk of req) input += chunk;
    if (req.url?.includes("embeddings")) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "fixture: no embeddings" } }));
      return;
    }
    const body = JSON.parse(input || "{}");
    aiPrompts.push(JSON.stringify(body.messages));
    const text = "可以先访谈几位同学，记录他们遇到的具体困难。";
    if (body.stream) {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(
        "data: " +
          JSON.stringify({ choices: [{ delta: { content: text } }] }) +
          "\n\ndata: [DONE]\n\n",
      );
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: text } }] }));
    }
  });
  await new Promise<void>((resolve) => ai.listen(3319, "127.0.0.1", resolve));
  const app = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      process.env.TEST_PRODUCTION ? "start" : "dev",
      "-p",
      "3318",
      "-H",
      "127.0.0.1",
    ],
    {
      windowsHide: true,
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55439/postgres",
        APIMART_API_KEY: "fixture-key",
        APIMART_BASE_URL: "http://127.0.0.1:3319/v1",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  app.stdout.on("data", (d) => {
    logs += d;
  });
  app.stderr.on("data", (d) => {
    logs += d;
  });
  const base = "http://127.0.0.1:3318";
  const makeClient = () => {
    const jar = new Map<string, string>();
    return async (path: string, body?: unknown) => {
      const r = await fetch(base + path, {
        method: body ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: [...jar].map(([k, v]) => k + "=" + v).join("; "),
          Referer: base + "/apply/expert",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      for (const raw of r.headers.getSetCookie()) {
        const pair = raw.split(";")[0];
        const at = pair.indexOf("=");
        jar.set(pair.slice(0, at), pair.slice(at + 1));
      }
      return r;
    };
  };
  const teacher = makeClient(),
    ordinaryTeacher = makeClient(),
    student = makeClient(),
    other = makeClient();
  const ok = async (r: Response) => {
    const d = await r.json();
    assert.ok(r.ok, JSON.stringify(d));
    return d;
  };
  const post = async (
    client: ReturnType<typeof makeClient>,
    body: Record<string, unknown>,
  ) =>
    ok(await client("/api/experiment", { ...body, requestId: randomUUID() }));
  try {
    for (let i = 0; i < 90; i++) {
      try {
        const r = await fetch(base + "/api/experiment");
        if (r.ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
      if (i === 89) throw new Error("Next启动超时 " + logs.slice(-3000));
    }
    assert.equal((await student("/api/records")).status, 401);
    for (const [client, name] of [
      [teacher, "teacher-test"],
      [ordinaryTeacher, "ordinary-teacher"],
      [student, "student-test"],
      [other, "other-test"],
    ] as const)
      await ok(
        await client("/api/auth/login", {
          studentNo: name,
          password: "Fixture-only-2026",
        }),
      );
    assert.equal(
      (await student("/api/presence", { path: "/apply/expert" })).status,
      204,
    );
    assert.equal((await student("/api/admin/presence")).status, 403);
    let presence = await ok(await teacher("/api/admin/presence"));
    assert.equal(
      presence.students.find(
        (s: { student_no: string }) => s.student_no === "student-test",
      ).online,
      true,
    );
    const sid = randomUUID(),
      rid = randomUUID();
    const ask = {
      sessionId: sid,
      requestId: rid,
      messages: [{ role: "user", content: "我的项目帮助同学规划学习。" }],
      system: "耐心解释",
    };
    await ok(await student("/api/ai/ask", ask));
    await ok(await student("/api/ai/ask", ask));
    assert.equal(
      (
        await db.query("select * from intervention_cards where source_key=$1", [
          "learning:" + sid + ":learning_review",
        ])
      ).rows.length,
      1,
    );
    let history = await ok(await student("/api/records?sessionId=" + sid));
    assert.equal(history.records.length, 2);
    assert.equal((await other("/api/records?sessionId=" + sid)).status, 404);
    assert.equal(
      (await other("/api/records/export?sessionId=" + sid)).status,
      404,
    );
    await ok(await student("/api/auth/logout", {}));
    presence = await ok(await teacher("/api/admin/presence"));
    assert.equal(
      presence.students.find(
        (s: { student_no: string }) => s.student_no === "student-test",
      ).logged_in,
      false,
    );
    assert.ok(
      presence.students.find(
        (s: { student_no: string }) => s.student_no === "student-test",
      ).last_seen_at,
    );
    assert.equal((await student("/api/records")).status, 401);
    await ok(
      await student("/api/auth/login", {
        studentNo: "student-test",
        password: "Fixture-only-2026",
      }),
    );
    history = await ok(await student("/api/records?sessionId=" + sid));
    assert.equal(history.records[0].content, ask.messages[0].content);
    for (const format of ["docx", "rtf", "xlsx", "pdf", "json", "csv", "md"]) {
      const r = await student(
        "/api/records/export?sessionId=" + sid + "&format=" + format,
      );
      assert.equal(r.status, 200, await r.clone().text());
      assert.ok((await r.arrayBuffer()).byteLength > 50);
    }
    assert.equal((await student("/api/admin/records")).status, 403);
    const run = await post(teacher, {
      action: "teacher_create",
      title: "集成测试课堂",
    });
    await post(teacher, { action: "teacher_start", runId: run.id });
    const joined = await post(student, {
      action: "join",
      joinCode: run.join_code,
      consent: true,
    });
    const pid = joined.participant.participant_code;
    assert.equal((await student("/api/ai/ask", ask)).status, 423);
    assert.equal(
      (await student("/api/experiment/ai", { stage: "t0", kind: "explain" }))
        .status,
      403,
    );
    assert.equal(
      (
        await student("/api/experiment", {
          action: "advance",
          stage: "t0",
          requestId: randomUUID(),
        })
      ).status,
      400,
    );
    await post(student, {
      action: "draft",
      stage: "t0",
      payload: { risk: "刷新后仍在的草稿" },
    });
    assert.equal(
      (await ok(await student("/api/experiment"))).drafts[0].payload.risk,
      "刷新后仍在的草稿",
    );
    const core = {
      judgment: "有条件支持",
      assumptions: "需求与付费意愿",
      risk: "隐私风险",
      confidence: 3,
    };
    for (const [stage, action, extra] of [
      ["t0", "assessment", { payload: core }],
      ["orient", "orientation", { understood: true }],
      ["cockpit", "plan", { text: "帮助同学学习，先访谈。" }],
    ] as const) {
      await post(student, { action, stage, ...extra });
      await post(student, { action: "advance", stage });
    }
    for (const [stage, total] of [
      ["expert", 5],
      ["defense", 3],
    ] as const) {
      for (let round = 1; round <= total; round++) {
        await post(student, { action: "question", stage });
        await post(student, { action: "question", stage });
        if (round === 1)
          await ok(
            await student("/api/experiment/ai", { stage, kind: "explain" }),
          );
        const body = {
          action: "reply",
          stage,
          round,
          responseStatus: round === 2 ? "skipped" : "answered",
          text:
            round === 2 ? "暂时没有接触过，想先调研" : "我会先访谈几位同学。",
          requestId: randomUUID(),
        };
        await ok(await student("/api/experiment", body));
        await ok(await student("/api/experiment", body));
      }
      if (stage === "expert")
        await post(student, {
          action: "revision",
          stage,
          text: "先从小范围访谈开始，暂不收集敏感信息。",
        });
      await post(student, { action: "advance", stage });
    }
    await post(student, { action: "assessment", stage: "t1", payload: core });
    await post(student, { action: "advance", stage: "t1" });
    assert.equal(
      (
        await student("/api/experiment", {
          action: "survey",
          stage: "survey",
          rating: 60,
          requestId: randomUUID(),
        })
      ).status,
      400,
    );
    await post(student, {
      action: "survey",
      stage: "survey",
      rating: 4,
      text: "更容易理解了",
    });
    await post(student, { action: "advance", stage: "survey" });
    const final = await ok(await student("/api/experiment"));
    assert.equal(final.stage.key, "completed");
    assert.equal(
      final.events.filter(
        (e: { event_type: string }) => e.event_type === "question",
      ).length,
      8,
    );
    const restoredCode = final.participant.recovery_code;
    await post(student, { action: "leave" });
    const rejoin = await post(student, {
      action: "join",
      joinCode: run.join_code,
      consent: true,
    });
    assert.equal(rejoin.participant.participant_code, pid);
    await post(student, { action: "leave" });
    await post(student, { action: "restore", recoveryCode: restoredCode });
    assert.equal(
      (await ok(await student("/api/experiment"))).stage.key,
      "completed",
    );
    const admin = await ok(await teacher("/api/admin/records?runId=" + run.id));
    assert.equal(admin.participants[0].paired, true);
    assert.equal(admin.participants[0].answers, 6);
    assert.equal(admin.participants[0].skipped, 2);
    assert.equal(admin.participants[0].abilityScore, null);
    for (const path of [
      "/api/experiment/export?format=pdf",
      "/api/admin/records?runId=" + run.id + "&format=xlsx",
      "/api/admin/research-export?format=xlsx",
    ]) {
      const r = await (path.includes("/admin/") ? teacher : student)(path);
      assert.equal(r.status, 200, await r.clone().text());
    }
    const research = await ok(await teacher("/api/admin/research-export"));
    assert.equal(research.learning_records.length, 2);
    assert.ok(!JSON.stringify(research).includes(restoredCode));
    assert.ok(!JSON.stringify(research).includes("student-test"));
    await post(teacher, { action: "teacher_close", runId: run.id });
    await post(student, { action: "leave" });
    const closedRestore = await post(student, {
      action: "join",
      joinCode: run.join_code,
      consent: true,
    });
    assert.equal(closedRestore.participant.participant_code, pid);
    assert.equal(
      (await ok(await student("/api/experiment"))).stage.key,
      "closed",
    );
    assert.equal(
      (await student("/api/experiment/export?stage=expert&format=json")).status,
      200,
    );
    assert.equal(
      (await other("/api/experiment", { action: "resume", runId: run.id }))
        .status,
      404,
    );
    const second = await post(teacher, {
      action: "teacher_create",
      title: "实验二自动衔接",
      scenarioId: "campus-reuse-v1",
    });
    await post(teacher, { action: "teacher_start", runId: second.id });
    await post(other, {
      action: "join",
      joinCode: second.join_code,
      consent: true,
    });
    assert.match(
      (await ok(await other("/api/experiment"))).caseText,
      /闲置教材/,
    );
    const preBody = {
      action: "assessment",
      stage: "t0",
      payload: core,
      advance: true,
      requestId: randomUUID(),
    };
    await ok(await other("/api/experiment", preBody));
    await ok(await other("/api/experiment", preBody));
    assert.equal(
      (await ok(await other("/api/experiment"))).stage.key,
      "orient",
    );
    const orient = await post(other, {
      action: "orientation",
      stage: "orient",
      understood: true,
      advance: true,
    });
    assert.equal(orient.nextPath, "/apply/cockpit?experiment=1");
    const cockpitPage = await other(orient.nextPath);
    assert.equal(cockpitPage.status, 200);
    assert.ok(cockpitPage.url.includes("/apply/cockpit?experiment=1"));
    const planText = "先为毕业同学回收教材，在一栋宿舍验证保管与取货服务。";
    const toExpert = await post(other, {
      action: "plan",
      stage: "cockpit",
      text: planText,
      advance: true,
    });
    assert.equal(toExpert.nextPath, "/apply/expert?experiment=1");
    assert.equal((await other(toExpert.nextPath)).status, 200);
    let current = await ok(await other("/api/experiment"));
    assert.equal(
      current.events.find((e: any) => e.event_type === "plan").payload.text,
      planText,
    );
    assert.equal(
      current.events.filter((e: any) => e.event_type === "question").length,
      1,
    );
    const aid = await ok(
      await other("/api/experiment/ai", { stage: "expert", kind: "framework" }),
    );
    assert.equal(aid.source, "ai");
    assert.ok(
      aiPrompts.some((p) => p.includes("闲置教材") && p.includes(planText)),
    );
    for (let round = 1; round <= 5; round++) {
      current = await ok(await other("/api/experiment"));
      assert.ok(
        current.events.some(
          (e: any) => e.event_type === "question" && e.payload.round === round,
        ),
      );
      await post(other, {
        action: "reply",
        stage: "expert",
        round,
        text: "先访谈，记录问题，再尝试少量服务。",
        responseStatus: "answered",
      });
    }
    const revision = "V1：只收教材，公开品相，约定取货时间和争议处理方式。";
    const toDefense = await post(other, {
      action: "revision",
      stage: "expert",
      text: revision,
      advance: true,
    });
    assert.equal(toDefense.nextPath, "/apply/defense?experiment=1");
    assert.equal((await other(toDefense.nextPath)).status, 200);
    current = await ok(await other("/api/experiment"));
    assert.equal(
      current.events.find((e: any) => e.event_type === "revision").payload.text,
      revision,
    );
    for (let round = 1; round <= 3; round++)
      await post(other, {
        action: "reply",
        stage: "defense",
        round,
        text: "先尝试少量教材寄售，记录同学的反馈。",
        responseStatus: "answered",
        advance: round === 3,
      });
    current = await ok(await other("/api/experiment"));
    assert.equal(current.stage.key, "t1");
    assert.equal(current.nextPath, "/experiment");
    await post(other, {
      action: "assessment",
      stage: "t1",
      payload: core,
      advance: true,
    });
    await post(other, {
      action: "survey",
      stage: "survey",
      rating: 4,
      advance: true,
    });
    current = await ok(await other("/api/experiment"));
    assert.equal(current.stage.key, "completed");
    assert.equal(
      current.events.filter((e: any) => e.event_type === "advance").length,
      7,
    );
    assert.equal(
      current.events.filter((e: any) => e.event_type === "question").length,
      8,
    );
    const secondExport = await ok(
      await other("/api/experiment/export?format=json"),
    );
    assert.match(JSON.stringify(secondExport), /campus-reuse-v1/);
    await post(other, { action: "leave" });
    const list = await ok(await other("/api/experiment"));
    assert.equal(list.myExperiments.length, 1);
    await post(other, { action: "resume", runId: second.id });
    assert.equal(
      (await ok(await other("/api/experiment"))).stage.key,
      "completed",
    );
    const custom = await post(teacher, {
      action: "teacher_create",
      title: "自定义案例验证",
      scenarioId: "custom",
      customScenario: {
        title: "社区阅读空间",
        caseText:
          "社区团队希望让居民交流闲置图书，计划先在社区活动室尝试一次图书交换，需求与维护成本仍待验证。",
        plain: "先尝试一次图书交换，问清大家是否需要。",
      },
    });
    assert.equal(custom.scenario.id, "custom-v1");
    const directCards = (
      await db.query<{
        id: number;
        rule: string;
        context: { participant_id: string };
      }>("select * from intervention_cards where context->>'run_id'=$1", [
        run.id,
      ])
    ).rows;
    assert.ok(directCards.some((c) => c.rule === "experiment_skipped"));
    assert.ok(directCards.some((c) => c.rule === "experiment_review"));
    assert.ok(!directCards.some((c) => c.rule === "experiment_missing"));
    const queue = await ok(await teacher("/api/interventions?all=1"));
    assert.ok(queue.total > 3);
    const again = await ok(await teacher("/api/interventions?all=1"));
    assert.equal(again.total, queue.total);
    assert.equal(again.checked, 0);
    const overviewCards = await ok(
      await teacher("/api/interventions?all=1&kind=overview"),
    );
    assert.equal(overviewCards.total, 2);
    assert.ok(
      overviewCards.cards.every((c: any) => c.context.kind === "overview"),
    );
    const oldUser = (
      await db.query<{ id: string }>(
        "insert into users(student_no,password_hash,name,role) values('historical-only',$1,'历史同学','student') returning id",
        [pass],
      )
    ).rows[0].id;
    await db.query("insert into projects(id,user_id) values($1,$2)", [
      randomUUID(),
      oldUser,
    ]);
    const noDataUser = (
      await db.query<{ id: string }>(
        "insert into users(student_no,password_hash,name,role) values('no-data',$1,'未提交同学','student') returning id",
        [pass],
      )
    ).rows[0].id;
    const backfill = await ok(
      await teacher("/api/interventions?all=1&kind=overview"),
    );
    assert.equal(backfill.total, 4);
    assert.ok(
      backfill.cards
        .find((c: any) => c.user_id === oldUser)
        .evidence.includes("历史项目1条"),
    );
    assert.match(
      backfill.cards.find((c: any) => c.user_id === noDataUser).sharp,
      /等待/,
    );
    const card = directCards.find((c) => c.rule === "experiment_review")!;
    assert.equal(
      (await other("/api/interventions", { id: card.id, action: "accepted" }))
        .status,
      403,
    );
    await ok(
      await teacher("/api/interventions", {
        id: card.id,
        action: "note",
        note: "测试教师备注保留",
      }),
    );
    await ok(
      await teacher("/api/interventions", {
        id: card.id,
        action: "retract",
        note: "测试撤回",
      }),
    );
    await db.query("delete from supervision_checkpoints where source_key=$1", [
      "experiment:" + card.context.participant_id,
    ]);
    await ok(await teacher("/api/interventions?all=1"));
    const kept = (
      await db.query<{ status: string; teacher_note: string }>(
        "select status,teacher_note from intervention_cards where id=$1",
        [card.id],
      )
    ).rows[0];
    assert.equal(kept.status, "retracted");
    assert.equal(kept.teacher_note, "测试撤回");
    const analysisExport = await ok(
      await teacher("/api/admin/records?runId=" + run.id + "&format=json"),
    );
    assert.ok(
      analysisExport.sections.some((s: any) => s.name === "前后测配对"),
    );
    assert.ok(
      analysisExport.sections.find((s: any) => s.name === "前测").rows[0]
        .提交时间,
    );
    assert.ok(
      analysisExport.sections.find((s: any) => s.name === "阶段用时").rows[0]
        .阶段开始时间,
    );
    const bExport = await ok(
      await teacher(
        "/api/admin/records?runId=" + run.id + "&cohort=panel&format=json",
      ),
    );
    assert.equal(
      bExport.sections.find((s: any) => s.name === "参与者与缺项").rows.length,
      0,
    );
    for (const client of [makeClient(), student, other, ordinaryTeacher]) {
      assert.equal(
        (await client("/api/admin/records/export?format=json")).status,
        403,
      );
    }
    assert.ok(
      pg.getStats().activeConnections <= 10,
      `跨路由应复用一个最多10条连接的数据库连接池：${JSON.stringify(pg.getStats())}`,
    );
    const allTeaching = await ok(
      await teacher("/api/admin/records/export?format=json"),
    );
    const allParticipants = allTeaching.sections.find(
      (s: any) => s.name === "参与者与缺项",
    ).rows;
    assert.ok(allParticipants.some((r: any) => r.学号 === "student-test"));
    assert.ok(allParticipants.some((r: any) => r.学号 === "other-test"));
    assert.ok(
      allTeaching.sections
        .find((s: any) => s.name === "前测")
        .rows.every((r: any) => r.提交时间 && r.分组),
    );
    assert.equal(
      allTeaching.sections.find((s: any) => s.name === "历史项目").rows[0].学号,
      "historical-only",
    );
    assert.ok(!JSON.stringify(allTeaching).includes("password_hash"));
    assert.ok(!JSON.stringify(allTeaching).includes(restoredCode));
    for (const format of ["xlsx", "docx", "pdf", "csv", "rtf", "md"]) {
      const exported = await teacher(
        "/api/admin/records/export?format=" + format,
      );
      assert.equal(exported.status, 200, await exported.clone().text());
      assert.ok((await exported.arrayBuffer()).byteLength > 50);
    }
    assert.ok(
      pg.getStats().activeConnections <= 10,
      `完成全部格式导出后连接池仍应有界：${JSON.stringify(pg.getStats())}`,
    );
    console.log("PASS: 跨路由及七种格式导出连接池复用", pg.getStats());
    console.log(
      "PASS: 登录/退出/恢复、跨账号隔离、重复提交、8轮问答、阶段门槛、前后测配对、后台同步、全部导出HTTP接口。AI仅使用本地替身。",
    );
    if (process.env.KEEP_TEST_SERVER) {
      console.log("QA server: " + base + " (fixture accounts only)");
      await new Promise(() => {});
    }
  } catch (e) {
    console.error(logs.slice(-5000));
    throw e;
  } finally {
    app.kill();
    await pg.stop();
    await db.close();
    ai.closeAllConnections();
    ai.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

// 虚实对局端到端联调：教师开局 → 学生入队选席位 → 交锋 → 提假设 → 证伪修正 → 提交现实验证 → 教师确认 → 大屏三模式核对
// 前提：dev 服务在 3000；另开一个终端运行 node scripts/mock-llm.mjs（本机模拟模型，不出本机）
// 账号：教师 teacher01、学生 S0001~S0004（本机用 scripts/create-user.mjs 创建），密码从环境变量读取：
//   E2E_TEACHER_PASSWORD=… E2E_STUDENT_PASSWORD=… node scripts/test-arena-e2e.mjs
// 注意：会在当前库里新建一局并写入对局记录，只在本机开发库上运行。
const B = process.env.BASE || "http://localhost:3000";
const TP = process.env.E2E_TEACHER_PASSWORD, SP = process.env.E2E_STUDENT_PASSWORD;
if (!TP || !SP) { console.error("请设置 E2E_TEACHER_PASSWORD 与 E2E_STUDENT_PASSWORD"); process.exit(1); }
const PWD = { teacher01: TP, S0001: SP, S0002: SP, S0003: SP, S0004: SP };
let fail = 0;
const ok = (name, cond, extra) => { if (cond) console.log("  ✓", name); else { fail++; console.log("  ✗", name, extra === undefined ? "" : JSON.stringify(extra).slice(0, 300)); } };

async function login(acc) {
  const r = await fetch(B + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ account: acc, password: PWD[acc] }) });
  if (!r.ok) throw new Error("登录失败 " + acc + " " + (await r.text()));
  const cookie = r.headers.get("set-cookie").split(";")[0];
  const call = async (path, body, method) => {
    const res = await fetch(B + path, { method: method || (body ? "POST" : "GET"), headers: { cookie, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await res.json().catch(() => ({}));
    return { status: res.status, ...j };
  };
  return call;
}

await fetch((process.env.MOCK_URL || "http://127.0.0.1:3901") + "/reset", { method: "POST" }).catch(() => {}); // 模拟模型回复序列归零
const T = await login("teacher01");
const S1 = await login("S0001"), S2 = await login("S0002"), S3 = await login("S0003"), S4 = await login("S0004");

console.log("① 教师开局");
const seed = await T("/api/persona", { action: "seed_roles" });
ok("注入默认角色", seed.status === 200, seed);
const cr = await T("/api/arena", { action: "create", title: "联调局", scenario: "路演答辩演练", team_count: 2, rounds: 3, round_minutes: 12, team_names: ["甲队", "乙队"] });
ok("创建对局", cr.status === 200 && cr.match?.id, cr);
const MID = cr.match.id;
const st = await T("/api/arena", { action: "start", match_id: MID });
const personas0 = (await T(`/api/arena/board?id=${MID}`)).loops?.l4?.personas ?? 0; // 开局时库里已有的角色与分身数（开发库可能已有往次联调留下的分身）
ok("开始第 1 轮", st.match?.status === "running" && st.match.round_no === 1, st);
const tv = await T(`/api/arena?id=${MID}`);
const CODE = tv.match.join_code, [team1, team2] = tv.teams;
ok("教师能看到对局码", /^[A-Z0-9]{5}$/.test(CODE || ""), tv.match);

console.log("② 学生入队选席位");
const sv = await S1(`/api/arena?id=${MID}`);
ok("学生看不到对局码", sv.match && sv.match.join_code === undefined, sv.match);
ok("错误对局码被拒", (await S1("/api/arena", { action: "join", match_id: MID, team_id: team1.id, seat: 0, join_code: "ZZZZZ" })).status === 400);
for (const [S, t, seat] of [[S1, team1, 0], [S2, team1, 1], [S3, team2, 0], [S4, team2, 2]]) {
  const j = await S("/api/arena", { action: "join", match_id: MID, team_id: t.id, seat, join_code: CODE.toLowerCase() });
  ok(`入队 ${t.name} 席位 ${seat}`, j.status === 200, j);
}
const dupSeat = await S2("/api/arena", { action: "join", match_id: MID, team_id: team1.id, seat: 0, join_code: CODE });
ok("同队同席位被拒", dupSeat.status === 409, dupSeat);
ok("换回自己的席位仍可", (await S2("/api/arena", { action: "join", match_id: MID, team_id: team1.id, seat: 1, join_code: CODE })).status === 200);
const me1 = await S1("/api/arena");
ok("学生自动定位到所在对局与席位", me1.match?.id === MID && me1.myTeam?.id === team1.id && me1.mySeat === 0, { m: me1.match?.id, t: me1.myTeam?.id, s: me1.mySeat });
await S1("/api/arena", { action: "venture", match_id: MID, venture: "给中小材料加工厂做 AI 质检，按件收费" });
await S3("/api/arena", { action: "venture", match_id: MID, venture: "把文物纹样做成可定制文创" });

console.log("③ 交锋（模拟模型）");
for (const S of [S1, S3]) {
  const k = await S("/api/me/api-keys", { purpose: "chat", provider: "custom", base_url: "http://127.0.0.1:3901/v1", api_key: "mock", model: "mock-model" });
  ok("绑定本机模拟模型", k.status === 200, k);
}
// 乙队做一个调研分身（后面甲队用它证伪假设 → 乙队得“分身命中”）
const consentN = 3;
const twin = await S3("/api/persona", { role_type: "buyer", label: "材料厂采购负责人", team_code: "T2", consent: Array(consentN).fill(true), method: "深度访谈", date: "2026-11", n: "6",
  text: "我们走访了 6 家中小材料加工厂。采购负责人说：退一次货损失上万，最怕漏检。预算方面，3 万以内老板一个人就能拍板，超过要走流程。他们现在靠两名质检员人工目检，夜班最容易漏。对新设备的顾虑是怕不准、怕停产调试。" });
if (twin.status === 400 && /同意/.test(twin.error || "")) console.log("  · 知情同意条数不是 4，请调整脚本", twin.error);
ok("乙队创建调研分身", twin.status === 200 && twin.persona?.kind === "twin", twin);
const TWIN = twin.persona?.id;
const badTwin = await S3("/api/persona", { role_type: "buyer", label: "冒充", team_code: "T9", consent: Array(consentN).fill(true), text: "x".repeat(90) });
ok("分身不能归到别的队", badTwin.status === 403, badTwin);
const teamOnly = await S1("/api/persona", { role_type: "customer", label: "本队用户画像", team_code: "T1", visibility: "team", consent: Array(consentN).fill(true), text: "访谈了 5 位车间班组长，他们说夜班最容易漏检，希望有工具提醒。每月愿意出几百元，超过一千要老板批。最怕的是设备误报太多反而添乱，影响产量。另外两位班组长说，如果能在手机上直接看到报警并拍照留存，他们愿意先试用一个月，再决定要不要申请预算。" });
ok("甲队创建本队可见分身", teamOnly.status === 200, teamOnly);
const l2 = await S2("/api/persona"), l3 = await S3("/api/persona");
ok("队友能在对手列表看到本队分身", (l2.personas || []).some((p) => p.id === teamOnly.persona?.id));
ok("别队看不到", !(l3.personas || []).some((p) => p.id === teamOnly.persona?.id));

const plist = await S1("/api/persona");
const investor = (plist.personas || []).find((p) => p.role_type === "investor");
const judge = (plist.personas || []).find((p) => p.role_type === "judge");
ok("学生能看到教师角色", !!investor && !!judge, plist.personas?.map((p) => p.role_type));

const turn = (S, pid, q) => S("/api/arena/turn", { match_id: MID, persona_id: pid, messages: [{ role: "assistant", content: "请介绍你们的项目" }, { role: "user", content: q }] });
const r1 = await turn(S1, investor.id, "我觉得这个市场很大，大家都需要");
ok("甲队交锋 1（无证据，不计分）", r1.status === 200 && r1.cited === false && r1.points === 0, r1);
ok("TAGS 行解析：索要证据 + 假设", r1.tags?.demandEvidence === true && r1.tags.hypothesis === "小厂愿意按件付质检费" && !/TAGS/.test(r1.reply), r1.tags);
const r2 = await turn(S1, investor.id, "我们访谈了 12 家工厂，其中 8 家愿意试用一个月");
ok("甲队交锋 2（带证据 +1）", r2.cited === true && r2.points === 1, r2);
const r3 = await turn(S1, investor.id, "老板原话说“退一次货损失上万，愿意先试再谈价”");
ok("甲队交锋 3（访谈原话 +1）", r3.cited === true && r3.points === 1, r3);
ok("TAGS：资料没有 → unknown", r3.tags?.unknown === true, r3.tags);
const r4 = await turn(S3, judge.id, "我们的文创很有特色");
ok("乙队交锋 1（无证据）", r4.status === 200 && r4.points === 0, r4);
const r5 = await turn(S3, judge.id, "问卷 200 份里有 63% 愿意为定制纹样多付 20 元");
ok("乙队交锋 2（带证据 +1）", r5.points === 1, r5);
const noTeam = await (await login("teacher01"))("/api/arena/turn", { match_id: MID, persona_id: investor.id, messages: [{ role: "user", content: "x" }] });
ok("未入队不能交锋", noTeam.status === 403, noTeam);

console.log("④ 提出假设");
const h1 = await S1("/api/arena/hypothesis", { action: "create", match_id: MID, text: "中小材料加工厂愿意为 AI 质检按件付费", persona_id: TWIN });
ok("甲队假设 1 +1", h1.status === 200 && h1.points === 1, h1);
const h2 = await S2("/api/arena/hypothesis", { action: "create", match_id: MID, text: "老板在试用一个月后愿意按每件 0.3 元续费", persona_id: investor.id });
ok("甲队假设 2 +1（另一名队员）", h2.points === 1, h2);
const h3 = await S3("/api/arena/hypothesis", { action: "create", match_id: MID, text: "游客愿意为定制纹样文创多付 20 元以上", persona_id: judge.id });
ok("乙队假设 +1", h3.points === 1, h3);
ok("假设太短被拒", (await S1("/api/arena/hypothesis", { action: "create", match_id: MID, text: "很好" })).status === 400);

console.log("⑤ 证伪并修正");
ok("别队不能证伪甲队假设", (await S3("/api/arena/hypothesis", { action: "falsify", id: h1.hypothesis.id, reason: "我们觉得不对不对不对", revision: "改成别的别的别的" })).status === 403);
const [fa, fb] = await Promise.all([
  S1("/api/arena/hypothesis", { action: "falsify", id: h1.hypothesis.id, reason: "访谈 6 家里质检员都怕被替代，会抵制", revision: "改为卖给班组长，质检员只需拍照上传" }),
  S2("/api/arena/hypothesis", { action: "falsify", id: h1.hypothesis.id, reason: "访谈 6 家里质检员都怕被替代，会抵制", revision: "改为卖给班组长，质检员只需拍照上传" }),
]);
const okN = [fa, fb].filter((x) => x.status === 200).length;
ok("并发证伪只成功一次（防重复 +3）", okN === 1, [fa.status, fb.status]);

console.log("⑥ 提交现实验证");
ok("证据太短被拒", (await S2("/api/arena/hypothesis", { action: "verify_submit", id: h2.hypothesis.id, evidence: "问过了" })).status === 400);
const vs = await S2("/api/arena/hypothesis", { action: "verify_submit", id: h2.hypothesis.id, evidence: "回访 2 家工厂，老板都把退货率排第一，并同意试用一个月后按每件 0.3 元续费，有微信记录", evidence_url: "" });
ok("提交现实验证 → 等老师确认", vs.hypothesis?.status === "verifying", vs);

console.log("⑦ 教师确认 +5");
ok("学生不能确认", (await S1("/api/arena/hypothesis", { action: "review", id: h2.hypothesis.id, ok: true })).status === 403);
const bd0 = await T(`/api/arena/board?id=${MID}`);
ok("大屏待确认列表出现该条", bd0.verifying?.length === 1 && bd0.verifying[0].team === "甲队", bd0.verifying);
const [ra, rb] = await Promise.all([
  T("/api/arena/hypothesis", { action: "review", id: h2.hypothesis.id, ok: true, note: "证据扎实" }),
  T("/api/arena/hypothesis", { action: "review", id: h2.hypothesis.id, ok: true, note: "证据扎实" }),
]);
ok("并发确认只记一次 +5", [ra, rb].filter((x) => x.status === 200).length === 1, [ra.status, rb.status]);

console.log("⑧ 第 2 轮");
await T("/api/arena", { action: "next", match_id: MID });
const r6 = await turn(S1, investor.id, "实测 300 件样品，漏检率从 4% 降到 0.5%");
ok("第 2 轮带证据交锋 +1", r6.points === 1, r6);

console.log("⑨ 大屏三模式核对");
const bd = await T(`/api/arena/board?id=${MID}`);
const A = bd.board.find((x) => x.name === "甲队"), Bq = bd.board.find((x) => x.name === "乙队");
// 甲队：证据 3 + 假设 2 + 证伪 3 + 验证 5 = 13；乙队：证据 1 + 假设 1 + 分身命中 1 = 3
ok("甲队总分 13", A.score === 13, A.score);
ok("乙队总分 3（含分身命中 +1）", Bq.score === 3, Bq.score);
ok("排行顺序甲在前", bd.board[0].name === "甲队");
const seatPts = Object.fromEntries(A.members.map((m) => [m.seat, m.points]));
// 席位 0（S0001）：证据 3 + 假设 1 + 证伪 3（若并发里 S0002 赢了则在席位 1）
ok("甲队席位得分合计 = 队伍总分", A.members.reduce((s, m) => s + m.points, 0) === 13, A.members);
ok("甲队席位 0/1 都在场", seatPts[0] !== undefined && seatPts[1] !== undefined, A.members);
ok("甲队交锋 4 次、带证据 3 次", A.turns === 4 && A.evidence === 3, { t: A.turns, e: A.evidence });
ok("甲队假设状态：已证伪 1、已验证 1", A.hyp.falsified === 1 && A.hyp.verified === 1 && A.hyp.pending === 0, A.hyp);
ok("乙队分身命中 1", Bq.twinHits === 1, Bq.twinHits);
ok("顶部汇总", bd.totals.turns === 6 && bd.totals.evidence === 4 && bd.totals.pending === 1 && bd.totals.falsified === 1 && bd.totals.verifying === 0 && bd.totals.verified === 1 && bd.totals.members === 4, bd.totals);
ok("对局轮次 2", bd.match.round_no === 2);
const kinds = bd.feed.map((f) => f.kind);
ok("战况播报含证伪、验证、分身命中", ["falsify", "verify", "twin_hit"].every((k) => kinds.includes(k)), kinds);
ok("大屏不返回学生姓名或账号", !/S000\d|学生\d/.test(JSON.stringify(bd)));

const L = bd.loops;
ok("L1：学生发言 6、被追问证据、带证据 4", L.l1.turns === 6 && L.l1.cite === 4 && L.l1.demand >= 1, L.l1);
ok("L2：首轮 60%、第 2 轮 100%", L.l2.pre === 60 && L.l2.post === 100 && L.l2.round === 2, L.l2);
ok("L3：待验证 1 / 证伪 1 / 待确认 0 / 已验证 1 / 迭代 2", L.l3.pending === 1 && L.l3.falsified === 1 && L.l3.verifying === 0 && L.l3.verified === 1 && L.l3.iterations === 2, L.l3);
ok("L4：角色与分身比开局时多出本局建的 2 个分身", personas0 >= 7 && L.l4.personas === personas0 + 2, { personas0, l4: L.l4 });

const fc = await T(`/api/arena/board?id=${MID}&focus=${A.id}`);
ok("焦点对战：甲队最近一场", fc.focus?.team?.name === "甲队" && fc.focus.turns.length >= 2, fc.focus);
ok("焦点对战：对手是天使投资人、席位 0、第 2 轮", fc.focus?.persona?.role_type === "investor" && fc.focus.seat === 0 && fc.focus.round === 2, { p: fc.focus?.persona, s: fc.focus?.seat, r: fc.focus?.round });
ok("焦点对战：最后一句学生发言带证据", fc.focus?.turns.filter((t) => t.speaker === "student").slice(-1)[0]?.cites === true, fc.focus?.turns);

console.log(fail ? `\n失败 ${fail} 项` : "\n全部通过");
console.log("MATCH_ID=" + MID);
process.exit(fail ? 1 : 0);

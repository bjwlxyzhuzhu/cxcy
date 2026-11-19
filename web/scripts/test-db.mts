// lib/db.ts 查询封装冒烟测试（用临时库，不碰 data/app.db）
// 运行：node scripts/test-db.mts
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { registerHooks } from "node:module";

// 脱离 Next 运行：把 server-only 换成空模块
registerHooks({
  resolve(spec, ctx, next) {
    if (spec === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return next(spec, ctx);
  },
});

const tmp = path.join(os.tmpdir(), `db-smoke-${Date.now()}.db`);
process.env.DATABASE_URL = "file:" + tmp;
const { db } = await import("../lib/db.ts");

let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log("  ✓", name);
  else { fail++; console.log("  ✗", name, extra ?? ""); }
}

const a = db();
// insert + returning + 默认 uuid
const u = await a.from("users").insert({ account: "T001", password_hash: "x" }).select("id, account, disabled").single();
check("insert…select().single() 返回行与默认 uuid", !u.error && /^[0-9a-f-]{36}$/.test(u.data?.id), u.error);
check("boolean 列读出为布尔值", u.data?.disabled === false);
const uid = u.data.id as string;

// 唯一冲突错误码
const dup = await a.from("users").insert({ account: "t001", password_hash: "y" });
check("唯一冲突（账号不区分大小写）→ 23505", dup.error?.code === "23505", dup.error);

// profiles + jsontext + update + eq + maybeSingle
await a.from("profiles").insert({ id: uid, name: "测试", role: "teacher" });
const up = await a.from("profiles").update({ credits: 50, research_consent: true }).eq("id", uid).select("credits, research_consent").single();
check("update…eq…select().single()", up.data?.credits === 50 && up.data?.research_consent === true, up);
const none = await a.from("profiles").select("id").eq("id", "nope").maybeSingle();
check("maybeSingle 无行 → data=null 且无错误", none.data === null && !none.error);
const single0 = await a.from("profiles").select("id").eq("id", "nope").single();
check("single 无行 → 报错", !!single0.error);

// upsert onConflict + jsontext
await a.from("app_config").upsert({ key: "k1", value: { a: 1, list: [1, 2] } }, { onConflict: "key" });
await a.from("app_config").upsert({ key: "k1", value: { a: 2 } }, { onConflict: "key" });
const cfg = await a.from("app_config").select("value").eq("key", "k1").single();
check("upsert 覆盖 + JSON 往返", cfg.data?.value?.a === 2, cfg);
const costs = await a.from("app_config").select("value").eq("key", "credit_costs").single();
check("基线迁移写入 credit_costs", costs.data?.value?.chat === 1);

// 复合主键 upsert（不写 onConflict 时用主键）
await a.from("user_api_keys").upsert({ user_id: uid, purpose: "chat", model: "m1" });
await a.from("user_api_keys").upsert({ user_id: uid, purpose: "chat", model: "m2" });
const k = await a.from("user_api_keys").select("model").eq("user_id", uid);
check("复合主键 upsert", k.data?.length === 1 && k.data[0].model === "m2", k);

// 批量插入 + count/head + in + neq + order + limit + range + like + or
const rows = Array.from({ length: 5 }, (_, i) => ({ user_id: uid, action: i % 2 ? "chat" : "ppt", cost: i }));
await a.from("usage_logs").insert(rows);
const c = await a.from("usage_logs").select("id", { count: "exact", head: true }).eq("user_id", uid);
check("count exact + head", c.count === 5 && c.data === null, c);
const inq = await a.from("usage_logs").select("cost").in("action", ["chat"]).order("cost", { ascending: false });
check("in + order desc", JSON.stringify(inq.data?.map((r: { cost: number }) => r.cost)) === "[3,1]", inq.data);
const empty = await a.from("usage_logs").select("id").in("action", []);
check("in 空数组 → 空结果", empty.data?.length === 0);
const ne = await a.from("usage_logs").select("id").neq("action", "chat");
check("neq", ne.data?.length === 3);
const rg = await a.from("usage_logs").select("cost").order("cost").range(1, 2);
check("range", JSON.stringify(rg.data?.map((r: { cost: number }) => r.cost)) === "[1,2]", rg.data);
const lim = await a.from("usage_logs").select("cost").order("cost").limit(2);
check("limit", lim.data?.length === 2);
const or = await a.from("usage_logs").select("cost").or("cost.eq.0,cost.gte.4");
check("or 简单表达式", or.data?.length === 2, or);
await a.from("challenge_sessions").insert({ user_id: uid, scenario: "arena:abc:1" });
const lk = await a.from("challenge_sessions").select("id").like("scenario", "arena:abc:%");
check("like 前缀", lk.data?.length === 1);

// 生成列
const s = await a.from("challenge_sessions").select("id").single();
await a.from("dialogue_turns").insert({ session_id: s.data.id, user_id: uid, turn_index: 1, speaker: "student", content: "你好世界", cites_evidence: true });
const dt = await a.from("dialogue_turns").select("char_len, cites_evidence").eq("cites_evidence", true).single();
check("生成列 char_len + 布尔过滤", dt.data?.char_len === 4 && dt.data?.cites_evidence === true, dt);

// delete count
const del = await a.from("usage_logs").delete({ count: "exact" }).eq("action", "ppt");
check("delete count", del.count === 3, del);

// 非法列名
const bad = await a.from("profiles").select("id; drop table users");
check("非法列名被拒绝", !!bad.error);

// updated_at 触发器
const p = await a.from("projects").insert({ user_id: uid }).select("id, updated_at").single();
await new Promise((r) => setTimeout(r, 20));
await a.from("projects").update({ name: "改名" }).eq("id", p.data.id);
const p2 = await a.from("projects").select("updated_at, sections").eq("id", p.data.id).single();
check("updated_at 自动刷新 + jsontext 默认值解析", p2.data.updated_at > p.data.updated_at && typeof p2.data.sections === "object", p2);

// rpc
const r1 = await a.rpc("deduct_credits", { p_user: uid, p_action: "chat", p_cost: 30, p_meta: { x: 1 } });
check("deduct_credits 扣分", r1.data === 20, r1);
const r2 = await a.rpc("deduct_credits", { p_user: uid, p_action: "chat", p_cost: 30 });
check("deduct_credits 余额不足报错", r2.error?.message === "INSUFFICIENT_CREDITS", r2);
const bal = await a.from("profiles").select("credits").eq("id", uid).single();
check("余额不足时不扣分", bal.data.credits === 20);
await a.from("knowledge").insert([
  { source: "s", title: "甲", chunk: "a", embedding: [1, 0, 0] },
  { source: "s", title: "乙", chunk: "b", embedding: "[0,1,0]" },
]);
const mk = await a.rpc("match_knowledge", { query_embedding: "[0.9,0.1,0]", match_count: 1 });
check("match_knowledge 余弦检索", mk.data?.[0]?.title === "甲" && mk.data[0].similarity > 0.9, mk);

// 视图
await a.from("profiles").update({ research_pid: "P01" }).eq("id", uid);
const v = await a.from("v_research_turns").select("research_pid, cites_evidence");
check("研究视图 + 布尔转换", v.data?.[0]?.research_pid === "P01" && v.data[0].cites_evidence === true, v);

// 外键级联
await a.from("users").delete().eq("id", uid);
const left = await a.from("profiles").select("id", { count: "exact", head: true });
check("删除账号级联删除档案", left.count === 0);

console.log(fail ? `\n失败 ${fail} 项` : "\n全部通过");
for (const f of [tmp, tmp + "-wal", tmp + "-shm"]) { try { fs.unlinkSync(f); } catch { /* 忽略 */ } }
process.exit(fail ? 1 : 0);

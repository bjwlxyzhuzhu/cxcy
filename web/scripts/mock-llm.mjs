// 本机模拟 OpenAI 兼容接口，用于联调虚实对局（监听 127.0.0.1:3901，不出本机）。
// 用法：node scripts/mock-llm.mjs；测试学生在账户中心把“对话”自有密钥的地址设为 http://127.0.0.1:3901/v1
import http from "node:http";
let n = 0;
const replies = [
  "你说市场很大，有多少家工厂真的愿意付钱？给我数字。\nTAGS: demand_evidence=1; unknown=0; hypothesis=小厂愿意按件付质检费",
  "访谈 12 家里 8 家愿意试用，这是好信号。那试用后谁来拍板付款？\nTAGS: demand_evidence=1; unknown=0; hypothesis=",
  "我的资料里没有这个信息，建议你去现实中问问真实的采购负责人。\nTAGS: demand_evidence=0; unknown=1; hypothesis=采购负责人能单独决定 3 万以内的采购",
  "价格 0.3 元一件是怎么算出来的？\nTAGS: demand_evidence=1; unknown=0; hypothesis=",
];
http.createServer((req, res) => {
  // 联调脚本开头调用 POST /reset，让固定回复序列从头开始（否则连续多次联调会错位）
  if (req.url === "/reset") { n = 0; res.writeHead(200, { "content-type": "application/json" }); res.end('{"ok":true}'); return; }
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    const j = JSON.parse(body || "{}");
    const all = JSON.stringify(j.messages || []);
    let content;
    const gen = all.match(/产品线起草:(\w+)/);
    if (gen) {
      // 依据上下文里的编号起草；每种都故意混入一处错误，检验校验
      const user = (j.messages || []).find((m) => m.role === "user")?.content || "";
      const keys = (p) => [...user.matchAll(new RegExp(`\\[(${p}\\d+)\\]`, "g"))].map((m) => m[1]);
      const mat = user.split(/\n(?=\[M\d+\] )/).map((b) => b.match(/\[(M\d+)\] [^\n]*\n([\s\S]*)/)).filter(Boolean).map((m) => ({ key: m[1], text: m[2] }))[0];
      const step = gen[1];
      if (step === "track") content = JSON.stringify({ track: { title: "中小制造业 AI 质检", track: "智能制造", audience: "中小材料加工厂", summary: "人工目检为主，夜班漏检导致退货", trends: ["质检数字化"], opportunities: ["按件收费降低门槛"] } });
      if (step === "brief") content = JSON.stringify({ brief: { title: "夜班 AI 质检助手任务书", goal: "减少夜班漏检导致的退货", features: ["拍照识别缺陷", "漏检提醒"], metrics: ["漏检率降到 1% 以下", "试用一个月后续费率"], risks: ["误报影响产量"], addresses: keys("H").slice(0, 1).concat(["H99"]) } });
      if (step === "v01") content = JSON.stringify({ version: { summary: "能在夜班试用的拍照质检原型", changes: ["拍照识别 3 类缺陷", "漏检提醒"], implements: keys("B").slice(0, 1), addresses: keys("H").slice(0, 1) }, questionnaire: ["这周夜班漏检了几次？", "提醒是否打扰生产？", "愿意按件付费吗？", "最希望增加什么功能？", "会推荐给同行吗？"] });
      if (step === "test") {
        const sent = (mat?.text || "").split(/[。！？\n]+/).map((x) => x.trim()).find((x) => /\d/.test(x)) || "";
        const pct = (mat?.text || "").match(/(\d+(?:\.\d+)?)%/);
        content = JSON.stringify({
          report: { title: "V0.1 夜班试用测试", summary: "试用后漏检明显减少", metrics: [pct ? { name: "漏检率", value: pct[1], unit: "%", source: mat.key } : null, { name: "满意度", value: "99.9", unit: "%", source: mat?.key || "M1" }].filter(Boolean), findings: ["夜班漏检明显减少"] },
          evidence: [{ kind: "test", content: sent.slice(0, 40) || "试用结果", quote: sent, sample_n: null, source: mat?.key || "M1" }],
        });
      }
      if (step === "v02") content = JSON.stringify({
        decisions: [
          { verdict: "modify", subject: "改为按月订阅", rationale: "试用用户更接受固定费用", cites: keys("E").slice(0, 1).concat(keys("R").slice(0, 1)), about: keys("B").slice(0, 1) },
          { verdict: "drop", subject: "去掉语音播报", rationale: "没有证据的建议", cites: ["E99"], about: [] },
        ],
        version: { summary: "按月订阅 + 漏检提醒优化", changes: ["改为按月订阅", "提醒只在停机间隙推送"] },
      });
    } else if (/口径对齐/.test(all)) {
      // 每份原文里找含“复购率”的句子作为不同说法；混入一个编造的术语和一条编造的说法，检验防编造校验
      const user = (j.messages || []).find((m) => m.role === "user")?.content || "";
      const blocks = user.split(/\n(?=\[[MO]\d+\] )/).map((b) => {
        const m = b.match(/\[([MO]\d+)\] [^\n]*\n([\s\S]*)/);
        return m ? { key: m[1], text: m[2] } : null;
      }).filter(Boolean);
      const variants = [];
      for (const b of blocks) {
        const sent = b.text.split(/[。！？\n]+/).find((x) => x.includes("复购率"));
        if (sent) variants.push({ meaning: `第 ${variants.length + 1} 种算法`, source: b.key, quote: sent.trim() });
      }
      variants.push({ meaning: "按注册用户算", source: blocks[0]?.key || "M1", quote: "复购率按注册用户来算" });
      content = JSON.stringify({ terms: [
        { term: "复购率", definition: "30 天内再次购买的用户占比", formula: "再次购买用户 ÷ 购买用户", aliases: [], variants },
        { term: "客单价", definition: "资料里没有的术语", formula: "", aliases: [], variants: [] },
      ] });
    } else if (/本体抽取/.test(all)) {
      // 从【资料原文】里摘句子当证据（逐字），并故意混入一条编造的原话，检验防编造校验
      const user = (j.messages || []).find((m) => m.role === "user")?.content || "";
      const text = user.split("【资料原文】")[1] || "";
      const sents = text.split(/[。！？\n]+/).map((x) => x.trim()).filter((x) => x.length >= 6);
      const withNum = sents.filter((x) => /\d|[一二两三四五六七八九十]/.test(x)).slice(0, 3);
      const evidence = withNum.map((q, i) => ({ ref: `e${i + 1}`, kind: "interview", content: q.slice(0, 40), quote: q, sample_n: null, collected_at: "" }));
      evidence.push({ ref: `e${evidence.length + 1}`, kind: "interview", content: "所有受访者都愿意付费", quote: "我们全部都愿意马上付钱买", sample_n: 999, collected_at: "" });
      const hq = sents.find((x) => /说|最怕|希望/.test(x)) || sents[0] || "";
      content = JSON.stringify({
        evidence,
        hmw: [{ ref: "h1", text: "我们如何减少夜班漏检带来的退货损失？", user_quote: hq, rationale: "资料中多次提到漏检与退货", based_on: ["e1"] }],
        track: { title: "中小制造业 AI 质检", track: "智能制造", audience: "中小材料加工厂", summary: "人工目检为主，漏检导致退货" },
      });
    } else if (/回答规则 · 人判断/.test(all)) {
      // 统一上下文层：引用一个真实存在的本体编号，再故意编一个不存在的〔E99〕，检验出处校验
      const sys = (j.messages || []).filter((m) => m.role === "system").map((m) => m.content).join("\n");
      const real = (sys.match(/〔(E\d+)〕/) || sys.match(/〔([TBHVRD]\d+)〕/) || [])[1];
      content = real
        ? `根据你们已认证的证据，试用后漏检明显减少〔${real}〕。另外有说法称满意度很高〔E99〕，项目本体里没有这条信息，建议回到现实中验证。`
        : "项目本体里没有这条信息，建议回到现实中验证。";
    } else if (/json/i.test(all)) {
      content = JSON.stringify({ identity: "中小材料加工厂老板", context: "车间质检靠人工", pains: ["漏检退货"], goals: ["降低退货"], budget: "每年 3 万以内", decision_logic: "老板拍板", objections: ["怕不准"], quotes: ["退一次货损失上万"] });
    } else {
      content = replies[n++ % replies.length];
    }
    if (j.stream) {
      // 流式（SSE）：按 OpenAI 格式分两段推送
      res.writeHead(200, { "content-type": "text/event-stream" });
      const half = Math.ceil(content.length / 2);
      for (const part of [content.slice(0, half), content.slice(half)]) {
        res.write(`data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", created: 0, model: j.model, choices: [{ index: 0, delta: { content: part }, finish_reason: null }] })}\n\n`);
      }
      res.end("data: [DONE]\n\n");
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: "mock", object: "chat.completion", created: 0, model: j.model, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
  });
}).listen(3901, "127.0.0.1", () => console.log("mock llm on 3901"));

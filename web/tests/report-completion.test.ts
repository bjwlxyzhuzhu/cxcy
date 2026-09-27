import test from "node:test";
import assert from "node:assert/strict";
import OpenAI from "openai";
import { generateReportText, reportCompletionOptions, reportFailure } from "../lib/ai/report-completion";

test("DeepSeek报告关闭默认思考并留出正文额度，其他模型不接收专用参数", () => {
  for (const model of ["deepseek-flash", "deepseek-v4-flash", "deepseek-v4-pro"])
    assert.deepEqual(reportCompletionOptions(model), { max_tokens: 8192, thinking: { type: "disabled" } });
  assert.deepEqual(reportCompletionOptions("fixture-model"), { max_tokens: 8192 });
});

test("通过真实SDK序列化发送thinking字段，两个报告类型都能取得完整正文", async () => {
  let calls = 0;
  const client = new OpenAI({ apiKey: "fixture-only", baseURL: "http://fixture.invalid/v1", fetch: async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.thinking?.type, "disabled");
    assert.equal(body.max_tokens, 8192);
    assert.equal(body.extra_body, undefined, "Node SDK专用字段直接放入请求体，不能使用Python的extra_body");
    return new Response(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "  # 完整报告\n材料不足标注待补充。  " } }] }), { headers: { "Content-Type": "application/json" } });
  }});
  for (const kind of ["expert", "defense"] as const)
    assert.equal(await generateReportText(client, "deepseek-flash", kind, "虚构项目材料", "通用赛道"), "# 完整报告\n材料不足标注待补充。");
  assert.equal(calls, 2);
});

for (const [finish, content, expected] of [
  ["length", "", "AI_OUTPUT_LIMIT"],
  ["length", "不完整的报告", "AI_OUTPUT_LIMIT"],
  ["stop", "  ", "AI_EMPTY_OUTPUT"],
  ["content_filter", "", "AI_CONTENT_FILTER"],
] as const) {
  test(`拒绝无正文或不完整结果 ${finish}/${expected}`, async () => {
    const client = new OpenAI({ apiKey: "fixture-only", fetch: async () => new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content, reasoning_content: "不能当作报告的推理文本" } }] }), { headers: { "Content-Type": "application/json" } }) });
    await assert.rejects(() => generateReportText(client, "fixture-model", "expert", "材料", ""), (e: unknown) => reportFailure(e, "generate").code === expected);
  });
}

test("错误分类不泄露上游原始消息、凭据或项目内容", () => {
  const secret = "sk-fixture-secret project-private";
  assert.equal(reportFailure({status:401,message:secret}, "generate").code, "AI_AUTH_FAILED");
  assert.equal(reportFailure({status:429,message:secret}, "generate").code, "AI_RATE_LIMIT");
  assert.equal(reportFailure({name:"APIConnectionTimeoutError"}, "generate").code, "AI_TIMEOUT");
  assert.equal(reportFailure(new Error(secret), "save").code, "REPORT_SAVE_FAILED");
  assert.ok(!JSON.stringify(reportFailure(new Error(secret), "generate")).includes(secret));
});

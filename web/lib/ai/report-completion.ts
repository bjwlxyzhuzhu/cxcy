import type OpenAI from "openai";
import { reportPrompt } from "../report-prompts";

export class ReportOutputError extends Error {
  constructor(readonly code: "AI_EMPTY_OUTPUT" | "AI_OUTPUT_LIMIT" | "AI_CONTENT_FILTER") {
    super(code);
    this.name = "ReportOutputError";
  }
}

// DeepSeek Flash/V4 defaults to thinking. A small shared reasoning+answer budget
// can end before content starts. Reports need the final document, not reasoning.
// Do not send provider-specific fields to unrelated OpenAI-compatible models.
export function reportCompletionOptions(model: string) {
  return {
    max_tokens: 8192,
    ...(/^deepseek-(?:flash|v4(?:[.-][a-z0-9]+)*)$/i.test(model)
      ? { thinking: { type: "disabled" as const } }
      : {}),
  };
}

export async function generateReportText(
  client: OpenAI,
  model: string,
  kind: "expert" | "defense",
  project: string,
  track: string,
) {
  const response = await client.chat.completions.create(
    {
      model,
      messages: [
        { role: "system", content: reportPrompt(kind, track) },
        { role: "user", content: project },
      ],
      ...reportCompletionOptions(model),
    },
    { timeout: 90000, maxRetries: 0 },
  );
  const choice = response.choices[0];
  if (choice?.finish_reason === "length")
    throw new ReportOutputError("AI_OUTPUT_LIMIT");
  if (choice?.finish_reason === "content_filter")
    throw new ReportOutputError("AI_CONTENT_FILTER");
  const text = choice?.message?.content?.trim();
  if (!text) throw new ReportOutputError("AI_EMPTY_OUTPUT");
  // Never substitute reasoning_content or manufacture a report on failure.
  return text;
}

export function reportFailure(error: unknown, phase: "setup" | "generate" | "save") {
  if (error instanceof ReportOutputError) {
    const messages = {
      AI_EMPTY_OUTPUT: "模型未返回报告正文，请检查模型的思考模式和输出额度",
      AI_OUTPUT_LIMIT: "报告达到模型输出上限，未保存不完整报告，请缩短材料后重试",
      AI_CONTENT_FILTER: "模型未能完成这份材料的生成，请调整内容后重试",
    };
    return { code: error.code, message: messages[error.code] };
  }
  const e = error as { name?: string; status?: number } | null;
  if (phase === "save")
    return { code: "REPORT_SAVE_FAILED", message: "报告保存失败，请联系管理员检查数据库状态" };
  if (e?.name === "APIConnectionTimeoutError" || e?.name === "APIUserAbortError")
    return { code: "AI_TIMEOUT", message: "模型生成超时，请稍后重试或缩短项目材料" };
  if (e?.status === 401 || e?.status === 403)
    return { code: "AI_AUTH_FAILED", message: "模型服务认证失败，请检查所用API配置" };
  if (e?.status === 429)
    return { code: "AI_RATE_LIMIT", message: "模型服务额度不足或请求过于频繁，请检查额度或稍后重试" };
  if (e?.status === 400 || e?.status === 404)
    return { code: "AI_REQUEST_REJECTED", message: "模型服务不接受当前请求，请检查模型名称和接口配置" };
  return phase === "setup"
    ? { code: "REPORT_SERVICE_UNAVAILABLE", message: "报告服务暂不可用，请联系管理员检查配置" }
    : { code: "AI_UPSTREAM_FAILED", message: "模型服务调用失败，请稍后重试" };
}

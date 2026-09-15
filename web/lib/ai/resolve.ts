import "server-only";
import OpenAI from "openai";
import { query } from "@/lib/db";
import { getApimart } from "./apimart";
import { MODELS } from "./models";
import type { Purpose } from "./providers";

/**
 * 按用户 + 用途解析该用哪个 AI 客户端：
 * - 用户在账户中心绑定了自己的 key → 用他自己的（base_url/key/model），usingOwnKey=true，调用方不扣平台积分。
 * - 否则 → 平台默认（APIMart），usingOwnKey=false，调用方按积分规则扣分。
 */
export async function resolveAIClient(userId: string, purpose: Purpose) {
  const { rows } = await query<{ base_url: string; api_key: string; model: string }>(
    "SELECT base_url, api_key, model FROM user_api_keys WHERE user_id = $1 AND purpose = $2 LIMIT 1",
    [userId, purpose]
  );
  const data = rows[0];

  if (data?.api_key && data?.base_url) {
    return {
      client: new OpenAI({ baseURL: data.base_url, apiKey: data.api_key }),
      model: data.model || MODELS.chat,
      usingOwnKey: true as const,
    };
  }

  // 配图固定走 APIMart（gpt-image-2）
  if (purpose === "image") {
    return { client: getApimart(), model: MODELS.image, usingOwnKey: false as const };
  }

  // 平台默认「思考/对话」模型：优先用专配的对话提供方（如 DeepSeek），否则回退 APIMart
  const chatBase = process.env.CHAT_BASE_URL, chatKey = process.env.CHAT_API_KEY;
  if (chatBase && chatKey) {
    return { client: new OpenAI({ baseURL: chatBase, apiKey: chatKey }), model: MODELS.chat, usingOwnKey: false as const };
  }
  return { client: getApimart(), model: MODELS.chat, usingOwnKey: false as const };
}

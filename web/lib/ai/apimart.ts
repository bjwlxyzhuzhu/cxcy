import "server-only";
import OpenAI from "openai";

/**
 * APIMart（OpenAI 兼容网关）服务端客户端。
 * Base URL 与 Key 只从 process.env 读取，前端不可见。
 * 延迟到实际请求时创建，避免镜像构建阶段要求运行期密钥。
 */
let apimart: OpenAI | undefined;

export function getApimart() {
  apimart ??= new OpenAI({
    baseURL: process.env.APIMART_BASE_URL,
    apiKey: process.env.APIMART_API_KEY,
  });
  return apimart;
}

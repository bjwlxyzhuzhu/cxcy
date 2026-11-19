import { actionResponse } from "@/lib/ontology/http";

export const runtime = "nodejs";

/**
 * 执行一个本体动作：{ action: "object.certify", ...参数 }
 * 浏览器发起的动作一律记为“人”执行；AI 起草由服务端流程以 kind="ai" 调用引擎，不经过这个接口。
 */
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return Response.json({ error: "请求格式错误" }, { status: 400 }); }
  const key = String(b.action || "");
  if (!key) return Response.json({ error: "缺少 action" }, { status: 400 });
  return actionResponse(key, b, "human");
}

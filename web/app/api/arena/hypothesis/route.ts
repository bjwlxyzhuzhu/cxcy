import { actionResponse } from "@/lib/ontology/http";

export const runtime = "nodejs";

const ACTIONS: Record<string, string> = {
  create: "hypothesis.create", falsify: "hypothesis.falsify", verify_submit: "hypothesis.verify_submit", review: "hypothesis.review",
};

/** 假设：提出 / 证伪并修正 / 提交现实验证 / 教师确认。业务规则与计分见 lib/ontology/actions/arena.ts */
export async function POST(req: Request) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return Response.json({ error: "请求格式错误" }, { status: 400 }); }
  const key = ACTIONS[String(b.action || "")];
  if (!key) return Response.json({ error: "未知操作" }, { status: 400 });
  return actionResponse(key, b);
}

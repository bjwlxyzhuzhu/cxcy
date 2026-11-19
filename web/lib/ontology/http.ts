import "server-only";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { runAction, ActionError, type ActorKind } from "./index";

/** 接口里执行一个动作：鉴权 → 引擎执行 → 统一的错误响应（状态码来自 ActionError） */
export async function actionResponse(key: string, raw: Record<string, unknown>, kind: ActorKind = "human") {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "未登录，请先登录" }, { status: 401 });
  try {
    return NextResponse.json(runAction(key, { userId: user.id, kind }, raw));
  } catch (e) {
    if (e instanceof ActionError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}

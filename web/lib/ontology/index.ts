import "server-only";
// 项目本体服务端入口：导入即注册全部动作
import "./actions/objects";
import "./actions/arena";
import "./actions/draft";
import "./actions/glossary";
import "./actions/generate";
import "./actions/guide";

export { runAction, listActions, ActionError, type Actor, type ActorKind } from "./engine";

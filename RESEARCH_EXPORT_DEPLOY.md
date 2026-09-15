# 双创智能体平台：论文测试数据导出功能

本次加入内容：

- `web/supabase/migrations/0011_adversarial_dialogue.sql`：论文测试所需的数据表和匿名研究视图；
- `web/app/api/admin/research-export/route.ts`：管理员匿名数据导出接口；
- `web/components/admin/ResearchExport.tsx`：研究数据导出页面；
- `web/components/admin/AdminConsole.tsx`：管理员后台新增“研究数据导出”标签；
- `web/supabase/migrations/_ALL.sql`：同步包含0011迁移。

## 首次使用

1. 在Supabase Dashboard的 SQL Editor 中执行 `web/supabase/migrations/0011_adversarial_dialogue.sql`，或执行完整的 `_ALL.sql`。
2. 给参与研究的学生把 `profiles.research_consent` 设为 `true`，并为其填写不含姓名的 `research_pid`，例如 `T01-S01`。
3. 学生照常使用平台；如果使用对抗性多智能体测试，应把过程写入 `challenge_sessions`、`dialogue_turns`、`plan_versions`、`ct_ratings` 和 `peer_feedback`。
4. 管理员进入 `/admin`，打开“研究数据导出”，点击“导出匿名研究数据 Excel”。

导出工作表包括：学生匿名信息、质询会话、逐轮对话、方案版本、批判性思维评分、同伴反馈、使用日志、证据事件和项目。

## 部署

```bash
pnpm install
pnpm build
pnpm start
```

Docker部署：

```bash
docker compose up -d --build
```

未同意科研使用的学生不会进入研究导出数据；导出文件不包含姓名、学号、邮箱或认证信息。
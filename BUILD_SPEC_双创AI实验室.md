# BUILD SPEC · 双创AI实验室（创赛智能搭子）— 自研 Web 产品

> 这是一份**给 Claude Code（Code 模式）的完整开发说明书**。请严格按本文件实现；遇到选择按本文件“技术栈”执行，不要自行更换。设计风格参考同目录/上层 `02_界面原型/双创AI实验室_界面原型v3.html`（深色玻璃拟态、青紫渐变、可爱圆角、动效）。

## 0. 一句话
做一个面向大学生创新创业竞赛的网站产品“双创AI实验室”——不是一个 AI，是一群“智能搭子”（智能体集群），分**学习中心**与**应用中心**两大板块，帮学生从学习到夺奖。

## 1. 技术栈（钉死）
- 前端：Next.js 14（App Router）+ TypeScript + Tailwind CSS + shadcn/ui + Framer Motion（动效）+ lucide-react。
- 后端：Next.js Route Handlers（服务端，所有密钥仅放服务端）。
- 数据/鉴权/存储/向量：Supabase（Postgres + pgvector + Auth + Storage + RLS 行级权限）。
- AI：通过 APIMart（OpenAI 兼容网关）调用；Base URL `https://api.apimart.ai/v1`。
  - 对话/文本：用环境变量里的聊天模型；生图：模型 `gpt-image-2`。
- 部署：Docker（校内服务器）优先；或 Vercel + 登录白名单。
- 包管理：pnpm。

## 2. 设计系统（与原型一致）
- 背景：深色 `#0a0e1f`～`#0e1430`，径向青/紫光晕；浮动光球动效。
- 主色：青 `#22d3ee`、紫 `#7c5cff` 渐变；强调橙 `#f5a623`；文字 `#eef1fb`、次要 `#9aa6c8`。
- 卡片：玻璃拟态 `rgba(255,255,255,.055)` + 1px 边 + 大圆角(20px)；hover 上浮+轻微旋转。
- 动效：入场 fade-up 错峰、数字人脉冲、学习/应用 弹性滑块切换、案例横向滑块、按钮悬浮。简洁克制、移动端顺滑。
- 字体：PingFang/Microsoft YaHei/Noto Sans CJK。
- 无障碍：图标加 aria-label；对比度达标。

## 3. 信息架构与页面
- `/`（首页）：品牌(双创AI实验室)、数字人“小航”、搭子天团、学习/应用切换、案例滑块、导师寄语、AI客服悬浮。
- `/learn`（学习中心）：模块见 §4.A。
- `/apply`（应用中心）：模块见 §4.B。
- 各功能子页：`/apply/topic`(选题赛道) `/apply/text`(文本生成) `/apply/ppt`(PPT生成) `/apply/defense`(模拟答辩) `/apply/data`(数据分析) `/apply/team`(组队协作)；`/learn/theory` `/learn/policy` `/learn/cases` `/learn/templates` `/learn/quiz` `/learn/links`。
- `/login` 登录注册；`/me` 我的(积分/项目)；`/admin` 管理端。
- `/settings` API 配置（管理员）。

## 4. 功能模块
### A. 学习中心（打基础、拿资源）
1. 理论知识：浏览 5 模块课件（PDF/PPT 预览），可向 AI 老师追问。
2. 政策解读：政策文档库 + AI 摘要/划重点。
3. 案例库：50 个区域产业案例，检索 + AI 拆解。
4. 模板库：BP/路演PPT/专利/合同模板，可下载。
5. 题库闯关：1000 题 + 卡牌闯关游戏（嵌入/复刻），计分。
6. 平台直达：外链导流卡片（获奖证书/答题、注册人工智能学会会员、网课、线上实习），链接可在管理端配置；合规导流，不代刷。

### B. 应用中心（上战场、出成果）
1. 选题与赛道匹配：AI **主动多轮提问**（项目性质/团队/学校层次/目标），输出 2–3 个候选赛道+理由+风险，并给“研/本/专如何组队、补哪类队友”的建议；含跨校组队广场（发帖/应征）。
2. 文本生成：商业计划书、专利交底书、合同、文案，基于模板+RAG，导出 Word（用 `docx` npm 包）。
3. PPT 生成：LLM 出大纲+逐字稿 → `pptxgenjs` 出片；配图调用 **gpt-image-2**（见 §6）。**进入本页若未配置可用额度，提示“需填入 API Key/联系管理员”，并给获取链接 https://apimart.ai/keys 与操作手册入口。**
4. 模拟路演答辩：多角色“评委 Agent”按评分细则连环追问+打分（雷达图），支持多人房间分角色。
5. 数据分析：上传/录入调研数据 → LLM 分析 + 图表（recharts）。
6. 组队协作：团队空间、分工看板、**多人共编一个 PPT 大纲**（Supabase Realtime）。

### C. 贯穿能力
- 数字人“小航”：A 档 Live2D（`pixi-live2d-display`）+ 浏览器 TTS，根据对话实时说话；可后续替换真人数字人。
- AI 客服（RAG 百问百答）：基于知识库（§7）检索增强问答，全站悬浮。
- 千人千面：按用户画像（赛事/赛道/阶段/学科）路由各模块策略与难度。

## 5. 数据模型（Supabase）
- `profiles`(id, 学号, 姓名, 班级, 角色[student/teacher/admin], credits)
- `rosters`(id, 班级, 学号, 姓名)  —— 班级名单导入白名单
- `usage_logs`(id, user_id, action, cost, created_at)  —— 每次 AI/生图调用记录并扣分
- `projects`(id, owner_id, 名称, 赛事, 赛道, 阶段, data jsonb)
- `project_members`(project_id, user_id, role)
- `ppt_outlines`(project_id, content jsonb, updated_by)  —— 协作共编
- `team_posts`(id, 项目方向, 缺角色, 学校, 联系方式脱敏)  —— 跨校组队广场
- `knowledge`(id, source, chunk, embedding vector)  —— pgvector 知识库
- `policies` / `cases` / `templates` / `resource_links`  —— 学习中心内容
- `app_config`(key, value)  —— API 配置、外链等
- 全部表开 RLS：学生只读/改自己项目；admin 全权。

## 6. AI 与生图配置（关键）
- 所有模型调用走**服务端 Route Handler 代理**，密钥读 `process.env`，前端不可见。
- 调用前查 `profiles.credits`，调用后写 `usage_logs` 并扣减；额度不足返回提示。
- 生图：POST `https://api.apimart.ai/v1/images/generations`，model=`gpt-image-2`。
- 管理端 `/settings` 可填/改 Key 与额度规则（也可走环境变量）。

## 7. 知识库导入（RAG）
- 来源：省级精品课程《创新创业基础》资源（5模块课件、50案例、22份备赛文档、选题指南、答辩100问、模板）。
- 流程：抽取文本(`pdf-parse`/`mammoth`) → 切块 → embedding → 存 `knowledge`(pgvector) → 各 AI 功能检索增强。
- 提供管理端“上传→入库”界面。

## 8. 非功能要求
- 安全：密钥服务端；学生/企业数据脱敏；RLS；积分防滥用。
- 合规：平台直达仅导流，页面保留“不得代刷课、伪造证书”声明；算法公平与“主体归人、AI 辅助”边界说明页。
- 性能：首屏 <2.5s；图片懒加载；移动端自适应。
- 可演示：内置一个“演示账号”和示例项目，断网时核心页可展示静态。

## 9. 里程碑与验收（请按阶段交付，每阶段跑通再下一步）
- M0 只读不写：输出目录结构、页面清单、依赖清单、Supabase 表 SQL、API 代理方案。等确认。
- M1 骨架：项目初始化 + 设计系统 + 动效首页（对照 v3 原型）+ Supabase 登录 + 积分字段 + 一个扣积分的服务端示例。验收：本地能登录、能看到首页动效。
- M2 学习中心：6 模块页 + 内容表 + AI 客服 RAG（先导入少量知识库）。验收：能问答、能浏览案例/模板。
- M3 应用中心核心：选题赛道匹配(主动式) + 文本生成(导出Word) + PPT生成(含 gpt-image-2 配图) + 模拟答辩(雷达图)。验收：各功能端到端跑通并扣积分。
- M4 协作与数字人：组队广场 + 共编PPT(Realtime) + Live2D 数字人 + 数据分析。
- M5 管理端 + 部署：班级名单导入、积分发放、知识库/政策上传；Docker 部署 + 环境变量清单 + 演示账号。
- 每阶段结束：自测、`pnpm build` 通过、给出本阶段“如何本地运行”说明与已知问题。

## 10. 环境变量（.env.local，勿提交）
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
APIMART_BASE_URL=https://api.apimart.ai/v1
APIMART_API_KEY=sk-...
CHAT_MODEL=gpt-4o
IMAGE_MODEL=gpt-image-2
EMBED_MODEL=text-embedding-3-small
```

## 11. 工作方式（给 Claude Code 的硬性要求）
1. 先做 M0（只读不写）产出方案与任务拆解，等我确认。
2. 之后每个里程碑：实现 → `pnpm dev` 自测 → `pnpm build` 通过 → 用一段话报告“做了什么、如何运行、下一步”。
3. 不要一次性写完所有东西；按 M1→M5 顺序，小步快跑、每步可运行。
4. 所有密钥放服务端；生成的代码要能直接 `pnpm dev` 跑起来。
5. 遇到不确定的内容（如外链地址、班级名单），用占位并在报告里列出“需要我补的清单”。

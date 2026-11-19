# 移交说明 · 双创AI星际「虚实对局」

> 移交日期 2026-11-16。本文件给接手开发的 Claude Code 阅读，先读完再动代码。

## 0. 最新决定（2026-11-16，优先级高于下文）

**不再使用 Supabase。** 先在本机开发，将来迁移到 tokenone.work 的服务器。
下文凡提到 Supabase 的地方（运行方式、迁移执行、service-role、RLS）都按本节改造后再理解。

现状盘点（接手时的代码）：
- 39 个文件引用 Supabase；`.from("表")` 查询 119 处，涉及 22 张表；RPC 2 个（`deduct_credits`、`match_knowledge`）；未用 Storage。
- 认证全部走 Supabase Auth：`getUser` 7 处、`getSession` 3 处、`signInWithPassword` 2 处、`signOut` / `updateUser` 各 1 处，
  管理端 `auth.admin.createUser / listUsers / updateUserById` 共 5 处；`middleware.ts` 负责刷新会话。
- 迁移 SQL 里有 38 处 `auth.users` / `auth.uid()`（外键与 RLS 策略），并使用了 pgvector（`match_knowledge`）。
- 入口集中在 `lib/supabase/{admin,client,server}.ts`。

**执行结果（2026-11-17，阶段一已完成）**：经用户确认改用 **SQLite（Node 内置 node:sqlite）**，而非下文的 Postgres + pgvector。
- 数据层：`lib/db.ts` 薄封装，兼容原链式写法；`db/migrations/0001_baseline.sql` 合并 0001–0013；`deduct_credits`、`match_knowledge` 用 JS 实现。
- 认证：`users` 表 + scrypt 密码 + HMAC 签名 httpOnly cookie（`lib/auth.ts`、`lib/session.ts`、`/api/auth/*`）；登录账号即学号，不再拼伪邮箱域名。
- 前端不再直连数据库，原 11 处浏览器端查询改为 `/api/me/*`、`/api/learn/*`、`/api/admin/*` 接口。
- 已移除 `@supabase/ssr`、`@supabase/supabase-js`；部署见 `部署说明.md`。下文第 2 节“运行方式/迁移执行”以 `部署说明.md` 为准。

原推荐的替换方案（仅作记录）：
1. **数据库：本机 PostgreSQL（带 pgvector 扩展）。** 现有迁移就是 Postgres SQL，改动最小；
   将来迁服务器用 `pg_dump / pg_restore` 即可。本机用 Docker 起一个 `pgvector/pgvector` 镜像，写进 `docker-compose.yml`。
2. **数据访问：** 新建 `lib/db.ts`（`pg` 连接池）。两种做法择一：
   a) 写一个只覆盖本项目用到的方法的薄封装（`from().select().eq().in().order().limit().insert().update().delete().maybeSingle()` 等），
      让 119 处调用基本不用改；b) 逐个接口改写成 SQL。建议先 a 后按需 b，先统计实际用到了哪些链式方法再决定。
3. **认证：** 自建 `users` 表（id uuid、账号、bcrypt 密码哈希、角色）+ httpOnly 签名会话 cookie；
   新建 `lib/auth.ts` 提供 `getUser()`，替换全部 `supabase.auth.*`；`middleware.ts` 改为校验该 cookie；
   管理端的建号、改密、列用户改成直接读写 `users` 表（含 120 人名册导入脚本 `scripts/`）。
4. **迁移 SQL：** 新写一份不依赖 Supabase 的基线迁移：`auth.users` 外键改指向 `public.users`；
   删除 RLS 策略与 `auth.uid()`（现在所有访问都经服务端接口，权限在接口里判断，这点必须逐个接口核对）；
   去掉 `anon / authenticated / service_role` 相关的 grant/revoke；`deduct_credits`、`match_knowledge` 保留为普通函数。
5. **清理：** 移除 `@supabase/ssr`、`@supabase/supabase-js`，更新 `.env.example`（改为 `DATABASE_URL`、`SESSION_SECRET`）、
   `Dockerfile`、`docker-compose.yml`、部署说明。

注意：
- 去掉 RLS 后，“学生只能看到自己队伍的数据”完全靠接口里的判断，替换时逐个接口检查有没有漏掉的权限校验。
- 部署目标从“校园网云主机”变为 tokenone.work 服务器。参赛材料里如果写了“数据不出校”，需要用户确认表述是否还成立；代码里不要写死任何域名。
- 这是一次涉及全项目的改造，不只是虚实对局模块。分步做：先数据层和认证跑通登录，再逐模块回归，最后才是第 5 节的对局实测。

## 1. 这是什么

《创新创业基础》课程用的教学智能体平台，参加省级教师教学创新大赛人工智能赛道。
本次新增的核心模块叫「虚实对局」：学生把真实调研做成数字分身，教师注入评委、投资人、导师等角色，
课堂上以对战游戏的形式压测商业假设，再回到现实验证。

三条不能破坏的教学原则（写在界面和计分里）：
- 分身是假设，不是证据；分身只做角色原型，不复制真人。
- 计分只认证据（数据、访谈原话、实测）。
- 护盾降到底不算输，只触发“现实检验”。

## 2. 技术栈与运行

- Next.js 14 (app router) + TypeScript + Supabase（服务端用 service-role admin client，RLS 开启）
- 包管理 pnpm；国内网络可加 `--registry=https://registry.npmmirror.com`
- 模型：默认 `deepseek-flash`，通过 `CHAT_BASE_URL / CHAT_API_KEY / CHAT_MODEL` 配置，见 `.env.example`
- 部署目标：校园网云主机，Docker，数据不出校。部署步骤见 `校园网部署说明_虚实对局.md`

```bash
pnpm install
cp .env.example .env.local   # 填 Supabase 与 DeepSeek
pnpm dev                     # http://localhost:3000
npx tsc --noEmit && pnpm build   # 提交前必须都通过
```

数据库：全新环境执行 `supabase/migrations/_ALL.sql`（0001–0013 合并）；旧环境补执行 0012、0013。

## 3. 本模块的文件

| 文件 | 作用 |
|---|---|
| `supabase/migrations/0012_arena.sql` | personas / arena_matches / arena_teams / arena_members / hypotheses / arena_events，视图 v_research_arena |
| `supabase/migrations/0013_arena_seats.sql` | arena_members.seat（队内席位 0–4） |
| `lib/arenaShared.ts` | 前后端共用：角色类型、计分 POINTS、规则文案、席位 SEATS、头像路径 avatarOf/seatAvatar、画面参数 BAR |
| `lib/arena.ts` | 服务端：isTeacher、PII 扫描与脱敏、检索、personaSystem（要求模型输出 TAGS 行）、parseTags、citesEvidence、logArena |
| `app/api/persona/route.ts` | 分身与角色的增删改查；分身创建含同意项 + PII 脱敏 + LLM 生成角色卡 |
| `app/api/arena/route.ts` | 对局：create/start/next/end/reopen/join(带 seat)/venture；GET 返回 mySeat |
| `app/api/arena/turn/route.ts` | 一次交锋；写 challenge_sessions / dialogue_turns；返回 reply、tags、points、cited |
| `app/api/arena/hypothesis/route.ts` | 假设：create / falsify / verify_submit / review（教师确认） |
| `app/api/arena/board/route.ts` | 大屏数据：board（含各队 members）、feed、totals、verifying、focus（`?focus=队伍id`）、loops |
| `components/arena/battle.tsx` | 对战画面部件：Avatar、Fighter、Speech、Bar、Banner、Stage、useNarrow |
| `components/arena/ui.tsx` | box / field / Btn / Tag / api |
| `app/globals.css` 末尾 | `bt-*` 动效与 `.bt-layout` 布局（不引外部字体，校园网可用） |
| `app/apply/arena/page.tsx` | 学生对战 |
| `app/apply/twin/page.tsx` | 分身工坊（TwinStage 逐项校对） |
| `app/arena/screen/page.tsx` | 教师大屏：对战看板 / 焦点对战 / 四层闭环 |
| `public/avatars/` | 12 个角色（按 role_type 命名）+ s1–s5 学生席位头像 |

计分（`POINTS`）：带证据回应 +1（每队每轮上限 8）、提出假设 +1（每轮前 5 条）、证伪并修正 +3、现实验证经教师确认 +5、分身命中 +1、协作 +1。
画面上的“假设护盾 / 质疑值”由 `BAR` 从交锋记录推出，只是反馈，不入库、不计分。

## 4. 现在的真实状态

已验证：
- `tsc --noEmit` 与 `next build` 通过。
- 六个画面在无头浏览器里用**模拟接口数据**渲染过，无页面报错。截图在 `docs/handoff/screens/`，
  复现脚本 `docs/handoff/preview_mock.py`（Playwright 拦截 `/api/**`，需要先 build 并在 3311 端口启动）。
- 0012 迁移在本地 Postgres 做过冒烟测试。

**2026-11-17 更新**：
- 整局流程（开局→入队选席位→交锋→假设→证伪→提交验证→教师确认→大屏三模式）已用本机模拟模型跑通，见 `scripts/test-arena-e2e.mjs`（56 项）。
- `citesEvidence` 正反例单测见 `scripts/test-cites-evidence.mts`。旧规则在 24 条用例上误判 10 条（漏判 3、误判 7）；
  经课程负责人确认已改为新规则（排除计划/预测/假想/团队介绍/自家定价，识别汉字数字与单引号原话），33 条用例全部判对。
  用例由开发者编写，需用真实课堂发言抽样复核。
- 30 人 6 队压测：大屏统计已改为数据库分组汇总，去掉 4000/3000 行上限导致的截断；大屏单次约 16–17ms，课堂并发零错误。
- 仍未验证：真实 DeepSeek 的 TAGS 行输出稳定性（需在服务器填密钥后跑 20 次以上）。

**项目本体（2026-11-17 起，按“人判断 / AI 执行”改造，共 7 步）**：
- 第 1 步已完成：迁移 `0002_ontology.sql`（项目成员、7 类对象、通用关系 onto_links、动作审计 onto_audit、假设表可归属项目）；
  `lib/ontology/schema.ts`（对象与关系定义、产品线 8 步）、`engine.ts`（动作引擎：事务 + 审计 + humanOnly）、
  `actions/objects.ts`（草稿→认证→教师确认、关系）、`actions/arena.ts`（对局与假设动作已迁入引擎）；接口 `/api/ontology/*`。
- 规则：AI 只能起草（origin=ai）；认证、计分、发布版本、教师确认必须由人执行；证据认证必须挂真实来源；
  决策必须依据已认证证据；V0.1 之后的版本必须源于已认证决策。
- 第 2 步已完成：迁移 `0003_materials.sql`（调研资料，入库前脱敏）；`lib/ontology/extract.ts`（抽取提示词、规范化、防编造：
  原话须能在原文逐字找到、样本量须在原文出现，否则清空并在卡片上警示）；动作 `material.add`（人）与 `draft.import`（AI，只建草稿）；
  接口 `/api/ontology/extract`（不扣积分，每人每天 20 次，失败可凭资料重试）；页面 `/apply/ontology`（上传 → AI 起草 → 逐条认证，
  认证证据时按资料预填真实来源，仍需学生确认）。页面暂未挂到首页导航，第 4 步统一入口时接入。
- 第 3 步已完成：迁移 `0004_glossary.sql`（团队术语 project_id 非空；课堂口径 project_id 为空、由教师维护）；
  `lib/ontology/glossary.ts`（AI 口径检查：术语须在原文出现、每种说法的原话须在标注来源中逐字可查，少于两种不算冲突；
  `glossaryFor / matchTerms / glossaryPrompt` 供第 6 步注入 AI 上下文，只含人认过的口径）；动作 `glossary.resolve`（人工确认现有定义无误，只清冲突）、`class.term_upsert / class.term_retire /
  class.seed_terms`（仅教师）、`draft.glossary_import`（AI，只建草稿或给已认证术语加冲突标记，每人每天 10 次）；
  术语认证须有定义，认证后清空冲突。接口 `/api/ontology/glossary`；页面 `/apply/ontology` 新增“术语口径”页签。
- 第 4 步已完成：学生工作台 `/studio`（8 步进度由 `lib/ontology/progress.ts` 按已认证对象自动判定，第 7、8 步标“即将上线”；
  步骤说明与模块挂接见 `lib/ontology/pipeline.ts`）；教师工作台 `/teacher`（四张入口卡 + 各项目进度与卡点，只显示项目名、队名与人数）；
  首页按角色显示“项目工作台 / 教师工作台”按钮；`components/ProjectBar.tsx` 显示在所有模块顶部；当前项目记在浏览器本地（仅为便利）；
  `/api/projects` 改为项目成员可读写、负责人可删；驾驶舱打开时载入当前项目草稿并 4 秒自动保存；动作 `arena.bind_project`（对局队伍绑定本队项目）；
  项目本体页新增“新建对象”与“建立关系”控件，支持 `?project=` 与 `?tab=`。接口 `/api/ontology/progress`、`/api/teacher/overview`。
- 第 5 步已完成：`lib/ontology/generate.ts`（第 1、3、4、5、6 步“AI 起草本步”：只依据已认证对象与术语口径；引用编号须存在且类型正确；
  测试报告的数值与原话须在测试资料中查到；V0.2 的建议须引用已认证证据，否则丢弃）；动作 `draft.generate`（AI，只建草稿与关系）；
  接口 `/api/ontology/generate`（按“文本生成”扣积分，起草成功后才扣，自带密钥不扣）。迁移 `0005_artifacts.sql` 与 `lib/ontology/render.ts`：
  第 7 步路演 HTML（不调用模型、自包含、离线翻页，学生审阅确认后完成）、第 8 步项目档案（生成即归档）；动作 `artifact.generate / certify / revoke`；
  接口 `/api/ontology/artifact`（预览 / 下载，带禁止外部资源的安全策略头）。新增保护：AI 原话被清空的证据须由人补上原话才能认证。
- 第 6 步已完成：`lib/ontology/context.ts`。`ontologyContext` 把问题里的词对到术语口径，按相关度挑选已认证对象并编号（〔E2〕），
  附统一回答规则（项目事实只用本体并标出处，本体里没有的直说，不编造）；非本人项目只给课堂口径。`checkCitations` 回答后校验出处：
  保留真实编号、删除编造编号，出处并入 sources（各页面“📚 参考”直接显示）。已接入 `/api/ai/ask`（驾驶舱、陪练、学习问答、首页小创小闯）、
  `/api/ai/chat`；分身对战用 `opponentBrief`（对方已认证证据 + 口径，放在 TAGS 格式要求之前）。前端调用带当前项目 `project_id`。
- 第 7 步已完成：`lib/ontology/abilities.ts` 五力画像（判断 / 共情 / 创造 / 反思 / 联结）只数已认证或教师已确认的记录与对局计分事件，
  每一力列出“数了什么、数到多少”，分值 = 计数 × 权重、封顶 100，不由 AI 打分；接入 `/api/ontology/progress`、`/api/teacher/overview` 与学生工作台。
  `lib/ontology/guide.ts`：现实验证自动预审（只查“谁 / 怎么验证 / 结果 / 具体数字”是否写全、标出计划性说法，真实性仍由教师判断）；
  按卡点或停滞步骤起草四段式干预卡。动作 `intervention.send`（仅教师、须由人执行，发给项目全体成员，7 天内同类卡不重复，“去哪练”只收平台内链接）。
  教师工作台改为：待确认的现实验证（预审标签 + 确认 +5 / 退回）、引导师面板（8 步、五力计数、卡点、看本体、起草并修改后发送干预卡）。
  大屏新增“MVP 迭代”页：绑定项目的队伍显示 8 步进度与已发布版本，只显示队名。
- 平台重组（2026-11-18，按用户意见直接改）：结构见 `平台结构.md`。一条主线 = 8 次课 = 项目 8 步（`lib/course.ts`）。
  新增：学生 `/course`；教师 `/teacher/live` 授课工作台、`/teacher/contest` 参赛材料（AI+ 赛道）；接口 `/api/me/class`、`/api/teacher/live`、`/api/teacher/contest`；
  迁移 `0006_class_teachers.sql`（班级—教师关联）、`0007_lessons.sql`（授课记录与课堂打点）；`lib/classes.ts`（教师只看本班）；
  名单导入支持学生 / 教师 / 管理员与师生关联（教师只能导入学生，且不会重置操作者本人）；`components/DigitalHuman.tsx`（星舰里的小创）。
  减法：删除 `/apply/ppt`、`/api/ppt`、`/apply/text`、`/apply/crew`、`components/CrewWorkspace.tsx`、PPT CDN 加载器与 PPT 配图用途；我会创星系并入知识星球。
  驾驶舱商业计划书改为逐节撰写、逐节修改，不设字数上限；所有导出去掉〔E2〕出处标记。已删除含旧 Supabase 密钥的 5 个脚本。
  联调：模拟模型新增 `POST /reset`，对局联调开头会调用，连续多次运行不再错位。
- 待办：上服务器填入 DeepSeek 密钥后实测 TAGS 解析率、抽取质量与出处遵守率；上级目录的移交包 zip 里可能仍含旧密钥脚本，需另行处理。

**没有验证（接手时的原始清单）**：
- 没有连过真实 Supabase，也没有调用过真实 DeepSeek。登录态、RLS、service-role 查询都没实跑。
- 0013 迁移没有单独在数据库执行过。
- 模型是否稳定输出 TAGS 行（demand_evidence / unknown / hypothesis）没实测；这决定“证据命中”“现实检验”是否触发。
- `citesEvidence` 是关键词与数字的启发式判断，误判率未知。
- 多人同时在线（约 30 人、6 队）没有压测；学生端 10 秒、大屏 4 秒轮询。

## 5. 建议的下一步（按顺序）

1. 配好 `.env.local`，执行迁移，本机 `pnpm dev` 跑通完整一局：
   教师开局 → 学生入队选席位 → 交锋 → 提假设 → 证伪 → 提交验证 → 教师确认 → 大屏三个模式数字正确。
2. 用真实 DeepSeek 跑 20 次以上交锋，统计 TAGS 行解析成功率；不稳就改 `personaSystem` 提示词或给 `parseTags` 加兜底。
3. 给 `citesEvidence` 写几组正反例单测，必要时改为让模型判定。
4. 30 人并发下检查 `/api/arena/board` 的查询量（目前一次取全场 dialogue_turns，上限 3000 条）。
5. 口型：目前只有头像律动 + 声波条。若要更像说话，为每个头像准备说话循环的 WebP/GIF，在 `Fighter` 的 `talking` 状态下切换图片。
6. 头像是从合图裁出的 360px 小图，大屏 300px 显示偏糊；拿到 512px 以上单人图后直接替换同名文件。

## 6. 约束

- 匿名：任何界面不出现学校名、教师或学生真实姓名；大屏只显示席位与虚拟头像。头像只用 AI 生成的虚拟人像。
- 不写入任何预置的“成果数据”。四层闭环等统计必须全部来自数据库真实记录。
- 截图里的队名、分数、对话是演示数据，不得用于参赛材料。
- 画面是原创街机风格，不使用任何现成游戏的角色或美术。
- 不引入外网字体/CDN；不新增第三方工具，学生侧只有这一个平台 + 一个模型。
- 改数据库用新的迁移文件（0014 起），并同步重新生成 `_ALL.sql`。
- 界面文案用中文，注释用中文，沿用现有内联样式写法与 `C`、`ARCADE`、`MONO` 常量。

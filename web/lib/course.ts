/**
 * 课程主线（客户端可用的纯数据）：《创新创业基础》8 个单元 = 产品线 8 步。
 * 每个单元都是 课前（知识星球 · AI 学情诊断）→ 课中（人机协同课堂任务）→ 课后（项目工作台 · 智能评价反馈）的闭环，
 * 学生从第 1 次课到最后一次课都在同一个项目上推进；教师授课、学情画像、课程教学记录都按这张表组织。
 * 区域产业素材（钛及钛合金产业链、青铜器与周秦文化、文旅融合）作为选题与案例方向，不出现学校名称。
 */

export type Phase = { label: string; task: string; module: { label: string; href: string }; ai: string };
export type Unit = {
  no: number; title: string; question: string; color: string;
  pre: Phase; inClass: Phase; post: Phase;
  ability: string;         // 本单元主练的五力
  region: string;          // 区域产业结合点
  values: string;          // 课程思政融入点
};

export const REGION_THEMES = [
  { key: "titanium", label: "钛及钛合金产业链", icon: "🔩", hint: "材料加工、检测、医疗与航空零部件、产业链上下游的中小企业痛点" },
  { key: "bronze", label: "青铜器与周秦文化", icon: "🏺", hint: "文物纹样数字化、文创设计、研学课程、非遗传承人的真实需求" },
  { key: "tourism", label: "文旅融合", icon: "🏞️", hint: "景区导览、乡村文旅、夜游与研学线路、游客体验与本地商户" },
];

export const UNITS: Unit[] = [
  {
    no: 1, title: "创新思维与机会识别", question: "身边哪个真实问题值得做？", color: "#0E7490",
    pre: { label: "课前", task: "在知识星球学“创新思维”，用选题匹配做一次方向自测", module: { label: "选题匹配", href: "/apply/topic" }, ai: "AI 学情诊断：多轮追问兴趣与专业，给出赛道建议" },
    inClass: { label: "课中", task: "小组用区域产业素材做机会扫描，确定赛道与目标人群", module: { label: "项目工作台 · 第 1 步", href: "/studio" }, ai: "AI 起草赛道画像，小组逐条核对并认证" },
    post: { label: "课后", task: "完成赛道画像并认证，组建项目团队", module: { label: "项目工作台", href: "/studio" }, ai: "平台自动判定第 1 步是否完成" },
    ability: "判断力", region: "从钛产业链、青铜器文创、文旅场景中各找一个真实痛点", values: "立足地方、服务区域发展",
  },
  {
    no: 2, title: "用户洞察与问题定义", question: "用户真正在意什么？", color: "#0369A1",
    pre: { label: "课前", task: "学访谈方法，准备访谈提纲并完成至少 2 次真实访谈", module: { label: "分身工坊", href: "/apply/twin" }, ai: "AI 帮你检查提纲是否诱导、是否有开放问题" },
    inClass: { label: "课中", task: "上传访谈记录，AI 自动抽取原话与证据，小组写 HMW 问题", module: { label: "项目本体", href: "/apply/ontology" }, ai: "AI 抽取证据草稿，原话必须在资料里查得到" },
    post: { label: "课后", task: "认证用户原话与 HMW 问题，把调研注入数字分身", module: { label: "项目工作台 · 第 2 步", href: "/studio" }, ai: "平台按带原话的证据统计共情力" },
    ability: "共情力", region: "走访一家相关企业、文博或文旅从业者，记录原话", values: "尊重用户、实事求是",
  },
  {
    no: 3, title: "创意生成与方案设计", question: "有哪几种解法，选哪个？", color: "#1D4ED8",
    pre: { label: "课前", task: "在知识星球看案例宝库里的同类项目，列出 3 种以上解法", module: { label: "案例宝库", href: "/learn/cases" }, ai: "AI 拆解案例逻辑，提示可借鉴与不可照搬之处" },
    inClass: { label: "课中", task: "头脑风暴 + 方案对比，写产品任务书（做什么、怎么验证、风险）", module: { label: "项目工作台 · 第 3 步", href: "/studio" }, ai: "AI 依据已认证证据起草任务书草稿" },
    post: { label: "课后", task: "认证任务书，确定验证指标", module: { label: "项目工作台", href: "/studio" }, ai: "平台按备选方案数统计创造力" },
    ability: "创造力", region: "把传统纹样、工艺或景区资源转成可验证的产品方案", values: "文化自信、守正创新",
  },
  {
    no: 4, title: "原型与最小可行产品", question: "最小能让用户试用的版本是什么？", color: "#6D28D9",
    pre: { label: "课前", task: "学 MVP 方法，选定原型形式（页面、模型、服务流程）", module: { label: "理论知识", href: "/learn/theory" }, ai: "AI 老师讲解 MVP 并检查你的范围是否过大" },
    inClass: { label: "课中", task: "在创业星舰里由智能体团队协同，做出 V0.1 与说明", module: { label: "创业星舰", href: "/apply/cockpit" }, ai: "智能体集群起草，小组判断取舍" },
    post: { label: "课后", task: "认证 V0.1，准备给真实用户试用", module: { label: "项目工作台 · 第 4 步", href: "/studio" }, ai: "平台记录版本与改动" },
    ability: "创造力", region: "做一个能拿到企业、文博或景区现场试用的原型", values: "工匠精神、精益求精",
  },
  {
    no: 5, title: "真实验证与证据", question: "证据支持还是推翻了假设？", color: "#B45309",
    pre: { label: "课前", task: "列出最关键的 3 条假设，准备验证方案", module: { label: "项目本体", href: "/apply/ontology" }, ai: "AI 提醒哪些假设还没有证据" },
    inClass: { label: "课中", task: "虚实对局：与数字分身、评委与投资人角色交锋，提出与证伪假设", module: { label: "虚实对局", href: "/apply/arena" }, ai: "AI 角色追问证据，平台按证据计分" },
    post: { label: "课后", task: "回到现实验证，提交证据由教师确认；写测试报告", module: { label: "项目工作台 · 第 5 步", href: "/studio" }, ai: "AI 预审验证要素，教师确认后计分" },
    ability: "反思力", region: "到合作企业、文博单位或景区做一次真实试用并记录数据", values: "科学精神、诚信",
  },
  {
    no: 6, title: "商业模式与迭代决策", question: "保留、修改还是放弃？", color: "#C2410C",
    pre: { label: "课前", task: "学商业模式画布，对照测试报告列出要改的地方", module: { label: "理论知识", href: "/learn/theory" }, ai: "AI 老师逐格讲解画布" },
    inClass: { label: "课中", task: "专家打磨：AI 专家团逐项审，小组做出有证据的决策", module: { label: "专家打磨", href: "/apply/expert" }, ai: "AI 审稿，决策必须挂已认证证据" },
    post: { label: "课后", task: "发布 V0.2，写清每条改动来自哪条证据", module: { label: "项目工作台 · 第 6 步", href: "/studio" }, ai: "平台检查 V0.2 是否源于已认证决策" },
    ability: "判断力", region: "核算在本地产业或景区落地的成本与收入", values: "社会责任、可持续",
  },
  {
    no: 7, title: "路演表达与答辩", question: "怎样让评委三分钟看懂？", color: "#BE185D",
    pre: { label: "课前", task: "看路演结构讲解，生成本项目的路演页", module: { label: "项目工作台 · 第 7 步", href: "/studio" }, ai: "平台把证据链排成路演页（不编造内容）" },
    inClass: { label: "课中", task: "模拟答辩：多角色评委连环追问，小组轮流上台", module: { label: "模拟答辩", href: "/apply/defense" }, ai: "AI 评委追问，雷达图反馈" },
    post: { label: "课后", task: "审阅确认路演页，按追问补证据", module: { label: "项目工作台", href: "/studio" }, ai: "平台记录答辩表现" },
    ability: "联结力", region: "讲清项目与区域产业、文化传承的联系", values: "讲好中国故事",
  },
  {
    no: 8, title: "复盘与成长", question: "我学会了什么，下一步做什么？", color: "#15803D",
    pre: { label: "课前", task: "回看成长星图与五力雷达，写个人复盘", module: { label: "成长星图", href: "/me/growth" }, ai: "平台汇总你的证据链" },
    inClass: { label: "课中", task: "项目展示与互评，教师点评，推荐参赛项目", module: { label: "教师工作台", href: "/teacher" }, ai: "AI 汇总全班数据，教师判断" },
    post: { label: "课后", task: "生成项目档案，继续冲刺比赛", module: { label: "项目工作台 · 第 8 步", href: "/studio" }, ai: "平台归档本体、版本、证据链与决策日志" },
    ability: "反思力", region: "对接本地企业、文博或文旅单位的后续合作", values: "家国情怀、终身学习",
  },
];

/** 课堂实录打点用的教学环节（与教案、实录视频进度条一一对应） */
export const LESSON_MARKS = [
  { key: "intro", label: "课程导入", color: "#0E7490" },
  { key: "teach", label: "知识讲解", color: "#1D4ED8" },
  { key: "ai", label: "AI 工具使用", color: "#6D28D9" },
  { key: "arena", label: "虚实对局", color: "#B45309" },
  { key: "group", label: "小组研讨", color: "#C2410C" },
  { key: "show", label: "展示点评", color: "#BE185D" },
  { key: "values", label: "思政提升", color: "#B91C1C" },
  { key: "summary", label: "总结布置", color: "#15803D" },
];

export const unitOf = (no: number) => UNITS.find((u) => u.no === no) || UNITS[0];

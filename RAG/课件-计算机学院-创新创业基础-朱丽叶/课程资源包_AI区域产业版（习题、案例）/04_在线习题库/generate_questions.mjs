const modules = [
  {
    id: "M01",
    name: "创新创业认知与课程导论",
    competencies: ["创新创业基本概念", "创业精神", "问题意识", "课程项目流程", "区域产业认知"],
    contexts: ["宝鸡钛产业", "凤翔泥塑文创", "眉县猕猴桃", "青铜器研学", "陕西高校双创项目"],
    concepts: [
      ["创新", "把新想法转化为有价值的产品、服务、流程或组织方式"],
      ["创业", "在不确定环境中整合资源、创造价值并承担风险的过程"],
      ["机会", "用户需求、技术变化、产业资源和商业可行性交汇形成的可行动空间"],
      ["价值创造", "为用户、社会或产业解决真实问题并形成正向收益"],
      ["课程项目", "以真实问题为起点，通过调研、验证、设计和展示完成学习闭环"]
    ]
  },
  {
    id: "M02",
    name: "机会识别与区域产业",
    competencies: ["痛点识别", "PEST分析", "产业链观察", "需求场景化", "机会筛选"],
    contexts: ["宝鸡钛谷企业", "蔡家坡汽车零部件", "太白山文旅", "凤县康养旅游", "陕西低空经济"],
    concepts: [
      ["痛点", "用户在任务、体验、成本、效率或情感上的明显不便"],
      ["机会窗口", "政策、技术、市场或资源变化带来的短期行动空间"],
      ["产业链", "从原料、生产、渠道到用户服务的价值活动组合"],
      ["目标用户", "最可能使用、付费或受益的一类具体人群"],
      ["场景", "用户在特定时间、地点和任务下产生需求的情境"]
    ]
  },
  {
    id: "M03",
    name: "用户调研与需求验证",
    competencies: ["访谈设计", "问卷设计", "样本意识", "数据证据", "需求优先级"],
    contexts: ["高校学生创业团队", "眉县果农合作社", "研学机构老师", "文创产品消费者", "社区养老服务对象"],
    concepts: [
      ["用户访谈", "通过开放式提问理解用户真实任务、动机和阻碍"],
      ["问卷", "用结构化题项收集可统计的用户态度、行为和需求信息"],
      ["样本偏差", "样本来源过窄导致结论不能代表目标用户整体"],
      ["需求验证", "用数据、访谈、试用或订单证明需求真实存在"],
      ["用户画像", "用关键特征、任务、痛点和使用场景描绘目标用户"]
    ]
  },
  {
    id: "M04",
    name: "商业模式与价值主张",
    competencies: ["商业画布", "价值主张", "收入来源", "关键资源", "合作伙伴"],
    contexts: ["钛文创礼品", "青铜器研学盒", "校园AI学习助手", "农产品冷链服务", "文旅短视频服务"],
    concepts: [
      ["价值主张", "项目承诺为目标用户解决的核心问题和带来的关键收益"],
      ["商业模式画布", "从用户、价值、渠道、关系、收入、资源、活动、伙伴和成本描述项目逻辑"],
      ["收入来源", "用户或客户愿意为产品服务支付的方式和依据"],
      ["关键资源", "项目持续运行所必需的技术、团队、渠道、品牌或数据等资源"],
      ["成本结构", "项目开发、交付、运营、获客和维护所产生的主要成本"]
    ]
  },
  {
    id: "M05",
    name: "市场分析与竞品定位",
    competencies: ["市场细分", "竞品分析", "定位矩阵", "差异化", "进入策略"],
    contexts: ["陕西文旅产品", "高校双创服务", "农产品电商", "智能硬件项目", "本地生活服务"],
    concepts: [
      ["市场细分", "按照用户需求、行为、区域或支付能力划分目标市场"],
      ["竞品", "满足相似用户需求或争夺同类预算的替代方案"],
      ["定位", "项目在用户心智中相对竞品形成的清晰差异"],
      ["差异化", "通过功能、体验、成本、渠道或品牌形成可感知优势"],
      ["进入策略", "项目切入市场时选择的用户、场景、渠道和节奏"]
    ]
  },
  {
    id: "M06",
    name: "AI赋能创新与智能体应用",
    competencies: ["AI工具选择", "提示词设计", "智能体流程", "事实核验", "人机协同"],
    contexts: ["DeepSeek辅助项目诊断", "AI生成访谈提纲", "智能体路演问答", "AI辅助PPT大纲", "课程项目复盘"],
    concepts: [
      ["生成式AI", "根据输入生成文本、图像、代码或方案建议的人工智能技术"],
      ["提示词", "引导AI完成任务的目标、背景、约束、步骤和输出格式"],
      ["智能体", "能围绕目标调用工具、执行步骤并反馈结果的AI应用形态"],
      ["事实核验", "对AI输出中的数据、政策、案例和引用进行来源确认"],
      ["人机协同", "由人确定目标、价值和责任，由AI提高搜索、生成和迭代效率"]
    ]
  },
  {
    id: "M07",
    name: "项目计划、团队与执行",
    competencies: ["任务拆解", "里程碑", "团队分工", "风险管理", "资源整合"],
    contexts: ["大创项目申报", "挑战杯备赛团队", "校企合作任务", "课程小组项目", "社会实践项目"],
    concepts: [
      ["里程碑", "项目推进中用于检查成果和进度的关键节点"],
      ["任务拆解", "把总目标分解为可执行、可检查、可分工的小任务"],
      ["团队角色", "按照能力与任务分配负责人、技术、调研、运营和展示等职责"],
      ["风险管理", "识别可能影响项目目标的因素并准备应对措施"],
      ["资源整合", "连接导师、企业、平台、资金、场地和数据等支持条件"]
    ]
  },
  {
    id: "M08",
    name: "财务、融资与成本收益",
    competencies: ["成本测算", "收入预测", "盈亏平衡", "融资逻辑", "单位经济模型"],
    contexts: ["农产品冷链项目", "文创产品小批量生产", "校园服务订阅", "低空巡检服务", "研学课程包"],
    concepts: [
      ["固定成本", "短期内不随销量直接变化的成本，如设备、场地、基础人员投入"],
      ["变动成本", "随产品或服务交付数量变化的成本，如材料、包装、物流费用"],
      ["盈亏平衡", "收入刚好覆盖总成本时的销量或收入水平"],
      ["融资", "为项目发展获取外部资金、资源或信用支持的过程"],
      ["单位经济模型", "单个用户、订单或产品带来的收入、成本和利润关系"]
    ]
  },
  {
    id: "M09",
    name: "知识产权、伦理与合规",
    competencies: ["版权意识", "专利基础", "商标意识", "数据隐私", "AI伦理"],
    contexts: ["课程PPT资源共享", "软件著作权申请", "文创图案设计", "AI生成内容", "学生项目路演"],
    concepts: [
      ["知识产权", "法律保护的智力成果相关权利，包括著作权、专利、商标等"],
      ["著作权", "对文字、图片、软件、课件等作品依法享有的权利"],
      ["专利", "对符合条件的发明创造依法授予的排他性权利"],
      ["数据隐私", "个人信息和敏感数据在收集、使用、存储中的保护要求"],
      ["AI伦理", "使用AI时关注真实、透明、公平、安全和责任归属"]
    ]
  },
  {
    id: "M10",
    name: "竞赛转化、路演与成果表达",
    competencies: ["申报书写作", "路演结构", "答辩应对", "证据链", "成果转化"],
    contexts: ["中国国际大学生创新大赛", "挑战杯创业计划竞赛", "挑战杯学术科技作品", "校赛决赛路演", "课程成果展示"],
    concepts: [
      ["路演", "用有限时间向评委或投资人清晰展示项目价值、证据和计划"],
      ["证据链", "支撑项目真实性、创新性、可行性和成效的数据与材料组合"],
      ["申报书", "系统说明项目背景、目标、方案、团队、进度和成果的文本材料"],
      ["答辩", "针对评委追问进行解释、澄清和补充证明的交流过程"],
      ["成果转化", "把课程项目、技术方案或研究成果推向应用、服务或商业化"]
    ]
  }
];

const singleStems = [
  "在{context}项目中，团队首先要把“{concept}”理解为哪一项？",
  "围绕{context}开展课程项目时，下列哪项最符合“{concept}”的课程要求？",
  "如果学生团队准备推进{context}，关于“{concept}”的正确做法是？",
  "教师要求学生用项目证据说明{context}，其中“{concept}”主要强调什么？",
  "在《创新创业基础》课堂中分析{context}，下列哪项最能体现“{concept}”？",
  "学生小组复盘{context}时，最应该把“{concept}”落实到哪一类行动？"
];

const multiStems = [
  "关于{context}项目中的“{concept}”，下列哪些做法是合理的？",
  "学生团队推进{context}时，若要体现“{concept}”，可以选择哪些行动？",
  "教师评价{context}项目时，能支持“{concept}”的证据包括哪些？",
  "围绕{context}开展项目训练，下列哪些属于“{concept}”相关的规范做法？"
];

const tfStems = [
  "在{context}项目中，{concept}只需要写在PPT里，不需要用访谈、数据或样品来证明。",
  "围绕{context}开展课程项目时，{concept}应尽量连接真实用户、真实场景和可验证证据。",
  "学生团队推进{context}时，只要想法新颖，就可以忽略{concept}相关的风险和约束。",
  "教师要求学生说明{context}项目的{concept}，有助于把课程知识转化为可执行任务。",
  "在《创新创业基础》课程中，{concept}可以帮助学生从单纯创意走向项目闭环。"
];

const plausibleActions = [
  "先访谈目标用户并记录真实任务",
  "用小样品或原型进行低成本验证",
  "用表格整理证据、结论和下一步行动",
  "明确谁使用、谁付费、谁受益",
  "用竞品对比说明差异化",
  "保留数据来源和引用出处",
  "把任务拆解到具体负责人和时间节点",
  "用反馈结果修订方案",
  "说明成本、收入和风险假设",
  "准备路演证据和答辩材料"
];

const distractors = [
  "只凭团队成员的主观判断直接定方案",
  "把网络资料复制到PPT中即可",
  "先大量采购设备，再考虑用户是否需要",
  "只追求页面美观，不解释项目价值",
  "忽略竞品和替代方案",
  "把AI输出当作最终事实，不再核验",
  "不做分工，全部任务交给组长",
  "只写宏大愿景，不给可执行步骤",
  "隐去数据来源以保持材料简洁",
  "把所有用户都定义为目标用户"
];

const trueExplains = [
  "该说法正确。课程项目强调真实情境、证据支撑和能力迁移，不能停留在口号。",
  "该说法正确。创新创业训练要把概念落实到用户、场景、数据、原型和复盘中。",
  "该说法正确。项目闭环需要目标、行动、证据、反馈和迭代共同支撑。"
];

const falseExplains = [
  "该说法错误。只写进PPT不能证明项目有效，仍需访谈、数据、样品、测试或应用证明。",
  "该说法错误。创意新颖不等于可行，仍要考虑用户需求、合规伦理、资源条件和商业闭环。",
  "该说法错误。课程评价重视过程证据和真实改进，不能只依赖主观判断。"
];

function pick(arr, index, offset = 0) {
  return arr[(index + offset) % arr.length];
}

function shuffleStable(arr, seed) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = (seed * 9301 + i * 49297 + 233280) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildSingle(module, localIndex, globalIndex) {
  const conceptPair = pick(module.concepts, localIndex);
  const context = pick(module.contexts, localIndex, 1);
  const [concept, definition] = conceptPair;
  const correct = definition;
  const wrongs = shuffleStable(distractors, globalIndex).slice(0, 3);
  const rawOptions = [correct, ...wrongs];
  const options = shuffleStable(rawOptions, globalIndex + 7);
  return {
    id: `${module.id}-S-${String(localIndex + 1).padStart(3, "0")}`,
    type: "single",
    moduleId: module.id,
    moduleName: module.name,
    stem: pick(singleStems, localIndex).replaceAll("{context}", context).replaceAll("{concept}", concept),
    options,
    answer: [options.indexOf(correct)],
    explanation: `本题考查${module.name}中的“${concept}”。${concept}强调${definition}，在${context}中应通过真实任务、数据或原型来验证，而不是停留在主观想象。`,
    difficulty: ["基础", "应用", "提高"][(localIndex + globalIndex) % 3],
    tags: [concept, pick(module.competencies, localIndex)]
  };
}

function buildMultiple(module, localIndex, globalIndex) {
  const conceptPair = pick(module.concepts, localIndex, 2);
  const context = pick(module.contexts, localIndex, 2);
  const [concept] = conceptPair;
  const correctActions = shuffleStable(plausibleActions, globalIndex).slice(0, 3);
  const wrongs = shuffleStable(distractors, globalIndex + 11).slice(0, 2);
  const rawOptions = [...correctActions, ...wrongs];
  const options = shuffleStable(rawOptions, globalIndex + 17);
  return {
    id: `${module.id}-M-${String(localIndex + 1).padStart(3, "0")}`,
    type: "multiple",
    moduleId: module.id,
    moduleName: module.name,
    stem: pick(multiStems, localIndex).replaceAll("{context}", context).replaceAll("{concept}", concept),
    options,
    answer: correctActions.map(item => options.indexOf(item)).sort((a, b) => a - b),
    explanation: `本题为多选题。围绕${context}落实“${concept}”，应选择能形成用户证据、任务闭环、可验证成果或规范表达的行动；只凭主观判断、复制资料或忽略风险的做法不符合课程要求。`,
    difficulty: ["基础", "应用", "提高"][(localIndex + 1) % 3],
    tags: [concept, pick(module.competencies, localIndex, 1)]
  };
}

function buildTrueFalse(module, localIndex, globalIndex) {
  const conceptPair = pick(module.concepts, localIndex, 3);
  const context = pick(module.contexts, localIndex, 3);
  const [concept] = conceptPair;
  const templateIndex = (localIndex + globalIndex) % tfStems.length;
  const isTrue = templateIndex === 1 || templateIndex === 3 || templateIndex === 4;
  return {
    id: `${module.id}-T-${String(localIndex + 1).padStart(3, "0")}`,
    type: "judge",
    moduleId: module.id,
    moduleName: module.name,
    stem: pick(tfStems, templateIndex).replaceAll("{context}", context).replaceAll("{concept}", concept),
    options: ["正确", "错误"],
    answer: [isTrue ? 0 : 1],
    explanation: isTrue
      ? `${pick(trueExplains, localIndex)}本题考查${concept}在${context}中的应用。`
      : `${pick(falseExplains, localIndex)}本题考查${concept}在${context}中的应用。`,
    difficulty: ["基础", "应用", "提高"][(localIndex + 2) % 3],
    tags: [concept, pick(module.competencies, localIndex, 2)]
  };
}

const questions = [];
let globalIndex = 0;
for (const module of modules) {
  for (let i = 0; i < 60; i++) questions.push(buildSingle(module, i, globalIndex++));
  for (let i = 0; i < 20; i++) questions.push(buildMultiple(module, i, globalIndex++));
  for (let i = 0; i < 20; i++) questions.push(buildTrueFalse(module, i, globalIndex++));
}

const typeCount = questions.reduce((acc, q) => {
  acc[q.type] = (acc[q.type] || 0) + 1;
  return acc;
}, {});

const moduleCount = modules.map(m => ({
  id: m.id,
  name: m.name,
  total: questions.filter(q => q.moduleId === m.id).length
}));

const payload = `window.QUESTION_META = ${JSON.stringify({ total: questions.length, typeCount, modules: moduleCount }, null, 2)};\nwindow.QUESTION_BANK = ${JSON.stringify(questions, null, 2)};\n`;
await import("node:fs/promises").then(fs => fs.writeFile(new URL("./questions.js", import.meta.url), payload, "utf8"));

console.log(`Generated ${questions.length} questions.`);
console.log(JSON.stringify(typeCount));

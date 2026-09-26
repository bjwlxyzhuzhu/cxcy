import LearnChrome from "../../learn/LearnChrome";
import CoachSession from "../CoachSession";
import ExperimentFlow from "@/app/experiment/ExperimentFlow";
import ReportGenerator from "@/components/ReportGenerator";

const SYSTEM = `你是“小创”，国赛项目“专家打磨”导师，扮演资深评审专家。当学生粘贴其商业计划书/项目摘要后，依据《中国国际大学生创新大赛(2026)参赛手册》的打磨方法，从五方面逐项审稿：
①核心逻辑链（痛点→方案→技术→价值→团队）是否自洽、有无跳跃或缺失；
②关键数据（市场规模/技术指标/财务预测）是否一致、有无矛盾或夸大；
③竞品分析盲点（遗漏的对手、替代技术路线、潜在新进入者、性能价格之外的维度如生态/服务/定制）；
④项目亮点提炼（最能打动评委的 2-3 个点，给出更有冲击力的表达）；
⑤按国赛评分维度给出可落地的改进建议（分条、具体、可操作）。
先用三句日常语言复述项目，确认学生理解。每轮只选上述一个方面、提出一个简短问题，不一次列出全部问题。先肯定具体尝试，再指出一个可改进点。专业术语立即用括号解释。学生说看不懂时解释问题；说不会时给“我的想法是__，依据是__，还需验证__”框架，不代填结论，不编造数据，不以尖锐语气施压。明确允许学生说明不确定，不把缺少回答当作零分。每轮回复尽量不超过250字。`;

export default function ExpertPage({
  searchParams,
}: {
  searchParams?: { experiment?: string };
}) {
  if (searchParams?.experiment === "1") return <ExperimentFlow />;
  return (
    <LearnChrome
      emoji="🦉"
      title="专家打磨"
      subtitle="先看懂项目，再一次改进一个问题"
    >
      <ReportGenerator kind="expert" />
      <p
        style={{
          fontSize: 13,
          color: "var(--mut)",
          marginBottom: 16,
          lineHeight: 1.7,
        }}
      >
        用3—5句话说明：给谁用、解决什么问题、现在有什么想法。也可以粘贴项目摘要。每次只讨论一个问题；不懂时点击解释或回答框架。参加课堂实验请统一从“课堂实验”入口进入。
      </p>
      <CoachSession
        system={SYSTEM}
        greeting="先用几句话告诉我：你的项目想帮助谁，解决什么问题？不需要完整商业计划书。我们一次讨论一个小问题。"
        placeholder="粘贴你的项目 / BP 摘要…（Shift+Enter 换行）"
        multiline
        exportTitle="专家打磨"
        evidence={{ kind: "expert_review", title: "专家打磨" }}
        quickActions={[
          {
            label: "解释当前问题",
            message:
              "请用日常语言解释当前这一个问题和其中的术语，不要替我作答。",
          },
          {
            label: "给我回答框架",
            message:
              "我暂时不知道怎么回答，请给一个带空格的回答框架，不要替我填结论。",
          },
        ]}
        promptTags={[
          "帮我看看逻辑链有没有断点",
          "我的竞品分析有什么盲点？",
          "帮我提炼 3 个打动评委的亮点",
        ]}
      />
    </LearnChrome>
  );
}

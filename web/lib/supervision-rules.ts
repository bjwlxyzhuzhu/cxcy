import { summarize, type ExpEvent } from "./experiment-protocol";
export type SupervisionSignal = {
  rule: string;
  title: string;
  evidence: string;
  advice: string;
};
/** 根据保存记录给教学支持提示，不把跳过、求助或完成率当作能力分数。 */
export function experimentSignals(
  events: ExpEvent[],
  closed: boolean,
): SupervisionSignal[] {
  const s = summarize(events);
  const out: SupervisionSignal[] = [];
  if (s.skipped)
    out.push({
      rule: "experiment_skipped",
      title: "有题目暂时跳过，建议安排一次解释与补练",
      evidence: `已记录${s.skipped}条跳过原因，${s.answers}条作答；跳过不计零分。`,
      advice:
        "先查看跳过题目和学生写的原因，选择其中一题解释关键词，再让学生用自己的话尝试。不要覆盖原始前后测。",
    });
  if (s.help >= 3)
    out.push({
      rule: "experiment_help",
      title: "学生多次求助，可以检查题意是否清楚",
      evidence: `本场实验已保存${s.help}条帮助内容。求助说明需要支持，不等于能力不足。`,
      advice:
        "查看求助集中在哪个步骤，用一个生活例子解释问题，再询问学生还卡在哪里。",
    });
  if (closed && events.length && (!s.pre || !s.post))
    out.push({
      rule: "experiment_missing",
      title: "本场实验已关闭，前后测存在缺项",
      evidence: `前测${s.pre ? "已提交" : "缺失"}，后测${s.post ? "已提交" : "缺失"}。当前无法形成完整配对。`,
      advice:
        "核对是否中途退出、网络异常或未理解说明。将原因写入教师备注，缺失保留为NA；不要补写成学生当时的答案。",
    });
  if (s.completed)
    out.push({
      rule: "experiment_review",
      title: "实验已完成，可以进行教学复盘",
      evidence: `前测${s.pre ? "已提交" : "缺失"}，后测${s.post ? "已提交" : "缺失"}；${s.answers}条作答、${s.skipped}条跳过。完成不代表能力提升。`,
      advice:
        "对照V0、V1和前后测原话，找出一处观点变化和一处仍需验证的信息，给学生一个具体的下一步建议。",
    });
  return out;
}

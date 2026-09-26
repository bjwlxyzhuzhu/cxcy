export const REWARDS = { daily: 30, reflection: 10 } as const;
export const REPORT_COST = 5;
export function reflectionProblem(content: unknown): string | null {
  if (
    typeof content !== "string" ||
    content.trim().length < 80 ||
    content.trim().length > 2000
  )
    return "请填写80—2000字的学习反思，包含所学、证据和下一步。";
  if (new Set(content.replace(/\s/g, "")).size < 20)
    return "请写下具体学习内容，不要重复字符凑字数。";
  return null;
}

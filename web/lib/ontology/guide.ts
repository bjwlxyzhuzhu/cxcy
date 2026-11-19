// 智能引导师 · 规则工具（前后端共用，纯函数）
//   · 现实验证自动预审：检查学生提交的验证过程是否写清“对象、方法、结果、数量”，给教师确认前参考（不替教师下结论）
//   · 干预卡起草：由项目卡点生成四段式督导卡草稿（一针见血 / 证据 / 怎么改 / 去哪练），教师修改后再发
//   硬约束：对事不对人（只评产出证据）、不表扬垫场、必配可执行方案。

export type PreReview = { ok: boolean; items: { key: string; label: string; hit: boolean }[]; missing: string[]; note: string };

const RULES: { key: string; label: string; re: RegExp }[] = [
  { key: "who", label: "问了谁 / 测了谁", re: /(用户|客户|老板|采购|负责人|班组长|学生|受访|工厂|商户|家长|老师|居民|团长|店主|员工|顾客|\d+\s*(位|名|个|家|人))/ },
  { key: "how", label: "怎么验证", re: /(访谈|问卷|实测|试用|测试|走访|回访|电话|观察|下单|订单|报价|签约|调查|实验|记录)/ },
  { key: "result", label: "结果如何", re: /(愿意|不愿意|同意|拒绝|降到|提升|下降|减少|增加|付费|续费|成交|结果|发现|反馈|表示|说)/ },
  { key: "number", label: "有具体数字", re: /\d|[一二两三四五六七八九十]+\s*(家|位|个|人|次|份|成)/ },
];

/** 预审学生提交的现实验证过程（规则判断，速度快、可解释；最终由教师确认） */
export function preReviewVerification(evidence: string): PreReview {
  const t = evidence || "";
  const items = RULES.map((r) => ({ key: r.key, label: r.label, hit: r.re.test(t) }));
  const missing = items.filter((i) => !i.hit).map((i) => i.label);
  const speculative = /(预计|打算|计划|准备|应该会|肯定会|如果)/.test(t);
  const ok = missing.length === 0 && !speculative;
  const note = ok ? "要素齐全，可重点核对真实性"
    : [missing.length ? `缺：${missing.join("、")}` : "", speculative ? "含计划或推测的说法，不是已经发生的结果" : ""].filter(Boolean).join("；");
  return { ok, items, missing, note };
}

export type CardDraft = { rule: string; sharp: string; evidence: string; advice: string; link_href: string; link_label: string };

/** 由项目卡点起草干预卡（教师可改） */
export function draftCardFromBlocker(b: { key: string; text: string; n: number }, projectName: string): CardDraft {
  const fact = `项目「${projectName}」当前有 ${b.n} ${b.text}。`;
  const base = { rule: `project:${b.key}`, evidence: fact };
  switch (b.key) {
    case "decision_no_evidence":
      return { ...base, sharp: "没有证据的决策只是表态，不是决策。", advice: "给每条决策挂上至少一条已认证的证据（访谈原话、问卷数据或实测结果）；找不到证据的决策，先回到现实中补调研。", link_href: "/apply/ontology", link_label: "去项目本体给决策挂证据" };
    case "glossary_conflict":
      return { ...base, sharp: "同一个词，队里有不同说法，数字就没法比。", advice: "打开术语口径，逐个对齐定义和计算方式，写清“怎么算”，团队确认后重新认证。", link_href: "/apply/ontology?tab=glossary", link_label: "去对齐术语口径" };
    case "stale_drafts":
      return { ...base, sharp: "AI 起草的草稿放着不认证，就不算你们的判断。", advice: "逐条核对草稿：对得上原文的认证，对不上的修改或驳回；每条不超过 2 分钟。", link_href: "/apply/ontology?filter=draft", link_label: "去认证草稿" };
    case "quote_missing":
      return { ...base, sharp: "有的“原话”在资料里找不到，不能当证据。", advice: "对照原始访谈记录，补上真实原话；查无此事的证据直接驳回。", link_href: "/apply/ontology?filter=draft", link_label: "去核实证据" };
    case "verifying":
      return { ...base, sharp: "现实验证已经提交，等教师确认。", advice: "确认前先自查：写清问了谁、怎么验证、结果和数字；不足的补充后再提交。", link_href: "/apply/arena", link_label: "去看假设看板" };
    default:
      return { ...base, sharp: `项目有 ${b.n} ${b.text}。`, advice: "回到项目工作台，按当前步骤的完成条件逐项补齐。", link_href: "/studio", link_label: "去项目工作台" };
  }
}

/** 没有卡点但进度停滞时的通用卡 */
export function draftCardForStep(step: number, label: string, doneWhen: string, projectName: string): CardDraft {
  return {
    rule: `project:step${step}`,
    sharp: `项目停在第 ${step} 步「${label}」。`,
    evidence: `项目「${projectName}」第 ${step} 步尚未达到完成条件：${doneWhen}。`,
    advice: `先点工作台里的“AI 起草本步”，再逐条核对认证；完成条件是：${doneWhen}。`,
    link_href: "/studio", link_label: "去项目工作台",
  };
}

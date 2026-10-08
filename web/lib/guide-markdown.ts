import { guideSections } from './user-guide';
import { guideExample, guideWalkthrough } from './guide-walkthrough';
export function guideMarkdown(base: string) {
  return '# 星创伙伴图文使用手册\n\n建议体验路线：登录 → 案例与模板 → 创业星舰 → 专家打磨 → 模拟答辩 → 成长复盘。\n\n## 虚拟演示材料\n\n' + guideExample + '\n\n' + guideSections.map((s,i) => {
    const w=guideWalkthrough[s.href];
    return `## ${i+1}. ${s.title}\n\n${s.body}\n\n${w.steps.map((v,j)=>`${j+1}. ${v}`).join('\n')}\n\n结果核对：${w.result}\n\n` + (w.image ? `![${w.caption}](${base}/guide/${w.image}.png)\n\n${w.caption}\n\n` : '') + `[打开对应页面](${base}${s.href})`;
  }).join('\n\n')+'\n';
}

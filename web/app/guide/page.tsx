"use client";
import LearnChrome from "@/app/learn/LearnChrome";
import { guideSections } from "@/lib/user-guide";
import { guideExample, guideWalkthrough } from "@/lib/guide-walkthrough";
import { guideMarkdown } from "@/lib/guide-markdown";
import { downloadMarkdown } from "@/lib/download";
import styles from './page.module.css';
export default function GuidePage() {
  return <LearnChrome emoji="📖" title="用户使用说明" subtitle="评委图文指引 · 从入门到复盘">
    <div className={styles.guide}>
      <section className="work-panel">
        <h2>第一次体验 从一个小项目开始</h2>
        <p>星创伙伴帮助学生从学习案例、整理方案，到接受专家建议、练习答辩，再回看自己的学习过程。教师可以围绕这些产出组织项目教学与复盘。</p>
        <p><strong>建议路线：</strong>登录 → 案例与模板 → 创业星舰 → 专家打磨 → 模拟答辩 → 成长复盘。</p>
        <p>本手册无需登录、不消耗积分。AI生成需要登录；测试账号请使用组织方单独提供的信息。图片展示实际界面，记录、余额及输出以当前账号为准。</p>
        <button className="resource-button" onClick={() => downloadMarkdown('星创伙伴图文使用手册.md',guideMarkdown(window.location.origin))}>下载图文手册</button>
        <p className={styles.note}>下载文件为Markdown，图片通过网站链接加载，查看图片需要联网。点击页面中的图片可在新标签页放大。</p>
        <nav aria-label="使用手册章节目录" className={styles.contents}>
          {guideSections.map((s,i)=><a key={s.title} href={`#guide-${i}`}>{i+1}. {s.title}</a>)}
        </nav>
      </section>
      <section className="work-panel">
        <h2>演示输入示例</h2>
        <p>可复制以下虚拟材料，分别用于创业星舰、专家报告和答辩准备；不需要上传真实学生隐私或未公开项目资料。</p>
        <textarea className={styles.example} aria-label="可复制的虚拟演示材料" readOnly value={guideExample} rows={5} onFocus={e=>e.currentTarget.select()} />
        <p><strong>观察重点：</strong>AI能否区分事实与假设，能否指出证据缺口，能否给出具体行动。生成文字不是实际教学成效证明。</p>
      </section>
      {guideSections.map((s,i)=>{const w=guideWalkthrough[s.href];return <section key={s.title} id={`guide-${i}`} className={`work-panel ${styles.section}`}>
        <h2>{i+1}. {s.title}</h2><p>{s.body}</p>
        <ol>{w.steps.map(step=><li key={step}>{step}</li>)}</ol>
        {w.image && <figure className={styles.figure}>
          <a href={`/guide/${w.image}.png`} target="_blank" rel="noopener noreferrer" aria-label={`放大图片：${s.title}（新标签页）`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/guide/${w.image}.png`} alt={w.caption || s.title} loading="lazy" />
          </a><figcaption>{w.caption}</figcaption>
        </figure>}
        <p><strong>结果核对：</strong>{w.result}</p>
        <div className={styles.links}><a href={s.href}>打开对应页面 →</a><a href="#guide-0">返回入门章节 ↑</a></div>
      </section>})}
    </div>
  </LearnChrome>;
}

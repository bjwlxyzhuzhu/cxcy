import test from 'node:test';
import assert from 'node:assert/strict';
import { wordBlob } from '../lib/word-document';
import { readDocxText } from '../lib/docx-text';
import { renderReport } from '../lib/report-export';
import { readFileSync } from 'node:fs';

test('专家Word导出回传可识别中文章节、表格和正文',async()=>{
  const blob=await wordBlob('专家打磨报告','# 项目诊断\n**校园预约**需要验证。\n## 行动清单\n1. 访谈用户\n| 指标 | 数值 |\n| --- | --- |\n| 访谈 | 12人 |','测试项目');
  const buffer=Buffer.from(await blob.arrayBuffer());
  assert.equal(buffer.subarray(0,2).toString(),'PK');
  const text=await readDocxText(buffer);
  for(const expected of ['专家打磨报告','项目诊断','校园预约','行动清单','访谈用户','12人'])assert.ok(text.includes(expected),expected);
});
test('损坏或仅改扩展名的DOCX提供可操作提示',async()=>{
  await assert.rejects(readDocxText(Buffer.from('<html>旧版Word</html>')),/另存为/);
});
test('测试记录导出的DOCX可回传提取全文',async()=>{
  const report=await renderReport({title:'专家打磨',metadata:{模块:'expert'},rows:[{正文:'项目诊断：需要补充用户证据。行动计划：访谈12人。'}]},'docx');
  const text=await readDocxText(report.data);
  assert.ok(text.includes('需要补充用户证据'));
  assert.ok(text.includes('访谈12人'));
});
test('DOCX解析库在生产依赖中',()=>{
  const pkg=JSON.parse(readFileSync('package.json','utf8'));
  assert.ok(pkg.dependencies.mammoth);
  assert.equal(pkg.devDependencies.mammoth,undefined);
});

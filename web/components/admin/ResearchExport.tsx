"use client";
import RecordExport from "@/components/RecordExport";
export default function ResearchExport() {
  return (
    <section
      style={{ padding: 20, border: "1px solid var(--line)", borderRadius: 14 }}
    >
      <h3>研究数据导出</h3>
      <p>
        导出已同意科研使用的账号和实验记录。使用固定研究编号，可跨次导出配对；同时保留分组、协议版本、学生原话、AI帮助和完成状态。未完成不是0分。
      </p>
      <p>
        姓名、学号及恢复码不进入结构化字段。自由文本中学生自行填写的身份信息仍需发布前复核。不同版本量表不能合并成统一总分。
      </p>
      <RecordExport
        endpoint="/api/admin/research-export"
        label="导出研究数据"
      />
    </section>
  );
}

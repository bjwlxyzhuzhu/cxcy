"use client";
import { useEffect, useState } from "react";
import RecordExport from "@/components/RecordExport";
export default function AllRecordsExport() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setAdmin(d.user?.role === "admin"))
      .catch(() => {});
  }, []);
  if (!admin) return null;
  return (
    <section
      style={{
        padding: 18,
        border: "1px solid var(--line)",
        borderRadius: 12,
        margin: "16px 0",
        lineHeight: 1.8,
      }}
    >
      <h3>全体教学测试数据（管理员）</h3>
      <p>
        收集所有账号的普通练习、课堂实验、历史方案/答辩及督导卡，不受当前列表分页或个人筛选限制。包含姓名学号，供教学管理使用；研究用途请使用单独的科研导出。
      </p>
      <p>
        实验按分组、前测、后测、配对、阶段用时分表，时间为北京时间；匿名实验保留固定编号。
      </p>
      <RecordExport
        endpoint="/api/admin/records/export"
        label="导出全体教学测试数据"
      />
    </section>
  );
}

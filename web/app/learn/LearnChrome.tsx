"use client";
import { ReactNode } from "react";
import AppShell from "@/components/AppShell";

/** 子页通用外壳：统一换成浅色、按角色导航的 AppShell（保留原参数，emoji 不再显示，界面更干净） */
export default function LearnChrome({ title, subtitle, children }: { emoji?: string; title: string; subtitle?: string; children: ReactNode; wide?: boolean }) {
  return <AppShell title={title} subtitle={subtitle}>{children}</AppShell>;
}

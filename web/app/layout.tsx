import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import "./reading.css";
import ReadingControls from "@/components/ReadingControls";
import DailyBonus from "@/components/DailyBonus";
import Presence from "@/components/Presence";

export const metadata: Metadata = {
  title: "双创AI星际 · 创赛智能搭子",
  description: "创新创业教育 × 比赛 × AI 工具应用 —— 一群懂创赛的智能搭子",
  icons: { icon: "/logo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" data-reading="on" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Script src="/runtime-config.js" strategy="beforeInteractive" />
        {children}
        <ReadingControls />
        <DailyBonus />
        <Presence />
      </body>
    </html>
  );
}

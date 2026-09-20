import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Overwatch Insight",
  description: "오버워치 승패 요인 분석기",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "예약 시스템",
  description: "노쇼를 예약 신용 점수로 관리하는 웹 예약 시스템",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-line bg-white py-5 text-center text-xs leading-5 text-sub">
          인하공업전문대학 컴퓨터정보공학과 S/W프로젝트
          <br />
          동시성 제어를 적용한 웹 기반 예약 관리 시스템 / 202044053 문정수
        </footer>
      </body>
    </html>
  );
}

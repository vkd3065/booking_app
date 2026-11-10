"use client";

import { useState } from "react";
import Admin from "./admin";
import Overview from "./overview";
import Members from "./members";
import PeakHours from "./peak";
import StatsView from "./stats";

type Resource = { id: number; name: string; open_hour: number; close_hour: number };

const TABS = ["판정", "예약 현황", "회원", "통계", "인기 시간대"] as const;
const TITLES: Record<(typeof TABS)[number], string> = {
  판정: "방문 / 노쇼 판정",
  "예약 현황": "날짜별 예약 현황",
  회원: "회원 점수 조회",
  통계: "예약 통계",
  "인기 시간대": "인기 시간대 설정",
};

export default function Tabs({ resources }: { resources: Resource[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("판정");

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[180px_1fr]">
      <nav className="flex overflow-x-auto border border-line bg-white lg:block">
        <p className="hidden border-b-2 border-ink px-4 py-3 font-bold lg:block">관리자 메뉴</p>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 px-4 py-3 text-left text-sm lg:block lg:w-full lg:border-b lg:border-[#eceef0] ${
              tab === t ? "bg-pine font-bold text-white" : "hover:bg-wash"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>
      <section className="box min-w-0">
        <h2 className="tit">{TITLES[tab]}</h2>
        {tab === "판정" && <Admin />}
        {tab === "예약 현황" && <Overview resources={resources} />}
        {tab === "회원" && <Members />}
        {tab === "통계" && <StatsView />}
        {tab === "인기 시간대" && <PeakHours resources={resources} />}
      </section>
    </div>
  );
}

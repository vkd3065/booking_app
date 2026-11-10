"use client";

import { useState } from "react";
import Admin from "./admin";
import Overview from "./overview";
import Members from "./members";
import PeakHours from "./peak";
import StatsView from "./stats";

type Resource = { id: number; name: string; open_hour: number; close_hour: number };

const TABS = ["판정", "예약 현황", "회원", "통계", "인기 시간대"] as const;

export default function Tabs({ resources }: { resources: Resource[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("판정");

  return (
    <>
      <nav className="mt-6 flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              tab === t ? "border-gray-900 font-semibold" : "border-transparent text-gray-500"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>
      {tab === "판정" && <Admin />}
      {tab === "예약 현황" && <Overview resources={resources} />}
      {tab === "회원" && <Members />}
      {tab === "통계" && <StatsView />}
      {tab === "인기 시간대" && <PeakHours resources={resources} />}
    </>
  );
}

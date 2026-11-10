"use client";

import { useState } from "react";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

// 월 달력: days(예약할 수 있는 날짜들)에 있는 날만 누를 수 있음
export default function Calendar({
  days,
  day,
  onPick,
}: {
  days: string[]; // "2026-11-10" 형식
  day: string;
  onPick: (d: string) => void;
}) {
  const today = days[0];
  const months = Array.from(new Set(days.map((d) => d.slice(0, 7))));
  const [month, setMonth] = useState(day.slice(0, 7));
  const idx = Math.max(0, months.indexOf(month));
  const [y, m] = months[idx].split("-").map(Number);

  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 1일의 요일
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 말일
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: last }, (_, i) => i + 1)];

  return (
    <div className="num">
      <div className="flex items-center justify-between">
        <button
          className="btn px-2 py-0.5"
          disabled={idx === 0}
          onClick={() => setMonth(months[idx - 1])}
          aria-label="이전 달"
        >
          &lt;
        </button>
        <strong className="text-base">
          {y}년 {m}월
        </strong>
        <button
          className="btn px-2 py-0.5"
          disabled={idx === months.length - 1}
          onClick={() => setMonth(months[idx + 1])}
          aria-label="다음 달"
        >
          &gt;
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 text-center text-xs">
        {WEEK.map((w, i) => (
          <span key={w} className={`pb-1.5 ${i === 0 ? "text-stop" : i === 6 ? "text-top" : "text-sub"}`}>
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <span key={`e${i}`} />;
          const date = `${months[idx]}-${String(d).padStart(2, "0")}`;
          const ok = days.includes(date);
          const dow = i % 7;
          const picked = date === day;
          return (
            <button
              key={date}
              disabled={!ok}
              onClick={() => onPick(date)}
              className={`m-px h-9 text-sm ${
                picked
                  ? "bg-pine font-bold text-white"
                  : !ok
                  ? "text-[#c3c7cc]"
                  : `hover:bg-pine-wash ${dow === 0 ? "text-stop" : dow === 6 ? "text-top" : ""} ${
                      date === today ? "font-bold outline outline-1 -outline-offset-1 outline-ink" : ""
                    }`
              }`}
            >
              {d}
            </button>
          );
        })}
      </div>

      <p className="mt-2 flex gap-3 text-xs text-sub">
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 outline outline-1 -outline-offset-1 outline-ink" /> 오늘
        </span>
        <span className="flex items-center gap-1">
          <i className="inline-block h-3 w-3 bg-pine" /> 선택
        </span>
        <span className="text-[#b3b8be]">회색 날짜는 예약 불가</span>
      </p>
    </div>
  );
}

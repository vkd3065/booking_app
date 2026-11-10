"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = { count: number; no_show: number };
type Stats = {
  total: number;
  done: number;
  no_show: number;
  canceled: number;
  late: number;
  pending: number;
  by_hour: (Row & { hour: number })[];
  by_weekday: (Row & { weekday: number })[];
  grades: Record<string, number>;
};

const PERIODS = [
  { days: 7, label: "최근 7일" },
  { days: 30, label: "최근 30일" },
  { days: 0, label: "전체" },
];
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function pct(a: number, b: number) {
  return b === 0 ? "-" : `${Math.round((a / b) * 100)}%`;
}

// 막대 한 줄: 전체 예약 수 막대 + 그중 노쇼 부분은 빨간색
function Bar({ label, row, max }: { label: string; row: Row; max: number }) {
  const w = max === 0 ? 0 : (row.count / max) * 100;
  const nw = row.count === 0 ? 0 : (row.no_show / row.count) * 100;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-12 shrink-0 text-right text-gray-500">{label}</span>
      <div className="h-5 flex-1 rounded bg-gray-50">
        <div className="flex h-5 overflow-hidden rounded bg-blue-200" style={{ width: `${w}%` }}>
          <div className="ml-auto h-5 bg-red-400" style={{ width: `${nw}%` }} />
        </div>
      </div>
      <span className="w-24 shrink-0 text-xs text-gray-600">
        {row.count}건{row.no_show > 0 && `, 노쇼 ${row.no_show}`}
      </span>
    </div>
  );
}

// 관리자 통계 (A3)
export default function StatsView() {
  const supabase = useMemo(() => createClient(), []);
  const [days, setDays] = useState(30);
  const [s, setS] = useState<Stats | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_stats", { p_days: days });
    if (error) setErr(error.message);
    else setS(data as Stats);
  }, [supabase, days]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  if (err) return <p className="mt-6 text-sm text-red-600">통계를 불러오지 못했습니다: {err}</p>;
  if (!s) return <p className="mt-6 text-sm text-gray-500">불러오는 중...</p>;

  const judged = s.done + s.no_show; // 판정이 끝난 예약
  const hourMax = Math.max(0, ...s.by_hour.map((r) => r.count));
  const dayMax = Math.max(0, ...s.by_weekday.map((r) => r.count));

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            onClick={() => setDays(p.days)}
            className={`rounded border px-3 py-1 text-sm ${p.days === days ? "bg-gray-900 text-white" : ""}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-gray-500">시작 시각이 지난 예약 기준</p>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Card title="노쇼율" value={pct(s.no_show, judged)} sub={`노쇼 ${s.no_show} / 판정 ${judged}건`} red />
        <Card title="방문" value={`${s.done}건`} sub={`판정 대기 ${s.pending}건`} />
        <Card title="늦은 취소" value={`${s.late}건`} sub={`일반 취소 ${s.canceled}건`} />
        <Card title="전체 예약" value={`${s.total}건`} sub="취소 포함" />
      </div>

      <h3 className="mt-6 text-sm font-semibold">시간대별 예약 (빨간색 = 노쇼)</h3>
      <div className="mt-2 space-y-1">
        {s.by_hour.length === 0 && <p className="text-sm text-gray-500">기록이 없습니다.</p>}
        {s.by_hour.map((r) => (
          <Bar key={r.hour} label={`${r.hour}시`} row={r} max={hourMax} />
        ))}
      </div>

      <h3 className="mt-6 text-sm font-semibold">요일별 예약</h3>
      <div className="mt-2 space-y-1">
        {s.by_weekday.length === 0 && <p className="text-sm text-gray-500">기록이 없습니다.</p>}
        {s.by_weekday.map((r) => (
          <Bar key={r.weekday} label={WEEKDAYS[r.weekday]} row={r} max={dayMax} />
        ))}
      </div>

      <h3 className="mt-6 text-sm font-semibold">등급별 회원 (현재)</h3>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        {["우수", "일반", "주의", "제한"].map((g) => (
          <span key={g} className="rounded border border-gray-200 px-3 py-1">
            {g} {s.grades[g] ?? 0}명
          </span>
        ))}
      </div>
    </div>
  );
}

function Card({ title, value, sub, red }: { title: string; value: string; sub: string; red?: boolean }) {
  return (
    <div className="rounded border border-gray-200 px-3 py-2">
      <p className="text-xs text-gray-500">{title}</p>
      <p className={`text-xl font-semibold ${red ? "text-red-600" : ""}`}>{value}</p>
      <p className="text-xs text-gray-500">{sub}</p>
    </div>
  );
}

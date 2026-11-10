"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { GRADE_TEXT } from "../score-ruler";

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
    <div className="num flex items-center gap-2 text-sm">
      <span className="w-12 shrink-0 text-right text-sub">{label}</span>
      <div className="h-4 flex-1 bg-wash">
        <div className="flex h-4 overflow-hidden bg-pine/35" style={{ width: `${w}%` }}>
          <div className="ml-auto h-4 bg-stop" style={{ width: `${nw}%` }} />
        </div>
      </div>
      <span className="w-24 shrink-0 text-xs text-sub">
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

  if (err) return <p className="mt-6 text-sm text-stop">통계를 불러오지 못했습니다: {err}</p>;
  if (!s) return <p className="mt-6 text-sm text-sub">불러오는 중...</p>;

  const judged = s.done + s.no_show; // 판정이 끝난 예약
  const hourMax = Math.max(0, ...s.by_hour.map((r) => r.count));
  const dayMax = Math.max(0, ...s.by_weekday.map((r) => r.count));

  return (
    <div>
      <div className="seg pl-px">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            aria-pressed={p.days === days}
            onClick={() => setDays(p.days)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-sub">※ 시작 시각이 지난 예약 기준입니다. 막대의 빨간 부분이 노쇼입니다.</p>

      <div className="num mt-4 flex flex-wrap items-end gap-x-10 gap-y-4 border-y border-line py-4">
        <div>
          <p className="text-xs text-sub">노쇼율</p>
          <p className="text-4xl font-bold text-stop">{pct(s.no_show, judged)}</p>
          <p className="text-xs text-sub">
            판정 {judged}건 중 노쇼 {s.no_show}건
          </p>
        </div>
        <dl className="grid grid-cols-4 gap-x-8 text-sm">
          {[
            ["방문", s.done],
            ["늦은 취소", s.late],
            ["일반 취소", s.canceled],
            ["판정 대기", s.pending],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-sub">{k}</dt>
              <dd className="text-lg font-semibold">{v}건</dd>
            </div>
          ))}
        </dl>
      </div>

      <h3 className="mt-7 font-bold">시간대별 예약</h3>
      <div className="mt-2 space-y-1">
        {s.by_hour.length === 0 && <p className="text-sm text-sub">기록이 없습니다.</p>}
        {s.by_hour.map((r) => (
          <Bar key={r.hour} label={`${r.hour}시`} row={r} max={hourMax} />
        ))}
      </div>

      <h3 className="mt-7 font-bold">요일별 예약</h3>
      <div className="mt-2 space-y-1">
        {s.by_weekday.length === 0 && <p className="text-sm text-sub">기록이 없습니다.</p>}
        {s.by_weekday.map((r) => (
          <Bar key={r.weekday} label={WEEKDAYS[r.weekday]} row={r} max={dayMax} />
        ))}
      </div>

      <h3 className="mt-7 font-bold">등급별 회원 (현재)</h3>
      <div className="num mt-2 text-sm">
        {["우수", "일반", "주의", "제한"].map((g) => (
          <span key={g} className="mr-6">
            <span className={`font-semibold ${GRADE_TEXT[g]}`}>{g}</span> {s.grades[g] ?? 0}명
          </span>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Resource = { id: number; name: string; open_hour: number; close_hour: number };
type Row = {
  id: number;
  slot: string;
  status: string;
  resource_id: number;
  profiles: { name: string | null; score: number } | null;
};

const STATUS: Record<string, { text: string; cls: string }> = {
  booked: { text: "예약됨", cls: "bg-pine-wash text-pine-deep" },
  done: { text: "방문", cls: "bg-top-wash text-top" },
  no_show: { text: "노쇼", cls: "bg-stop-wash text-stop" },
  canceled: { text: "취소", cls: "bg-wash text-sub" },
  canceled_late: { text: "늦은 취소", cls: "bg-warn-wash text-warn" },
};

function kstDate(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}
function addDays(day: string, n: number) {
  return kstDate(new Date(new Date(day + "T12:00:00+09:00").getTime() + n * 86400000));
}
function hourOf(slot: string) {
  return Number(new Date(slot).toLocaleString("en-US", { timeZone: "Asia/Seoul", hour: "numeric", hour12: false }));
}

// 날짜별 전체 예약 현황 (자원 x 시간)
export default function Overview({ resources }: { resources: Resource[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [day, setDay] = useState(() => kstDate(new Date()));
  const [rows, setRows] = useState<Row[]>([]);
  const [showCanceled, setShowCanceled] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("reservations")
      .select("id, slot, status, resource_id, profiles(name, score)")
      .gte("slot", `${day}T00:00:00+09:00`)
      .lt("slot", `${addDays(day, 1)}T00:00:00+09:00`)
      .order("slot");
    setRows((data as unknown as Row[]) ?? []);
  }, [supabase, day]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const visible = rows.filter((r) => showCanceled || !r.status.startsWith("canceled"));
  const open = Math.min(...resources.map((r) => r.open_hour));
  const close = Math.max(...resources.map((r) => r.close_hour));
  const hours = resources.length ? Array.from({ length: close - open }, (_, i) => open + i) : [];
  const count = (s: string) => rows.filter((r) => r.status === s).length;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setDay(addDays(day, -1))} className="btn px-2.5 py-1">
          &lt;
        </button>
        <input
          type="date"
          value={day}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          className="field px-2 py-1 text-sm"
        />
        <button onClick={() => setDay(addDays(day, 1))} className="btn px-2.5 py-1">
          &gt;
        </button>
        <button onClick={() => setDay(kstDate(new Date()))} className="btn px-2.5 py-1">
          오늘
        </button>
        <label className="ml-auto flex items-center gap-1 text-sm text-sub">
          <input type="checkbox" checked={showCanceled} onChange={(e) => setShowCanceled(e.target.checked)} />
          취소 포함
        </label>
      </div>

      <p className="mt-2 text-sm text-sub">
        예약됨 {count("booked")}건, 방문 {count("done")}건, 노쇼 {count("no_show")}건, 취소{" "}
        {count("canceled") + count("canceled_late")}건
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="list num min-w-max">
          <thead>
            <tr>
              <th className="w-16 !text-center">시간</th>
              {resources.map((r) => (
                <th key={r.id} className="border-l border-line">
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h}>
                <td className="text-center text-sub">{h}:00</td>
                {resources.map((res) => {
                  const cell = visible.filter((r) => r.resource_id === res.id && hourOf(r.slot) === h);
                  const closed = h < res.open_hour || h >= res.close_hour;
                  return (
                    <td key={res.id} className={`border-l border-line !py-1 align-top ${closed ? "bg-wash" : ""}`}>
                      {cell.map((r) => (
                        <div key={r.id} className={`flex justify-between gap-2 px-2 py-1 ${STATUS[r.status]?.cls}`}>
                          <span>
                            {r.profiles?.name ?? "회원"} <span className="text-xs opacity-70">{r.profiles?.score}점</span>
                          </span>
                          <span className="text-xs font-semibold">{STATUS[r.status]?.text}</span>
                        </div>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

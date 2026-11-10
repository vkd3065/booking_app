"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Resource = { id: number; name: string; open_hour: number; close_hour: number };
type Peak = { weekday: number; hour: number };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 인기 시간대 설정 (칸을 누르면 지정/해제)
export default function PeakHours({ resources }: { resources: Resource[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [resourceId, setResourceId] = useState(resources[0]?.id ?? 0);
  const [peaks, setPeaks] = useState<Peak[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const resource = resources.find((r) => r.id === resourceId);
  const hours = resource
    ? Array.from({ length: resource.close_hour - resource.open_hour }, (_, i) => resource.open_hour + i)
    : [];

  const load = useCallback(async () => {
    if (!resourceId) return;
    const { data } = await supabase
      .from("peak_hours")
      .select("weekday, hour")
      .eq("resource_id", resourceId);
    setPeaks(data ?? []);
  }, [supabase, resourceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isPeak = (w: number, h: number) => peaks.some((p) => p.weekday === w && p.hour === h);

  async function toggle(w: number, h: number) {
    setBusy(true);
    const { error } = isPeak(w, h)
      ? await supabase.from("peak_hours").delete().match({ resource_id: resourceId, weekday: w, hour: h })
      : await supabase.from("peak_hours").insert({ resource_id: resourceId, weekday: w, hour: h });
    setBusy(false);
    if (error) {
      setMsg("실패: " + error.message);
      setTimeout(() => setMsg(""), 3000);
    }
    load();
  }

  return (
    <div>
      <p className="text-xs leading-5 text-sub">
        ※ 칸을 누르면 인기 시간대로 지정되고, 다시 누르면 해제됩니다.
        <br />※ 주의 등급 회원은 인기 시간대를 예약할 수 없습니다.
      </p>

      <div className="seg mt-3 pl-px">
        {resources.map((r) => (
          <button
            key={r.id}
            aria-pressed={r.id === resourceId}
            onClick={() => setResourceId(r.id)}
          >
            {r.name}
          </button>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="num text-center text-xs">
          <thead>
            <tr>
              <th className="px-1"></th>
              {WEEKDAYS.map((w) => (
                <th key={w} className="w-10 px-1 py-1 font-normal">
                  {w}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {hours.map((h) => (
              <tr key={h}>
                <td className="pr-2 text-right text-sub">{h}:00</td>
                {WEEKDAYS.map((_, w) => (
                  <td key={w} className="p-0.5">
                    <button
                      disabled={busy}
                      onClick={() => toggle(w, h)}
                      className={`h-7 w-11 border text-[11px] font-semibold ${
                        isPeak(w, h) ? "border-warn bg-warn-wash text-warn" : "border-line hover:border-sub"
                      }`}
                    >
                      {isPeak(w, h) ? "인기" : ""}
                    </button>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {msg && <p className="mt-2 text-sm text-stop">{msg}</p>}
    </div>
  );
}

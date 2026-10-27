"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: number;
  slot: string;
  status: string;
  score_delta: number;
  profiles: { name: string | null; score: number } | null;
  resources: { name: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  done: "방문",
  no_show: "노쇼",
};

// 노쇼 기준: 예약 시각 15분 경과까지 미방문
const NO_SHOW_MINUTES = 15;

function label(slot: string) {
  return new Date(slot).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
  });
}

export default function Admin() {
  const supabase = useMemo(() => createClient(), []);
  const [pending, setPending] = useState<Row[]>([]);
  const [decided, setDecided] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  // 30초마다 현재 시간 갱신 (경과 시간 표시용)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const cols = "id, slot, status, score_delta, profiles(name, score), resources(name)";
    // 판정 대기: 시작 시각이 지난 예약
    const { data: a } = await supabase
      .from("reservations")
      .select(cols)
      .eq("status", "booked")
      .lte("slot", new Date().toISOString())
      .order("slot");
    // 최근 판정
    const { data: b } = await supabase
      .from("reservations")
      .select(cols)
      .in("status", ["done", "no_show"])
      .order("slot", { ascending: false })
      .limit(20);
    setPending((a as unknown as Row[]) ?? []);
    setDecided((b as unknown as Row[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function run(fn: string, id: number, done: string) {
    setBusy(true);
    const { error } = await supabase.rpc(fn, { p_id: id });
    setBusy(false);
    setMsg(error ? "실패: " + error.message : done);
    setTimeout(() => setMsg(""), 3000);
    load();
  }

  return (
    <div className="mt-6">
      <h2 className="font-semibold">판정 대기 (시작 시각이 지난 예약)</h2>
      <p className="mt-1 text-xs text-gray-500">
        방문 +5점 / 노쇼 −30점 (예약 시각 15분 경과까지 미방문이면 노쇼)
      </p>
      {pending.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">판정할 예약이 없습니다.</p>
      ) : (
        <ul className="mt-2 divide-y rounded border">
          {pending.map((r) => {
            const passed = Math.floor((now - new Date(r.slot).getTime()) / 60000);
            const canNoShow = passed >= NO_SHOW_MINUTES;
            return (
            <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {label(r.slot)} / {r.resources?.name} / {r.profiles?.name ?? "회원"} (점수{" "}
                {r.profiles?.score})
                <span className="ml-2 text-xs text-gray-500">
                  {passed < 60 ? `${passed}분 경과` : `${Math.floor(passed / 60)}시간 경과`}
                  {!canNoShow && `, ${NO_SHOW_MINUTES - passed}분 뒤 노쇼 판정 가능`}
                </span>
              </span>
              <span className="flex gap-2">
                <button
                  disabled={busy}
                  className="rounded border px-2 py-1"
                  onClick={() => run("mark_visit", r.id, "방문으로 처리했습니다. (+5점)")}
                >
                  방문
                </button>
                <button
                  disabled={busy || !canNoShow}
                  className="rounded border border-red-300 px-2 py-1 text-red-600 disabled:opacity-40"
                  onClick={() => {
                    if (!confirm(`${r.profiles?.name ?? "회원"} 님 ${label(r.slot)} 예약을 노쇼로 처리할까요?\n신용 점수가 30점 깎여요.`)) return;
                    run("mark_no_show", r.id, "노쇼로 처리했습니다. (−30점)");
                  }}
                >
                  노쇼
                </button>
              </span>
            </li>
            );
          })}
        </ul>
      )}

      <h2 className="mt-8 font-semibold">최근 판정</h2>
      {decided.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">판정한 예약이 없습니다.</p>
      ) : (
        <ul className="mt-2 divide-y rounded border">
          {decided.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {label(r.slot)} / {r.resources?.name} / {r.profiles?.name ?? "회원"} /{" "}
                {STATUS_LABEL[r.status]} ({r.score_delta > 0 ? "+" : ""}
                {r.score_delta}점)
              </span>
              <button
                disabled={busy}
                className="text-gray-600 underline"
                onClick={() => run("undo_decision", r.id, "판정을 취소하고 점수를 되돌렸습니다.")}
              >
                판정 취소
              </button>
            </li>
          ))}
        </ul>
      )}

      {msg && (
        <div className="fixed bottom-6 left-1/2 w-max max-w-[90vw] -translate-x-1/2 rounded bg-gray-900 px-4 py-3 text-sm text-white shadow">
          {msg}
        </div>
      )}
    </div>
  );
}

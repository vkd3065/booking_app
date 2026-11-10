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
    <div>
      <h3 className="font-bold">판정 대기 <span className="num text-pine">{pending.length}</span></h3>
      <p className="mt-1 text-xs text-sub">
        ※ 시작 시각이 지난 예약입니다. 방문 +5점, 노쇼 −30점 (노쇼는 예약 시각 15분 경과 후 판정)
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="list num">
          <thead>
            <tr>
              <th>예약 시각</th>
              <th>대상</th>
              <th>회원</th>
              <th>점수</th>
              <th>경과</th>
              <th className="w-36">판정</th>
            </tr>
          </thead>
          <tbody>
            {pending.length === 0 && (
              <tr>
                <td colSpan={6} className="!py-8 text-center text-sub">
                  판정할 예약이 없습니다.
                </td>
              </tr>
            )}
            {pending.map((r) => {
              const passed = Math.floor((now - new Date(r.slot).getTime()) / 60000);
              const canNoShow = passed >= NO_SHOW_MINUTES;
              return (
                <tr key={r.id}>
                  <td>{label(r.slot)}</td>
                  <td>{r.resources?.name}</td>
                  <td>{r.profiles?.name ?? "회원"}</td>
                  <td>{r.profiles?.score}</td>
                  <td className="text-sub">
                    {passed < 60 ? `${passed}분` : `${Math.floor(passed / 60)}시간`}
                    {!canNoShow && <span className="block text-xs">{NO_SHOW_MINUTES - passed}분 뒤 노쇼 가능</span>}
                  </td>
                  <td>
                    <span className="flex gap-1.5">
                      <button
                        disabled={busy}
                        className="btn btn-main"
                        onClick={() => run("mark_visit", r.id, "방문으로 처리했습니다. (+5점)")}
                      >
                        방문
                      </button>
                      <button
                        disabled={busy || !canNoShow}
                        className="btn enabled:border-stop enabled:text-stop"
                        onClick={() => {
                          if (!confirm(`${r.profiles?.name ?? "회원"} 님 ${label(r.slot)} 예약을 노쇼로 처리하시겠습니까?\n신용 점수 30점이 차감됩니다.`)) return;
                          run("mark_no_show", r.id, "노쇼로 처리했습니다. (−30점)");
                        }}
                      >
                        노쇼
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="mt-8 font-bold">최근 판정</h3>
      <div className="mt-2 overflow-x-auto">
        <table className="list num">
          <thead>
            <tr>
              <th>예약 시각</th>
              <th>대상</th>
              <th>회원</th>
              <th>판정</th>
              <th>반영 점수</th>
              <th className="w-28">취소</th>
            </tr>
          </thead>
          <tbody>
            {decided.length === 0 && (
              <tr>
                <td colSpan={6} className="!py-8 text-center text-sub">
                  판정한 예약이 없습니다.
                </td>
              </tr>
            )}
            {decided.map((r) => (
              <tr key={r.id}>
                <td>{label(r.slot)}</td>
                <td>{r.resources?.name}</td>
                <td>{r.profiles?.name ?? "회원"}</td>
                <td className={r.status === "no_show" ? "font-semibold text-stop" : "font-semibold text-pine"}>
                  {STATUS_LABEL[r.status]}
                </td>
                <td>
                  {r.score_delta > 0 ? "+" : ""}
                  {r.score_delta}점
                </td>
                <td>
                  <button
                    disabled={busy}
                    className="btn"
                    onClick={() => run("undo_decision", r.id, "판정을 취소하고 점수를 되돌렸습니다.")}
                  >
                    판정 취소
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {msg && (
        <div className="fixed bottom-6 left-1/2 w-max max-w-[90vw] -translate-x-1/2 bg-ink px-5 py-3 text-sm text-white shadow-lg">
          {msg}
        </div>
      )}
    </div>
  );
}

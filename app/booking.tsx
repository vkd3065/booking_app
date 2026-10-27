"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { gradeOf } from "@/lib/grade";

type Resource = { id: number; name: string; open_hour: number; close_hour: number };
type MyReservation = { id: number; slot: string; resource_id: number };

// 내가 보낸 알림 구분용
const TAB_ID = Math.random().toString(36).slice(2);

// 한국 날짜 (YYYY-MM-DD)
function kstDate(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}
function slotOf(day: string, hour: number) {
  return `${day}T${String(hour).padStart(2, "0")}:00:00+09:00`;
}
function sameTime(a: string, b: string) {
  return new Date(a).getTime() === new Date(b).getTime();
}
function label(slot: string) {
  return new Date(slot).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
  });
}

const ERRORS: Record<string, string> = {
  SLOT_TAKEN: "방금 다른 분이 먼저 예약했어요. 다른 시간을 골라 주세요.",
  PAST_SLOT: "이미 지난 시간입니다.",
  CLOSED_HOUR: "운영 시간이 아닙니다.",
  BAD_SLOT: "잘못된 시간입니다.",
  NO_RESOURCE: "예약할 수 없는 대상입니다.",
  LOGIN_REQUIRED: "다시 로그인해 주세요.",
  CANNOT_CANCEL: "취소할 수 없는 예약입니다.",
  TOO_FAR: "등급 기준 예약 가능 기간을 넘는 시간입니다.",
  LIMIT_RESERVATIONS: "동시에 잡을 수 있는 예약 수를 모두 쓰고 있어요.",
  SUSPENDED: "점수가 낮아 예약이 제한된 상태입니다.",
};
function toMessage(raw: string) {
  const key = Object.keys(ERRORS).find((k) => raw.includes(k));
  return key ? ERRORS[key] : "오류가 발생했습니다: " + raw;
}

export default function Booking({
  resources,
  score,
  suspendedUntil,
}: {
  resources: Resource[];
  score: number;
  suspendedUntil: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const grade = gradeOf(score);
  // 1분마다 현재 시간 갱신
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const days = useMemo(
    () =>
      Array.from({ length: grade.days }, (_, i) => kstDate(new Date(now + i * 86400000))),
    [now, grade.days]
  );

  const [resourceId, setResourceId] = useState(resources[0]?.id ?? 0);
  const [day, setDay] = useState(days[0]);
  const [taken, setTaken] = useState<string[]>([]);
  const [mine, setMine] = useState<MyReservation[]>([]);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const resource = resources.find((r) => r.id === resourceId);

  const showToast = useCallback((text: string, ok = false) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // 예약된 시간
  const loadTaken = useCallback(async () => {
    if (!resourceId) return;
    const { data } = await supabase.rpc("get_taken_slots", {
      p_resource_id: resourceId,
      p_day: day,
    });
    setTaken((data as string[] | null) ?? []);
  }, [supabase, resourceId, day]);

  // 내 예약
  const loadMine = useCallback(async () => {
    const { data } = await supabase
      .from("reservations")
      .select("id, slot, resource_id")
      .eq("status", "booked")
      .gt("slot", new Date().toISOString())
      .order("slot");
    setMine(data ?? []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadTaken();
  }, [loadTaken]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMine();
  }, [loadMine]);

  // 다른 사람이 예약/취소하면 갱신
  useEffect(() => {
    const channel = supabase
      .channel(`slots-${resourceId}`)
      .on("broadcast", { event: "changed" }, ({ payload }) => {
        if (payload?.from === TAB_ID) return;
        loadTaken();
        // 보고 있는 날짜면 알림
        if (payload?.type === "booked" && kstDate(new Date(payload.slot)) === day) {
          showToast(`${label(payload.slot)}가 방금 다른 분에게 예약되었습니다.`);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, resourceId, day, loadTaken, showToast]);

  async function book(slot: string) {
    setBusySlot(slot);
    const { error } = await supabase.rpc("book_slot", {
      p_resource_id: resourceId,
      p_slot: slot,
    });
    setBusySlot(null);
    if (error) {
      showToast(toMessage(error.message));
    } else {
      showToast(`${label(slot)} 예약 완료`, true);
      supabase.channel(`slots-${resourceId}`).httpSend("changed", { type: "booked", slot, from: TAB_ID });
    }
    loadTaken();
    loadMine();
  }

  async function cancel(r: MyReservation) {
    // 무료 취소 마감이 지났으면 -15점 경고
    const late = now > new Date(r.slot).getTime() - grade.cancelHours * 3600000;
    const msg = late
      ? `${label(r.slot)} 예약은 무료 취소 마감(${grade.cancelHours}시간 전)이 지났어요.\n지금 취소하면 신용 점수가 15점 깎여요. 그래도 취소할까요?`
      : `${label(r.slot)} 예약을 취소할까요?`;
    if (!confirm(msg)) return;
    const { error } = await supabase.rpc("cancel_booking", { p_id: r.id });
    if (error) {
      showToast(toMessage(error.message));
    } else {
      showToast("취소했습니다.", true);
      await supabase.channel(`slots-${r.resource_id}`).httpSend("changed", { type: "canceled", slot: r.slot, from: TAB_ID });
      router.refresh();
    }
    loadTaken();
    loadMine();
  }

  // 예약 제한 상태 (점수 50 미만)
  const suspended = grade.max === 0;
  const suspendedDay = suspendedUntil
    ? new Date(suspendedUntil).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" })
    : null;

  const hours = resource
    ? Array.from(
        { length: resource.close_hour - resource.open_hour },
        (_, i) => resource.open_hour + i
      )
    : [];

  return (
    <div className="mt-6">
      {/* 등급 안내 */}
      {suspended ? (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          신용 점수가 50점 미만이라 새 예약이 제한된 상태입니다.
          {suspendedDay && ` ${suspendedDay}부터 다시 예약할 수 있어요.`}
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          {grade.name} 등급: {grade.days}일 이내 예약, 동시 {grade.max}건, 무료 취소는{" "}
          {grade.cancelHours}시간 전까지
        </p>
      )}

      {/* 예약 대상 */}
      {!suspended && (
      <>
      <div className="mt-4 flex flex-wrap gap-2">
        {resources.map((r) => (
          <button
            key={r.id}
            onClick={() => setResourceId(r.id)}
            className={`rounded border px-3 py-1 ${
              r.id === resourceId ? "bg-black text-white" : ""
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>

      {/* 날짜 */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
        {days.map((d) => (
          <button
            key={d}
            onClick={() => setDay(d)}
            className={`shrink-0 rounded border px-3 py-1 text-sm ${
              d === day ? "bg-black text-white" : ""
            }`}
          >
            {new Date(d + "T00:00:00+09:00").toLocaleDateString("ko-KR", {
              timeZone: "Asia/Seoul",
              month: "numeric",
              day: "numeric",
              weekday: "short",
            })}
          </button>
        ))}
      </div>

      {/* 시간표 */}
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
        {hours.map((h) => {
          const slot = slotOf(day, h);
          const isPast = new Date(slot).getTime() <= now;
          const isMine = mine.some((m) => m.resource_id === resourceId && sameTime(m.slot, slot));
          const isTaken = taken.some((t) => sameTime(t, slot));
          const disabled = isPast || isTaken || busySlot !== null;
          return (
            <button
              key={h}
              disabled={disabled}
              onClick={() => book(slot)}
              className={`rounded border py-3 text-sm ${
                isMine
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : isTaken || isPast
                  ? "bg-gray-100 text-gray-400"
                  : "hover:bg-gray-50"
              }`}
            >
              {h}:00
              <div className="text-xs">
                {isMine ? "내 예약" : isTaken ? "예약됨" : isPast ? "지남" : busySlot === slot ? "..." : "가능"}
              </div>
            </button>
          );
        })}
      </div>

      </>
      )}

      {/* 내 예약 */}
      <h2 className="mt-8 font-semibold">내 예약</h2>
      {mine.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">예약이 없습니다.</p>
      ) : (
        <ul className="mt-2 divide-y rounded border">
          {mine.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>
                {resources.find((x) => x.id === r.resource_id)?.name} / {label(r.slot)}
              </span>
              <button className="text-red-600" onClick={() => cancel(r)}>
                취소
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* 알림 */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 w-max max-w-[90vw] -translate-x-1/2 rounded px-4 py-3 text-sm text-white shadow ${
            toast.ok ? "bg-gray-900" : "bg-red-600"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

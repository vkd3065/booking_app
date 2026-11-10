"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { gradeOf, dropAfter, limitText } from "@/lib/grade";
import ScoreRuler, { GRADE_TEXT } from "./score-ruler";
import Calendar from "./calendar";

type Resource = { id: number; name: string; open_hour: number; close_hour: number };
type MyReservation = { id: number; slot: string; resource_id: number };
// 확인 창이 떠 있는 동안의 예약 대기
type Pending = { slot: string; resourceId: number; ahead: number; expiresAt: number; note: string };

const HOLD_SECONDS = 60;
function holdUntil() {
  return Date.now() + HOLD_SECONDS * 1000;
}

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
  SLOT_TAKEN: "다른 회원이 먼저 예약한 시간입니다. 다른 시간을 선택해 주세요.",
  PAST_SLOT: "이미 지난 시간입니다.",
  CLOSED_HOUR: "운영 시간이 아닙니다.",
  BAD_SLOT: "잘못된 시간입니다.",
  NO_RESOURCE: "예약할 수 없는 대상입니다.",
  LOGIN_REQUIRED: "다시 로그인해 주세요.",
  CANNOT_CANCEL: "취소할 수 없는 예약입니다.",
  TOO_FAR: "등급 기준 예약 가능 기간을 넘는 시간입니다.",
  LIMIT_RESERVATIONS: "동시 예약 가능 건수를 모두 사용 중입니다.",
  SUSPENDED: "점수가 낮아 예약이 제한된 상태입니다.",
  PEAK_LIMIT: "주의 등급은 인기 시간대를 예약할 수 없습니다.",
  WAIT_TURN: "먼저 누른 회원이 아직 결정 중입니다. 그 회원이 취소하면 예약할 수 있습니다.",
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
      Array.from({ length: grade.days || 7 }, (_, i) => kstDate(new Date(now + i * 86400000))),
    [now, grade.days]
  );

  const [resourceId, setResourceId] = useState(resources[0]?.id ?? 0);
  const [day, setDay] = useState(days[0]);
  const [taken, setTaken] = useState<string[]>([]);
  const [held, setHeld] = useState<string[]>([]); // 다른 사람이 결정 중인 시간
  const [peaks, setPeaks] = useState<{ weekday: number; hour: number }[]>([]); // 인기 시간대
  const [mine, setMine] = useState<MyReservation[]>([]);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const [left, setLeft] = useState(HOLD_SECONDS);

  const resource = resources.find((r) => r.id === resourceId);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((text: string, ok = false) => {
    setToast({ text, ok });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  // 예약된 시간
  const loadTaken = useCallback(async () => {
    if (!resourceId) return;
    const { data } = await supabase.rpc("get_taken_slots", {
      p_resource_id: resourceId,
      p_day: day,
    });
    setTaken((data as string[] | null) ?? []);
    const { data: h } = await supabase.rpc("get_held_slots", {
      p_resource_id: resourceId,
      p_day: day,
    });
    setHeld((h as string[] | null) ?? []);
  }, [supabase, resourceId, day]);

  // 인기 시간대 (자원별)
  useEffect(() => {
    if (!resourceId) return;
    supabase
      .from("peak_hours")
      .select("weekday, hour")
      .eq("resource_id", resourceId)
      .then(({ data }) => setPeaks(data ?? []));
  }, [supabase, resourceId]);
  const weekday = new Date(day + "T12:00:00+09:00").getUTCDay();
  const isPeakHour = (h: number) => peaks.some((p) => p.weekday === weekday && p.hour === h);

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
    const t = setInterval(loadTaken, 20000);
    return () => clearInterval(t);
  }, [loadTaken]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMine();
  }, [loadMine]);

  // 취소: 대기 해제 → 뒷사람이 예약할 수 있게 알림
  const cancelHold = useCallback(
    async (msg?: string) => {
      const p = pendingRef.current;
      if (!p) return;
      setPending(null);
      await supabase.rpc("release_hold", { p_resource_id: p.resourceId, p_slot: p.slot });
      supabase.channel(`slots-${p.resourceId}`).httpSend("changed", { type: "released", slot: p.slot, from: TAB_ID });
      if (msg) showToast(msg);
    },
    [supabase, showToast]
  );

  // 대기 상태를 실시간 처리에서도 볼 수 있게
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // Esc로 확인 창 닫기 (대기 취소)
  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelHold();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, cancelHold]);

  // 60초 카운트다운, 끝나면 대기 자동 취소
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => {
      const sec = Math.ceil((pending.expiresAt - Date.now()) / 1000);
      setLeft(Math.max(0, sec));
      if (sec <= 0) cancelHold(`${HOLD_SECONDS}초가 지나 예약 대기가 취소되었습니다.`);
    }, 1000);
    return () => clearInterval(t);
  }, [pending, cancelHold]);

  // 다른 사람이 예약/취소하면 갱신
  useEffect(() => {
    const channel = supabase
      .channel(`slots-${resourceId}`)
      .on("broadcast", { event: "changed" }, ({ payload }) => {
        if (payload?.from === TAB_ID) return;
        loadTaken();
        const p = pendingRef.current;
        if (p && p.resourceId === resourceId && sameTime(p.slot, payload?.slot)) {
          if (payload?.type === "booked") {
            // 앞사람이 확인함 → 내 대기는 끝
            setPending(null);
            showToast(ERRORS.SLOT_TAKEN);
            return;
          }
          if (payload?.type === "released") {
            // 앞사람이 취소함 → 내 순서 다시 확인
            supabase
              .rpc("hold_position", { p_resource_id: p.resourceId, p_slot: p.slot })
              .then(({ data }) => {
                const ahead = (data as number) ?? 0;
                setPending((cur) =>
                  cur && cur.slot === p.slot
                    ? { ...cur, ahead, note: ahead === 0 ? "먼저 누른 회원이 취소했습니다. 지금 예약하기를 누르면 예약됩니다." : cur.note }
                    : cur
                );
              });
            return;
          }
        }
        // 보고 있는 날짜면 알림
        if (payload?.type === "booked" && kstDate(new Date(payload.slot)) === day) {
          showToast(`${label(payload.slot)}은 방금 다른 회원이 예약했습니다.`);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, resourceId, day, loadTaken, showToast]);

  // 시간 칸을 누름: 예약 대기 등록 (아직 예약 아님)
  async function hold(slot: string) {
    setBusySlot(slot);
    const { data, error } = await supabase.rpc("hold_slot", {
      p_resource_id: resourceId,
      p_slot: slot,
    });
    setBusySlot(null);
    if (error) {
      showToast(toMessage(error.message));
      loadTaken();
      return;
    }
    supabase.channel(`slots-${resourceId}`).httpSend("changed", { type: "held", slot, from: TAB_ID });
    setLeft(HOLD_SECONDS);
    setPending({
      slot,
      resourceId,
      ahead: (data as number) ?? 0,
      expiresAt: holdUntil(),
      note: "",
    });
  }

  // 확인: 이때 예약됨 (앞에 대기 중인 사람이 있으면 기다림)
  async function confirmHold() {
    if (!pending) return;
    const p = pending;
    setBusySlot(p.slot);
    const { error } = await supabase.rpc("book_slot", {
      p_resource_id: p.resourceId,
      p_slot: p.slot,
    });
    setBusySlot(null);
    if (error) {
      if (error.message.includes("WAIT_TURN")) {
        setPending({ ...p, note: ERRORS.WAIT_TURN });
        return;
      }
      await supabase.rpc("release_hold", { p_resource_id: p.resourceId, p_slot: p.slot });
      setPending(null);
      showToast(toMessage(error.message));
    } else {
      setPending(null);
      showToast(`${label(p.slot)} 예약이 완료되었습니다.`, true);
      supabase.channel(`slots-${p.resourceId}`).httpSend("changed", { type: "booked", slot: p.slot, from: TAB_ID });
    }
    loadTaken();
    loadMine();
  }


  async function cancel(r: MyReservation) {
    // 무료 취소 마감이 지났으면 -15점 경고
    const late = now > new Date(r.slot).getTime() - grade.cancelHours * 3600000;
    // 깎인 뒤 등급이 내려가면 달라지는 조건도 같이 안내
    const drop = late ? dropAfter(score, -15) : null;
    const dropMsg = drop
      ? `\n\n취소하면 ${Math.max(0, score - 15)}점이 되어 ${drop.name} 등급으로 내려갑니다.\n(${limitText(drop)})`
      : "";
    const msg = late
      ? `${label(r.slot)} 예약은 무료 취소 마감(${grade.cancelHours}시간 전)이 지났습니다.\n지금 취소하면 신용 점수 15점이 차감됩니다.${dropMsg}\n\n그래도 취소하시겠습니까?`
      : `${label(r.slot)} 예약을 취소하시겠습니까?`;
    if (!confirm(msg)) return;
    const { error } = await supabase.rpc("cancel_booking", { p_id: r.id });
    if (error) {
      showToast(toMessage(error.message));
    } else {
      showToast("예약이 취소되었습니다.", true);
      await supabase.channel(`slots-${r.resource_id}`).httpSend("changed", { type: "canceled", slot: r.slot, from: TAB_ID });
      router.refresh();
    }
    loadTaken();
    loadMine();
  }

  // 예약 제한 상태 (점수 50 미만)
  const suspended = grade.max === 0;
  // 동시에 잡을 수 있는 예약 수를 다 썼는지
  const full = !suspended && mine.length >= grade.max;
  const suspendedDay = suspendedUntil
    ? new Date(suspendedUntil).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" })
    : null;

  // 늦은 취소(-15), 노쇼(-30)를 하면 등급이 내려가는지
  const lateDrop = dropAfter(score, -15);
  const noShowDrop = dropAfter(score, -30);
  const dropTo = lateDrop ?? noShowDrop;
  const dropMarks = [
    ...(lateDrop ? [{ value: score - 15, label: "−15" }] : []),
    ...(noShowDrop ? [{ value: score - 30, label: "−30" }] : []),
  ];

  const hours = resource
    ? Array.from(
        { length: resource.close_hour - resource.open_hour },
        (_, i) => resource.open_hour + i
      )
    : [];

  const dayDate = new Date(day + "T12:00:00+09:00");
  const dayText = `${dayDate.getUTCMonth() + 1}월 ${dayDate.getUTCDate()}일 (${"일월화수목금토"[dayDate.getUTCDay()]})`;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        {/* 예약 대상 */}
        <section className="box">
          <h2 className="tit">예약 대상</h2>
          <div className="seg pl-px">
            {resources.map((r) => (
              <button key={r.id} aria-pressed={r.id === resourceId} onClick={() => setResourceId(r.id)}>
                {r.name}
              </button>
            ))}
          </div>
          {resource && (
            <p className="mt-3 text-sm text-sub">
              운영 시간 {resource.open_hour}:00 ~ {resource.close_hour}:00, 예약은 1시간 단위입니다.
            </p>
          )}
        </section>

        {/* 날짜와 시간 */}
        <section className="box">
          <h2 className="tit">날짜와 시간</h2>
          <div className="grid gap-6 sm:grid-cols-[260px_1fr]">
            <Calendar days={days} day={day} onPick={setDay} />

            <div>
              <p className="font-bold">
                {dayText} <span className="font-normal text-sub">{resource?.name}</span>
              </p>
              <div className="num mt-3 grid grid-cols-2 gap-1.5">
                {hours.map((h) => {
                  const slot = slotOf(day, h);
                  const isPast = new Date(slot).getTime() <= now;
                  const isMine = mine.some((m) => m.resource_id === resourceId && sameTime(m.slot, slot));
                  const isTaken = taken.some((t) => sameTime(t, slot));
                  const isHeld = !isTaken && held.some((t) => sameTime(t, slot));
                  const isPeak = isPeakHour(h);
                  const peakBlocked = isPeak && !grade.peak;
                  const disabled = suspended || full || isPast || isTaken || peakBlocked || busySlot !== null;
                  const blocked = isPast || suspended || full || peakBlocked;
                  return (
                    <button
                      key={h}
                      disabled={disabled}
                      onClick={() => hold(slot)}
                      className={`flex items-center justify-between border px-3 py-2 text-left text-sm ${
                        isMine
                          ? "border-pine bg-pine text-white"
                          : isTaken
                          ? "hatch border-line text-[#8b9198]"
                          : blocked
                          ? "border-line bg-wash text-[#a9aeb4]"
                          : isHeld
                          ? "border-warn bg-warn-wash text-warn"
                          : "border-[#b9bec4] bg-white hover:border-pine hover:bg-pine-wash"
                      }`}
                    >
                      <span className="font-semibold">
                        {h}:00
                        {isPeak && !isMine && <em className="ml-1.5 text-xs font-bold not-italic text-warn">인기</em>}
                      </span>
                      <span className="text-xs">
                        {isMine ? "내 예약" : isTaken ? "예약됨" : isPast ? "마감" : suspended ? "제한" : full ? "한도 초과" : peakBlocked ? "주의 등급 불가" : busySlot === slot ? "..." : isHeld ? "다른 회원 결정 중" : "예약 가능"}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs leading-5 text-sub">
                ※ 시간을 누르면 확인 창이 뜨고, 60초 안에 예약하기를 눌러야 예약됩니다.
                <br />※ 같은 시간을 여러 명이 누르면 먼저 누른 회원에게 우선권이 있습니다.
              </p>
            </div>
          </div>
        </section>
      </div>

      <aside className="space-y-5">
        {/* 점수와 등급 */}
        <section className="box">
          <h2 className="tit">내 신용 점수</h2>
          <p className="num">
            <strong className={`text-3xl font-extrabold ${GRADE_TEXT[grade.name]}`}>{score}</strong>
            <span className="ml-1 text-sub">점</span>
            <span className={`ml-3 font-bold ${GRADE_TEXT[grade.name]}`}>{grade.name} 등급</span>
          </p>
          <ScoreRuler score={score} marks={dropMarks} />

          {suspended ? (
            <p className="text-sm leading-6 text-stop">
              ※ 점수가 50점 미만이라 새 예약이 제한됩니다.
              {suspendedDay && ` ${suspendedDay}부터 다시 예약할 수 있습니다.`}
            </p>
          ) : (
            <>
              <table className="info num w-full text-sm">
                <tbody>
                  <tr>
                    <th>예약 가능 기간</th>
                    <td>오늘부터 {grade.days}일</td>
                  </tr>
                  <tr>
                    <th>동시 예약</th>
                    <td>
                      {grade.max}건 중 {mine.length}건 사용
                    </td>
                  </tr>
                  <tr>
                    <th>무료 취소</th>
                    <td>예약 {grade.cancelHours}시간 전까지</td>
                  </tr>
                  <tr>
                    <th>인기 시간대</th>
                    <td>{grade.peak ? "예약 가능" : "예약 불가"}</td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-3 space-y-1 text-xs leading-5">
                {/* 등급 하락 경고: 늦은 취소나 노쇼 한 번이면 등급이 내려가는 점수일 때 */}
                {dropTo && (
                  <p className="text-warn">
                    ※ {lateDrop ? "늦은 취소(−15점) 또는 노쇼(−30점)" : "노쇼(−30점)"} 1회 시 {dropTo.name} 등급으로
                    내려갑니다. ({limitText(dropTo)})
                  </p>
                )}
                {full && <p className="text-stop">※ 동시 예약 {grade.max}건을 모두 사용 중이라 새로 예약할 수 없습니다.</p>}
                {score < 100 && <p className="text-sub">※ 점수는 매월 1일 5점씩 회복됩니다. (100점까지)</p>}
              </div>
            </>
          )}
        </section>

        {/* 내 예약 */}
        <section className="box">
          <h2 className="tit">내 예약 {mine.length > 0 && <span className="num text-pine">{mine.length}</span>}</h2>
          {mine.length === 0 ? (
            <p className="py-4 text-center text-sm text-sub">예약 내역이 없습니다.</p>
          ) : (
            <ul className="-mt-2 divide-y divide-[#eceef0]">
              {mine.map((r) => {
                const deadline = new Date(r.slot).getTime() - grade.cancelHours * 3600000;
                const late = now > deadline;
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <span>
                      <span className="font-semibold">{label(r.slot)}</span>
                      <span className="ml-1.5 text-sub">{resources.find((x) => x.id === r.resource_id)?.name}</span>
                      <span className={`block text-xs leading-5 ${late ? "text-stop" : "text-sub"}`}>
                        {late
                          ? `무료 취소 마감 지남 (취소 시 −15점${lateDrop ? `, ${lateDrop.name} 등급으로 하락` : ""})`
                          : `무료 취소 ${label(new Date(deadline).toISOString())}까지`}
                      </span>
                    </span>
                    <button className="btn shrink-0" onClick={() => cancel(r)}>
                      취소
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </aside>

      {/* 예약 확인 창 (떠 있는 동안은 예약 대기 상태) */}
      {pending && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/50 px-4"
          onClick={() => cancelHold()}
        >
          <div className="w-full max-w-[380px] bg-white text-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between bg-pine px-5 py-3 text-white">
              <strong className="text-base">예약 확인</strong>
              <span className="num text-xs">남은 시간 {left}초</span>
            </div>
            <div className="px-5 pt-3 pb-5">
              <table className="info num w-full">
                <tbody>
                  <tr>
                    <th>예약 대상</th>
                    <td>{resources.find((x) => x.id === pending.resourceId)?.name}</td>
                  </tr>
                  <tr>
                    <th>예약 일시</th>
                    <td>{label(pending.slot)}</td>
                  </tr>
                  <tr>
                    <th>무료 취소</th>
                    <td>
                      {label(new Date(new Date(pending.slot).getTime() - grade.cancelHours * 3600000).toISOString())}
                      까지
                    </td>
                  </tr>
                </tbody>
              </table>
              {pending.ahead > 0 && !pending.note && (
                <p className="mt-3 text-warn">
                  ※ 먼저 누른 회원이 {pending.ahead}명 있습니다. 그 회원이 취소하면 예약할 수 있습니다.
                </p>
              )}
              {pending.note && (
                <p className={`mt-3 ${pending.note === ERRORS.WAIT_TURN ? "text-warn" : "font-semibold text-pine"}`}>
                  ※ {pending.note}
                </p>
              )}
              <p className="mt-3 text-xs text-sub">※ 시간 안에 예약하지 않으면 자동으로 취소됩니다.</p>
              <div className="mt-4 grid grid-cols-[1fr_2fr] gap-2">
                <button className="btn py-2.5" onClick={() => cancelHold()}>
                  닫기
                </button>
                <button disabled={busySlot !== null} className="btn btn-main py-2.5" onClick={confirmHold}>
                  예약하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 알림 */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 z-20 w-max max-w-[90vw] -translate-x-1/2 px-5 py-3 text-sm text-white shadow-lg ${
            toast.ok ? "bg-ink" : "bg-stop"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

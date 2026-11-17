"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { gradeOf } from "@/lib/grade";

type Row = {
  id: number;
  reason: string;
  status: string;
  admin_note: string | null;
  created_at: string;
  profiles: { name: string | null; score: number } | null;
  reservations: { slot: string; score_delta: number; resources: { name: string } | null } | null;
};

const ERRORS: Record<string, string> = {
  ADMIN_ONLY: "관리자만 처리할 수 있습니다.",
  ALREADY_DECIDED: "이미 처리된 신청입니다.",
};
const STATUS: Record<string, { text: string; cls: string }> = {
  pending: { text: "검토 대기", cls: "text-warn" },
  accepted: { text: "수락", cls: "text-pine" },
  rejected: { text: "거절", cls: "text-stop" },
};

function label(t: string) {
  return new Date(t).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
  });
}

// 노쇼 이의신청 처리 (A9)
export default function Appeals() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("appeals")
      .select("id, reason, status, admin_note, created_at, profiles(name, score), reservations(slot, score_delta, resources(name))")
      .order("created_at", { ascending: false })
      .limit(50);
    setRows((data as unknown as Row[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function decide(r: Row, accept: boolean) {
    setBusy(true);
    const { error } = await supabase.rpc("decide_appeal", {
      p_id: r.id,
      p_accept: accept,
      p_note: notes[r.id] ?? null,
    });
    setBusy(false);
    if (error) {
      const key = Object.keys(ERRORS).find((k) => error.message.includes(k));
      setMsg({ text: key ? ERRORS[key] : "실패: " + error.message, ok: false });
    } else {
      setMsg({
        text: accept ? `수락했습니다. ${-(r.reservations?.score_delta ?? 0)}점을 복구했습니다.` : "거절했습니다.",
        ok: true,
      });
    }
    load();
  }

  const pending = rows.filter((r) => r.status === "pending");
  const done = rows.filter((r) => r.status !== "pending");

  return (
    <div>
      <p className="text-sm text-sub">검토 대기 {pending.length}건</p>
      {msg && <p className={`mt-1 text-sm ${msg.ok ? "text-pine" : "text-stop"}`}>※ {msg.text}</p>}

      {pending.map((r) => {
        const score = r.profiles?.score ?? 0;
        return (
          <div key={r.id} className="mt-3 border border-line">
            <table className="info num w-full text-sm [&_td]:px-3 [&_th]:px-3">
              <tbody>
                <tr>
                  <th>회원</th>
                  <td>
                    {r.profiles?.name ?? "회원"}{" "}
                    <span className="font-normal text-sub">
                      ({score}점, {gradeOf(score).name})
                    </span>
                  </td>
                </tr>
                <tr>
                  <th>노쇼 예약</th>
                  <td>
                    {r.reservations && label(r.reservations.slot)} {r.reservations?.resources?.name}
                    <span className="ml-2 text-stop">{r.reservations?.score_delta}점</span>
                  </td>
                </tr>
                <tr>
                  <th>신청일</th>
                  <td className="font-normal">{label(r.created_at)}</td>
                </tr>
                <tr>
                  <th>사유</th>
                  <td className="font-normal whitespace-pre-line">{r.reason}</td>
                </tr>
              </tbody>
            </table>
            <div className="flex flex-wrap items-center gap-2 bg-wash px-3 py-2.5">
              <input
                value={notes[r.id] ?? ""}
                onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                maxLength={100}
                placeholder="회원에게 보낼 메모 (선택)"
                className="field min-w-0 flex-1 py-1.5 text-sm"
              />
              <button className="btn btn-main" disabled={busy} onClick={() => decide(r, true)}>
                수락 (점수 복구)
              </button>
              <button className="btn" disabled={busy} onClick={() => decide(r, false)}>
                거절
              </button>
            </div>
          </div>
        );
      })}
      {pending.length === 0 && <p className="mt-3 text-sm text-sub">검토할 이의신청이 없습니다.</p>}

      {done.length > 0 && (
        <>
          <h3 className="mt-8 font-bold">처리한 신청</h3>
          <table className="list num mt-2">
            <thead>
              <tr>
                <th>회원</th>
                <th>노쇼 예약</th>
                <th>사유</th>
                <th>결과</th>
              </tr>
            </thead>
            <tbody>
              {done.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{r.profiles?.name ?? "회원"}</td>
                  <td className="whitespace-nowrap">{r.reservations && label(r.reservations.slot)}</td>
                  <td className="text-sub">{r.reason}</td>
                  <td className={`whitespace-nowrap font-semibold ${STATUS[r.status].cls}`}>
                    {STATUS[r.status].text}
                    {r.admin_note && <span className="block text-xs font-normal text-sub">{r.admin_note}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <p className="mt-4 text-xs leading-5 text-sub">
        ※ 수락하면 노쇼로 깎인 점수가 복구되고 예약은 &apos;면제&apos;로 바뀝니다. 결과는 회원에게 알림으로 전달됩니다.
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type NoShow = { id: number; slot: string; name: string; delta: number };
export type Appeal = {
  id: number;
  reservation_id: number;
  slot: string;
  name: string;
  reason: string;
  status: string;
  admin_note: string | null;
};

const ERRORS: Record<string, string> = {
  CANNOT_APPEAL: "이의신청할 수 없는 예약입니다.",
  APPEAL_EXPIRED: "예약 시각부터 7일이 지나 신청할 수 없습니다.",
  REASON_SHORT: "사유를 10자 이상 적어 주세요.",
  ALREADY_APPEALED: "이미 이의신청한 예약입니다.",
};
const STATUS: Record<string, { text: string; cls: string }> = {
  pending: { text: "검토 중", cls: "text-warn" },
  accepted: { text: "수락 (점수 복구)", cls: "text-pine" },
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

// 노쇼 이의신청 (A9)
export default function AppealBox({ noShows, appeals }: { noShows: NoShow[]; appeals: Appeal[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!open) return;
    setBusy(true);
    const { error } = await supabase.rpc("submit_appeal", { p_res: open, p_reason: reason });
    setBusy(false);
    if (error) {
      const key = Object.keys(ERRORS).find((k) => error.message.includes(k));
      setMsg({ text: key ? ERRORS[key] : "신청하지 못했습니다.", ok: false });
      return;
    }
    setMsg({ text: "이의신청이 접수되었습니다. 결과는 예약 화면 알림으로 안내합니다.", ok: true });
    setOpen(null);
    setReason("");
    router.refresh();
  }

  if (noShows.length === 0 && appeals.length === 0) return null;

  return (
    <section className="box">
      <h2 className="tit">노쇼 이의신청</h2>

      {noShows.length > 0 && (
        <ul className="-mt-2 divide-y divide-[#eceef0]">
          {noShows.map((r) => (
            <li key={r.id} className="py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span>
                  <span className="font-semibold">{label(r.slot)}</span>
                  <span className="ml-1.5 text-sub">{r.name}</span>
                  <span className="num ml-2 text-stop">{r.delta}점</span>
                </span>
                <button
                  className="btn shrink-0"
                  onClick={() => {
                    setOpen(open === r.id ? null : r.id);
                    setMsg(null);
                  }}
                >
                  {open === r.id ? "닫기" : "이의신청"}
                </button>
              </div>
              {open === r.id && (
                <form onSubmit={submit} className="mt-2">
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                    rows={4}
                    required
                    placeholder="오지 못한 사유를 적어 주세요. (10자 이상)"
                    className="field w-full resize-none text-sm"
                  />
                  <div className="mt-1 flex items-center justify-between">
                    <span className="num text-xs text-sub">{reason.length} / 500</span>
                    <button className="btn btn-main" disabled={busy}>
                      신청
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {msg && <p className={`mt-1 text-sm ${msg.ok ? "text-pine" : "text-stop"}`}>※ {msg.text}</p>}

      {appeals.length > 0 && (
        <table className="list num mt-3">
          <thead>
            <tr>
              <th>예약</th>
              <th>사유</th>
              <th>결과</th>
            </tr>
          </thead>
          <tbody>
            {appeals.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap">
                  {label(a.slot)}
                  <span className="block text-xs text-sub">{a.name}</span>
                </td>
                <td className="text-sub">{a.reason}</td>
                <td className={`whitespace-nowrap font-semibold ${STATUS[a.status]?.cls}`}>
                  {STATUS[a.status]?.text}
                  {a.admin_note && <span className="block text-xs font-normal text-sub">{a.admin_note}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-3 text-xs leading-5 text-sub">
        ※ 노쇼 판정을 받은 예약은 예약 시각부터 7일 안에 한 번 이의신청할 수 있습니다.
        <br />※ 관리자가 사유를 확인해 수락하면 깎인 점수가 복구되고, 노쇼 기록에서 빠집니다.
      </p>
    </section>
  );
}

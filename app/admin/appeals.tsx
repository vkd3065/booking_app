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
type AiOpinion = { category: string; summary: string; opinion: string };
const AI_ERRORS: Record<string, string> = {
  AI_OFF: "AI 키가 설정되지 않았습니다.",
  AI_LIMIT: "오늘 AI 사용 횟수를 모두 사용했습니다. (하루 20회)",
};
const CATEGORY_CLS: Record<string, string> = { 불가피: "text-pine", 변심: "text-stop", "내용 부족": "text-warn" };

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
  const [ai, setAi] = useState<Record<number, AiOpinion | string>>({}); // 신청별 AI 의견 (실패 시 문구)

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
    // 돌아오는 값은 실제로 복구한 점수 (판정이 이미 취소된 예약이면 0)
    const { data: back, error } = await supabase.rpc("decide_appeal", {
      p_id: r.id,
      p_accept: accept,
      p_note: notes[r.id] ?? null,
    });
    setBusy(false);
    if (error) {
      const key = Object.keys(ERRORS).find((k) => error.message.includes(k));
      setMsg({ text: key ? ERRORS[key] : "실패: " + error.message, ok: false });
    } else {
      const restored = typeof back === "number" ? back : -(r.reservations?.score_delta ?? 0);
      setMsg({
        text: !accept
          ? "거절했습니다."
          : restored > 0
            ? `수락했습니다. ${restored}점을 복구했습니다.`
            : "수락했습니다. 판정이 이미 취소된 예약이라 점수 변동은 없습니다.",
        ok: true,
      });
    }
    load();
  }

  // AI 의견: 서버가 연락처, 이름을 가린 뒤 AI에 보냄
  async function askAi(id: number) {
    setAi({ ...ai, [id]: "확인 중입니다." });
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "appeal", appeal_id: id }),
      });
      const data = await res.json();
      setAi((cur) => ({ ...cur, [id]: res.ok ? data : (AI_ERRORS[data.error] ?? `의견을 받지 못했습니다. (${data.error})`) }));
    } catch {
      setAi((cur) => ({ ...cur, [id]: "의견을 받지 못했습니다." }));
    }
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
                <tr>
                  <th>AI 의견</th>
                  <td className="font-normal">
                    {typeof ai[r.id] === "object" ? (
                      <>
                        <b className={CATEGORY_CLS[(ai[r.id] as AiOpinion).category]}>
                          [{(ai[r.id] as AiOpinion).category}]
                        </b>{" "}
                        {(ai[r.id] as AiOpinion).summary}
                        <span className="mt-0.5 block text-sub">{(ai[r.id] as AiOpinion).opinion}</span>
                      </>
                    ) : ai[r.id] ? (
                      <span className="text-sub">{ai[r.id] as string}</span>
                    ) : (
                      <button className="btn py-0.5 text-xs" onClick={() => askAi(r.id)}>
                        AI 의견 받기
                      </button>
                    )}
                  </td>
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
        ※ AI 의견은 참고용입니다. AI에는 회원 번호와 사유만 전달되며, 사유 안의 연락처와 이름은 가려서 보냅니다.
        <br />※ 수락하면 노쇼로 깎인 점수가 복구되고 예약은 &apos;면제&apos;로 바뀝니다. 결과는 회원에게 알림으로 전달됩니다.
      </p>
    </div>
  );
}

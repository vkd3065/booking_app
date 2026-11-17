"use client";

import { useState } from "react";

type Pick = { resource_id: number; slot: string };

const AI_ERRORS: Record<string, string> = {
  AI_OFF: "AI 도우미가 아직 설정되지 않았습니다.",
  AI_LIMIT: "오늘 사용할 수 있는 횟수를 모두 사용했습니다. (하루 20회)",
  LOGIN_REQUIRED: "다시 로그인해 주세요.",
};

function label(slot: string) {
  return new Date(slot).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
  });
}

// 예약 접수 도우미: 글로 물어보면 빈 시간을 찾아 줌. 예약은 버튼을 눌러 확인 창에서 확정
export default function AiHelper({
  resources,
  onPick,
}: {
  resources: { id: number; name: string }[];
  onPick: (resourceId: number, slot: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [picks, setPicks] = useState<Pick[]>([]);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setPicks([]);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "book", message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAnswer(AI_ERRORS[data.error] ?? "답변을 받지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } else {
        setAnswer(data.answer);
        setPicks(data.picks ?? []);
      }
    } catch {
      setAnswer("답변을 받지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    setBusy(false);
  }

  return (
    <section className="box">
      <h2 className="tit">예약 도우미</h2>
      <form onSubmit={ask} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          placeholder="예) 토요일 오후에 빈 시간 있나요?"
          className="field min-w-0 flex-1 text-sm"
        />
        <button className="btn btn-main" disabled={busy}>
          {busy ? "확인 중" : "문의"}
        </button>
      </form>

      {answer && (
        <div className="mt-3 border border-line bg-wash px-4 py-3 text-sm leading-6">
          <p className="whitespace-pre-line">{answer}</p>
          {picks.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {picks.map((p) => (
                <li key={p.resource_id + p.slot} className="flex items-center justify-between gap-3 bg-white px-3 py-2">
                  <span>
                    <strong>{label(p.slot)}</strong>
                    <span className="ml-1.5 text-sub">{resources.find((r) => r.id === p.resource_id)?.name}</span>
                  </span>
                  <button className="btn shrink-0" onClick={() => onPick(p.resource_id, p.slot)}>
                    이 시간 예약
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="mt-3 text-xs leading-5 text-sub">
        ※ AI가 빈 시간을 찾아 안내합니다. 예약은 &apos;이 시간 예약&apos;을 누른 뒤 확인 창에서 확정해야 완료됩니다.
        <br />※ 문의 내용 외에 이름, 연락처 등 개인정보는 AI에 전달되지 않습니다. (하루 20회)
      </p>
    </section>
  );
}

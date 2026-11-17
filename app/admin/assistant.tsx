"use client";

import { useState } from "react";
import { gradeOf } from "@/lib/grade";

type Member = {
  member_no: number;
  name: string | null;
  score: number;
  visits?: number;
  no_shows?: number;
  late_cancels?: number;
};
type Result = { answer: string; members: Member[]; suggestions: string[] };

const PRESETS = [
  { name: "주간 운영 리포트", q: "최근 7일 예약과 노쇼 현황을 요약하고, 노쇼가 몰린 요일이나 시간대가 있으면 조치를 제안해 주세요." },
  { name: "노쇼 2회 이상 회원", q: "최근 30일 동안 노쇼가 2회 이상인 회원을 알려 주세요." },
  { name: "늦은 취소가 있는 회원", q: "최근 30일 동안 늦은 취소가 있는 회원을 알려 주세요." },
];

const AI_ERRORS: Record<string, string> = {
  AI_OFF: "AI 키가 설정되지 않았습니다. 서버 환경 변수 GEMINI_API_KEY를 확인해 주세요.",
  AI_LIMIT: "오늘 사용할 수 있는 횟수를 모두 사용했습니다. (하루 20회)",
  ADMIN_ONLY: "관리자만 사용할 수 있습니다.",
};

// 운영 리포트와 자연어 조회. AI는 조회한 기록을 요약, 제안만 하고 점수나 판정은 바꾸지 못함
export default function Assistant() {
  const [text, setText] = useState("");
  const [asked, setAsked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function ask(q: string) {
    if (!q.trim() || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    setAsked(q);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "admin", message: q }),
      });
      const data = await res.json();
      if (!res.ok) setError(AI_ERRORS[data.error] ?? "답변을 받지 못했습니다. (" + data.error + ")");
      else setResult(data);
    } catch {
      setError("답변을 받지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
    setBusy(false);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.name} className="btn" disabled={busy} onClick={() => ask(p.q)}>
            {p.name}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          placeholder="예) 이번 달 노쇼가 가장 많은 요일은?"
          className="field min-w-0 flex-1 text-sm"
        />
        <button className="btn btn-main" disabled={busy}>
          {busy ? "조회 중" : "질문"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-stop">※ {error}</p>}

      {result && (
        <div className="mt-4 text-sm">
          <p className="text-xs text-sub">질문: {asked}</p>
          <p className="mt-1 whitespace-pre-line border border-line bg-wash px-4 py-3 leading-6">{result.answer}</p>

          {result.members.length > 0 && (
            <table className="list num mt-3">
              <thead>
                <tr>
                  <th>회원 번호</th>
                  <th>이름</th>
                  <th>점수</th>
                  <th>등급</th>
                  <th>방문</th>
                  <th>노쇼</th>
                  <th>늦은 취소</th>
                </tr>
              </thead>
              <tbody>
                {result.members.map((m) => (
                  <tr key={m.member_no}>
                    <td>{m.member_no}</td>
                    <td>{m.name ?? "회원"}</td>
                    <td>{m.score}</td>
                    <td>{gradeOf(m.score).name}</td>
                    <td>{m.visits ?? 0}</td>
                    <td>{m.no_shows ?? 0}</td>
                    <td>{m.late_cancels ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {result.suggestions.length > 0 && (
            <>
              <h3 className="mt-4 font-bold">조치 제안</h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5 leading-6">
                {result.suggestions.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      <p className="mt-4 text-xs leading-5 text-sub">
        ※ AI에는 통계와 회원 번호별 기록만 전달되며, 이름은 이 화면에서만 붙여서 보여 줍니다.
        <br />※ AI 답변은 참고용입니다. 점수 변경과 방문/노쇼 판정은 판정 메뉴에서 관리자가 직접 처리합니다.
      </p>
    </div>
  );
}

import { gradeOf } from "@/lib/grade";

// 등급 구간 (0~150점)
const ZONES = [
  { name: "제한", from: 0, to: 50, bar: "bg-stop/25", text: "text-stop" },
  { name: "주의", from: 50, to: 80, bar: "bg-warn/30", text: "text-warn" },
  { name: "일반", from: 80, to: 120, bar: "bg-pine/30", text: "text-pine" },
  { name: "우수", from: 120, to: 150, bar: "bg-top/30", text: "text-top" },
];

export const GRADE_TEXT: Record<string, string> = {
  제한: "text-stop",
  주의: "text-warn",
  일반: "text-pine",
  우수: "text-top",
};
const GRADE_DOT: Record<string, string> = {
  제한: "bg-stop",
  주의: "bg-warn",
  일반: "bg-pine",
  우수: "bg-top",
};

const pos = (v: number) => `${(Math.max(0, Math.min(150, v)) / 150) * 100}%`;

// 점수 눈금자: 내 점수 위치와, 늦은 취소/노쇼를 하면 어디로 가는지(marks)를 표시
export default function ScoreRuler({
  score,
  marks = [],
}: {
  score: number;
  marks?: { value: number; label: string }[];
}) {
  const grade = gradeOf(score).name;
  return (
    <div className="num select-none pt-7 pb-5">
      <div className="relative">
        {/* 내 점수 */}
        <div className="absolute -top-7 -translate-x-1/2 text-center" style={{ left: pos(score) }}>
          <span className={`text-sm font-bold ${GRADE_TEXT[grade]}`}>{score}</span>
          <span className={`mx-auto block h-3 w-3 rounded-full border-2 border-white ${GRADE_DOT[grade]}`} />
        </div>

        {/* 구간 막대 */}
        <div className="flex h-2 overflow-hidden">
          {ZONES.map((z) => (
            <div key={z.name} className={z.bar} style={{ width: `${((z.to - z.from) / 150) * 100}%` }} />
          ))}
        </div>

        {/* 깎였을 때 위치 */}
        {marks.map((m) => (
          <div key={m.label} className="absolute -top-5 -translate-x-1/2 text-center" style={{ left: pos(m.value) }}>
            <span className="block text-[11px] leading-4 text-sub">{m.label}</span>
            <span className="mx-auto block h-3.5 w-3.5 rounded-full border-2 border-ink bg-white" />
          </div>
        ))}

        {/* 구간 이름과 경계 점수 */}
        <div className="relative mt-1.5 h-4 text-xs">
          {ZONES.map((z) => (
            <span
              key={z.name}
              className={`absolute -translate-x-1/2 ${z.name === grade ? `font-bold ${z.text}` : "text-sub"}`}
              style={{ left: pos((z.from + z.to) / 2) }}
            >
              {z.name}
            </span>
          ))}
          {[50, 80, 120].map((v) => (
            <span key={v} className="absolute -translate-x-1/2 text-[11px] text-sub/70" style={{ left: pos(v) }}>
              {v}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

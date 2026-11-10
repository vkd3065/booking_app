// 점수 → 등급 (DB 함수와 같은 기준)
export type Grade = {
  name: string;
  days: number;        // 며칠 뒤까지 예약 가능
  max: number;         // 동시에 잡을 수 있는 예약 수
  cancelHours: number; // 몇 시간 전까지 무료 취소
  peak: boolean;       // 인기 시간대 예약 가능
};

export function gradeOf(score: number): Grade {
  if (score >= 120) return { name: "우수", days: 30, max: 3, cancelHours: 2, peak: true };
  if (score >= 80) return { name: "일반", days: 14, max: 2, cancelHours: 24, peak: true };
  if (score >= 50) return { name: "주의", days: 7, max: 1, cancelHours: 48, peak: false };
  return { name: "제한", days: 0, max: 0, cancelHours: 48, peak: false };
}

// 점수가 delta만큼 바뀌면 등급이 내려가는지 (내려가면 그 등급, 아니면 null)
export function dropAfter(score: number, delta: number): Grade | null {
  const next = gradeOf(Math.max(0, score + delta));
  return next.name !== gradeOf(score).name ? next : null;
}

// 내려간 등급의 조건 (경고 문구용)
export function limitText(g: Grade) {
  if (g.max === 0) return "14일 동안 새 예약 불가";
  return `${g.days}일 이내 예약, 동시 ${g.max}건, 무료 취소 ${g.cancelHours}시간 전까지${g.peak ? "" : ", 인기 시간대 불가"}`;
}

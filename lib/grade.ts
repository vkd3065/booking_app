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

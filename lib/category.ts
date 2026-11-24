// 업종과 예약 방식
// 1인 방식: 같은 시간에 한 명만 (미용실, 병원 등)
// 인원 방식: 정원까지 여러 명 (식당, 카페 등), 정원은 다음 단계에서 설정
export type Category = "hair" | "clinic" | "lab" | "restaurant" | "cafe" | "class" | "etc";

export const CATEGORIES: { key: Category; name: string; group: boolean }[] = [
  { key: "hair", name: "미용실", group: false },
  { key: "clinic", name: "병원", group: false },
  { key: "lab", name: "실습실", group: false },
  { key: "restaurant", name: "식당", group: true },
  { key: "cafe", name: "카페", group: true },
  { key: "class", name: "공방, 클래스", group: true },
  { key: "etc", name: "기타", group: false },
];

export function categoryOf(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}

export function methodText(group: boolean) {
  return group ? "인원 방식 (정원까지 여러 명)" : "1인 방식 (같은 시간에 한 명)";
}

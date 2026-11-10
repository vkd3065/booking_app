"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { gradeOf } from "@/lib/grade";

type Member = {
  id: string;
  name: string | null;
  score: number;
  suspended_until: string | null;
  created_at: string;
};

const GRADE_CLS: Record<string, string> = {
  우수: "text-top",
  일반: "text-pine",
  주의: "text-warn",
  제한: "text-stop",
};

function dayLabel(t: string) {
  return new Date(t).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric" });
}

// 회원 점수 조회
export default function Members() {
  const supabase = useMemo(() => createClient(), []);
  const [members, setMembers] = useState<Member[]>([]);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"low" | "high" | "new">("low");

  useEffect(() => {
    supabase
      .from("profiles")
      .select("id, name, score, suspended_until, created_at")
      .then(({ data }) => setMembers(data ?? []));
  }, [supabase]);

  const list = members
    .filter((m) => (m.name ?? "").includes(q.trim()))
    .sort((a, b) =>
      sort === "low" ? a.score - b.score : sort === "high" ? b.score - a.score : b.created_at.localeCompare(a.created_at)
    );
  const byGrade = (g: string) => members.filter((m) => gradeOf(m.score).name === g).length;

  return (
    <div>
      <p className="text-sm text-sub">
        전체 {members.length}명 (우수 {byGrade("우수")}, 일반 {byGrade("일반")}, 주의 {byGrade("주의")}, 제한{" "}
        {byGrade("제한")})
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="이름 검색"
          className="field px-3 py-1.5 text-sm"
        />
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as "low" | "high" | "new")}
          className="field px-3 py-1.5 text-sm"
        >
          <option value="low">점수 낮은 순</option>
          <option value="high">점수 높은 순</option>
          <option value="new">최근 가입 순</option>
        </select>
      </div>

      <table className="list num mt-3">
        <thead>
          <tr>
            <th>이름</th>
            <th>점수</th>
            <th>등급</th>
            <th>비고</th>
          </tr>
        </thead>
        <tbody>
          {list.map((m) => {
            const g = gradeOf(m.score).name;
            return (
              <tr key={m.id}>
                <td>{m.name ?? "회원"}</td>
                <td>{m.score}</td>
                <td className={`font-semibold ${GRADE_CLS[g]}`}>{g}</td>
                <td className="text-xs text-sub">
                  {m.suspended_until
                    ? `${dayLabel(m.suspended_until)}까지 예약 제한`
                    : `${dayLabel(m.created_at)} 가입`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {list.length === 0 && <p className="mt-2 text-sm text-sub">회원이 없습니다.</p>}
    </div>
  );
}

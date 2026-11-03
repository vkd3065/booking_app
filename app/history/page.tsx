import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { gradeOf } from "@/lib/grade";

type Log = {
  id: number;
  delta: number;
  score_after: number;
  reason: string;
  created_at: string;
  reservations: { slot: string; resources: { name: string } | null } | null;
};

function when(t: string) {
  return new Date(t).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
function slotLabel(t: string) {
  return new Date(t).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
  });
}

// 내 점수 변동 내역
export default async function History() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ?? "";

  const { data: profile } = await supabase.from("profiles").select("score").eq("id", userId).single();
  const { data } = await supabase
    .from("score_logs")
    .select("id, delta, score_after, reason, created_at, reservations(slot, resources(name))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  const logs = (data as unknown as Log[]) ?? [];
  const score = profile?.score ?? 100;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">점수 내역</h1>
        <Link href="/" className="rounded border px-2 py-1 text-sm">
          예약 화면으로
        </Link>
      </header>

      <p className="mt-4 text-sm text-gray-600">
        현재 신용 점수 {score}점 ({gradeOf(score).name} 등급)
      </p>

      {logs.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">아직 점수 변동이 없습니다.</p>
      ) : (
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-gray-500">
              <th className="border-b border-gray-200 px-2 py-1 font-normal">날짜</th>
              <th className="border-b border-gray-200 px-2 py-1 font-normal">내용</th>
              <th className="border-b border-gray-200 px-2 py-1 text-right font-normal">변동</th>
              <th className="border-b border-gray-200 px-2 py-1 text-right font-normal">점수</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="border-b border-gray-200 px-2 py-2 text-gray-500">{when(l.created_at)}</td>
                <td className="border-b border-gray-200 px-2 py-2">
                  {l.reason}
                  {l.reservations && (
                    <span className="ml-2 text-xs text-gray-500">
                      {slotLabel(l.reservations.slot)} {l.reservations.resources?.name} 예약
                    </span>
                  )}
                </td>
                <td
                  className={`border-b border-gray-200 px-2 py-2 text-right ${
                    l.delta > 0 ? "text-blue-600" : "text-red-600"
                  }`}
                >
                  {l.delta > 0 ? "+" : ""}
                  {l.delta}
                </td>
                <td className="border-b border-gray-200 px-2 py-2 text-right">{l.score_after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

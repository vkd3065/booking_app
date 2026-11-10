import { createClient } from "@/lib/supabase/server";
import { gradeOf } from "@/lib/grade";
import SiteHeader from "../site-header";
import ScoreRuler, { GRADE_TEXT } from "../score-ruler";

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

  const { data: profile } = await supabase.from("profiles").select("name, score, is_admin").eq("id", userId).single();
  const { data } = await supabase
    .from("score_logs")
    .select("id, delta, score_after, reason, created_at, reservations(slot, resources(name))")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  const logs = (data as unknown as Log[]) ?? [];
  const score = profile?.score ?? 100;

  return (
    <>
      <SiteHeader name={profile?.name ?? "회원"} isAdmin={!!profile?.is_admin} current="history" />
      <main className="mx-auto grid w-full max-w-[1080px] items-start gap-5 px-4 py-6 lg:grid-cols-[340px_1fr]">
        <section className="box">
          <h2 className="tit">내 신용 점수</h2>
          <p className="num">
            <strong className={`text-3xl font-extrabold ${GRADE_TEXT[gradeOf(score).name]}`}>{score}</strong>
            <span className="ml-1 text-sub">점</span>
            <span className={`ml-3 font-bold ${GRADE_TEXT[gradeOf(score).name]}`}>{gradeOf(score).name} 등급</span>
          </p>
          <ScoreRuler score={score} />
          <table className="info num w-full text-sm">
            <tbody>
              <tr>
                <th>방문</th>
                <td className="text-pine">+5점</td>
              </tr>
              <tr>
                <th>늦은 취소</th>
                <td className="text-stop">−15점</td>
              </tr>
              <tr>
                <th>노쇼</th>
                <td className="text-stop">−30점</td>
              </tr>
              <tr>
                <th>매월 1일</th>
                <td className="text-pine">+5점 (100점까지)</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="box">
          <h2 className="tit">점수 변동 내역</h2>
      {logs.length === 0 ? (
        <p className="py-8 text-center text-sm text-sub">점수 변동 내역이 없습니다.</p>
      ) : (
        <table className="list num -mt-[14px] border-t-0">
          <thead>
            <tr>
              <th>날짜</th>
              <th>내용</th>
              <th className="!text-right">변동</th>
              <th className="!text-right">점수</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="text-sub">{when(l.created_at)}</td>
                <td>
                  {l.reason}
                  {l.reservations && (
                    <span className="ml-2 text-xs text-sub">
                      {slotLabel(l.reservations.slot)} {l.reservations.resources?.name} 예약
                    </span>
                  )}
                </td>
                <td
                  className={`text-right font-semibold ${
                    l.delta > 0 ? "text-pine" : "text-stop"
                  }`}
                >
                  {l.delta > 0 ? "+" : ""}
                  {l.delta}
                </td>
                <td className="text-right font-semibold">{l.score_after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
        </section>
      </main>
    </>
  );
}

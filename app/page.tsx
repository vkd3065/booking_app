import { createClient } from "@/lib/supabase/server";
import Booking from "./booking";
import LogoutButton from "./logout-button";

export default async function Home() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ?? "";

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, score")
    .eq("id", userId)
    .single();

  const { data: resources, error } = await supabase
    .from("resources")
    .select("id, name, open_hour, close_hour")
    .order("id");

  if (error) {
    return <p className="p-8">에러: {error.message}</p>;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">예약 시스템</h1>
        <div className="flex items-center gap-3 text-sm">
          <span>
            {profile?.name ?? "회원"} 님 (신용 점수 {profile?.score ?? "-"})
          </span>
          <LogoutButton />
        </div>
      </header>

      <Booking resources={resources ?? []} />
    </main>
  );
}

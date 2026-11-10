import { createClient } from "@/lib/supabase/server";
import Booking from "./booking";
import SiteHeader from "./site-header";

export default async function Home() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ?? "";

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, score, is_admin, suspended_until")
    .eq("id", userId)
    .single();

  const { data: resources, error } = await supabase
    .from("resources")
    .select("id, name, open_hour, close_hour")
    .order("id");

  if (error) {
    return <p className="p-8">에러: {error.message}</p>;
  }

  const score = profile?.score ?? 100;

  return (
    <>
      <SiteHeader name={profile?.name ?? "회원"} isAdmin={!!profile?.is_admin} current="book" />
      <main className="mx-auto w-full max-w-[1080px] px-4 py-6">
        <Booking resources={resources ?? []} score={score} suspendedUntil={profile?.suspended_until ?? null} />
      </main>
    </>
  );
}

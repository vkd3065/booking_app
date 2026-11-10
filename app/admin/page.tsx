import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SiteHeader from "../site-header";
import Tabs from "./tabs";

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ?? "";

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, is_admin")
    .eq("id", userId)
    .single();

  if (!profile?.is_admin) {
    return (
      <>
        <SiteHeader name={profile?.name ?? "회원"} isAdmin={false} current="admin" />
        <main className="mx-auto w-full max-w-[1080px] px-4 py-6">
          <section className="box py-12 text-center">
            <p>관리자만 이용할 수 있는 화면입니다.</p>
            <Link href="/" className="btn mt-4 inline-block">
              예약 화면으로
            </Link>
          </section>
        </main>
      </>
    );
  }

  const { data: resources } = await supabase
    .from("resources")
    .select("id, name, open_hour, close_hour")
    .order("id");

  return (
    <>
      <SiteHeader name={profile.name ?? "관리자"} isAdmin current="admin" />
      <main className="mx-auto w-full max-w-[1080px] px-4 py-6">
        <Tabs resources={resources ?? []} />
      </main>
    </>
  );
}

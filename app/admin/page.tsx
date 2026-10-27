import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Admin from "./admin";

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
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <p>관리자만 들어올 수 있는 화면입니다.</p>
        <Link href="/" className="mt-4 inline-block rounded border px-3 py-1 text-sm">
          예약 화면으로
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">관리자</h1>
        <Link href="/" className="rounded border px-2 py-1 text-sm">
          예약 화면으로
        </Link>
      </header>
      <Admin />
    </main>
  );
}

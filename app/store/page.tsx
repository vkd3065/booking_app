import { createClient } from "@/lib/supabase/server";
import { categoryOf, methodText } from "@/lib/category";
import SiteHeader from "../site-header";
import StoreForm from "./store-form";

// 내 매장: 매장이 있으면 정보, 없으면 매장 만들기
export default async function MyStore() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub ?? "";

  const { data: profile } = await supabase.from("profiles").select("name, is_admin").eq("id", userId).single();
  const { data: store } = await supabase
    .from("stores")
    .select("name, slug, category, created_at")
    .eq("owner_id", userId)
    .maybeSingle();

  const cat = store ? categoryOf(store.category) : null;

  return (
    <>
      <SiteHeader name={profile?.name ?? "회원"} isAdmin={!!profile?.is_admin} current="store" />
      <main className="mx-auto w-full max-w-[640px] px-4 py-6">
        {store && cat ? (
          <section className="box">
            <h2 className="tit">내 매장</h2>
            <table className="w-full text-[15px]">
              <tbody className="[&_th]:w-28 [&_th]:py-2 [&_th]:text-left [&_th]:font-normal [&_th]:text-sub [&_td]:py-2">
                <tr>
                  <th>매장 이름</th>
                  <td className="font-semibold">{store.name}</td>
                </tr>
                <tr>
                  <th>매장 주소</th>
                  <td className="num">/s/{store.slug}</td>
                </tr>
                <tr>
                  <th>업종</th>
                  <td>{cat.name}</td>
                </tr>
                <tr>
                  <th>예약 방식</th>
                  <td>{methodText(cat.group)}</td>
                </tr>
                <tr>
                  <th>만든 날</th>
                  <td className="num">
                    {new Date(store.created_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>
        ) : (
          <StoreForm />
        )}
      </main>
    </>
  );
}

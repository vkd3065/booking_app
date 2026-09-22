import { createClient } from "@/lib/supabase/server";
export default async function Home() {
const supabase = await createClient();
const { data: resources, error } = await supabase
.from("resources")
.select("id, name");
if (error) {
return <p>에러: {error.message}</p>;
}
return (
<main style={{ padding: 40 }}>
<h1 style={{ fontSize: 24, fontWeight: "bold" }}>예약 시스템</h1>
<p>DB 연결 테스트 - 자원 목록</p>
<ul>
{resources?.map((r) => (
<li key={r.id}>{r.name}</li>
))}
</ul>
</main>
);
}

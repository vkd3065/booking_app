// 동시 예약 테스트 (50건)
// node --env-file=.env.local scripts/race-test.mjs 이메일 비밀번호

import { createClient } from "@supabase/supabase-js";

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.log("사용법: node --env-file=.env.local scripts/race-test.mjs 이메일 비밀번호");
  process.exit(1);
}

const N = 50;
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
);

const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
if (loginError) {
  console.log("로그인 실패:", loginError.message);
  process.exit(1);
}

// 7일 뒤 첫 시간
const { data: resources } = await supabase.from("resources").select("*").order("id").limit(1);
const r = resources[0];
const day = new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
const slot = `${day}T${String(r.open_hour).padStart(2, "0")}:00:00+09:00`;

// 남은 예약 정리
const { data: old } = await supabase
  .from("reservations").select("id").eq("status", "booked").eq("resource_id", r.id).eq("slot", slot);
for (const o of old ?? []) await supabase.rpc("cancel_booking", { p_id: o.id });

console.log(`${r.name} / ${slot} 에 동시 요청 ${N}건 전송...`);
const started = Date.now();
const results = await Promise.all(
  Array.from({ length: N }, () => supabase.rpc("book_slot", { p_resource_id: r.id, p_slot: slot }))
);
const ms = Date.now() - started;

const ok = results.filter((x) => !x.error);
const taken = results.filter((x) => x.error?.message.includes("SLOT_TAKEN"));
const other = results.filter((x) => x.error && !x.error.message.includes("SLOT_TAKEN"));

const { count } = await supabase
  .from("reservations").select("id", { count: "exact", head: true })
  .eq("status", "booked").eq("resource_id", r.id).eq("slot", slot);

console.log(`성공 ${ok.length}건 / 선점 알림(SLOT_TAKEN) ${taken.length}건 / 기타 오류 ${other.length}건 (${ms}ms)`);
console.log(`DB에 저장된 예약: ${count}건`);
if (other.length) console.log("기타 오류 예:", other[0].error.message);
console.log(ok.length === 1 && count === 1 ? "결과: 통과 (정확히 1건)" : "결과: 실패");

// 정리
for (const x of ok) await supabase.rpc("cancel_booking", { p_id: x.data });
await supabase.auth.signOut();

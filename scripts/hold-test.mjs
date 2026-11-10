// 먼저 누른 사람 우선 테스트
// A가 먼저 시간을 누르고, B가 나중에 누른 뒤 두 사람이 동시에 확인을 누름 -> A만 예약돼야 함
// node --env-file=.env.local scripts/hold-test.mjs A이메일 A비밀번호 B이메일 B비밀번호

import { createClient } from "@supabase/supabase-js";

const [ea, pa, eb, pb] = process.argv.slice(2);
if (!pb) {
  console.log("사용법: node --env-file=.env.local scripts/hold-test.mjs A이메일 A비밀번호 B이메일 B비밀번호");
  process.exit(1);
}

const RUNS = 10;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const opts = { auth: { persistSession: false } };
const A = createClient(url, key, opts);
const B = createClient(url, key, opts);

for (const [c, e, p, n] of [[A, ea, pa, "A"], [B, eb, pb, "B"]]) {
  const { error } = await c.auth.signInWithPassword({ email: e, password: p });
  if (error) {
    console.log(`${n} 로그인 실패:`, error.message);
    process.exit(1);
  }
}

const { data: resources } = await A.from("resources").select("*").order("id").limit(1);
const r = resources[0];
const day = new Date(Date.now() + 7 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

let pass = 0;
for (let i = 0; i < RUNS; i++) {
  const hour = r.open_hour + (i % (r.close_hour - r.open_hour));
  const slot = `${day}T${String(hour).padStart(2, "0")}:00:00+09:00`;

  // 1. A가 먼저 누름, 0.1초 뒤 B가 누름
  await A.rpc("hold_slot", { p_resource_id: r.id, p_slot: slot });
  await sleep(100);
  const { data: ahead } = await B.rpc("hold_slot", { p_resource_id: r.id, p_slot: slot });

  // 2. 둘이 동시에 확인
  const [ra, rb] = await Promise.all([
    A.rpc("book_slot", { p_resource_id: r.id, p_slot: slot }),
    B.rpc("book_slot", { p_resource_id: r.id, p_slot: slot }),
  ]);

  const ok = !ra.error && !!rb.error;
  if (ok) pass++;
  console.log(
    `${i + 1}회 ${slot.slice(11, 16)}  B 앞 대기 ${ahead}명 / A: ${ra.error ? ra.error.message : "예약 성공"}` +
      ` / B: ${rb.error ? rb.error.message : "예약 성공"}  ${ok ? "통과" : "실패"}`
  );

  // 정리
  if (!ra.error) await A.rpc("cancel_booking", { p_id: ra.data });
  if (!rb.error) await B.rpc("cancel_booking", { p_id: rb.data });
  await B.rpc("release_hold", { p_resource_id: r.id, p_slot: slot });
}

console.log(`\n결과: ${RUNS}회 중 ${pass}회 먼저 누른 A만 예약됨 ${pass === RUNS ? "(통과)" : "(실패)"}`);
await A.auth.signOut();
await B.auth.signOut();

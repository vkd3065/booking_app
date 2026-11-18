"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// 비밀번호 재설정 (메일 링크를 거쳐 로그인된 상태로 들어옴)
export default function ResetPage() {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) {
      setMsg("두 비밀번호가 다릅니다.");
      return;
    }
    setBusy(true);
    setMsg("");
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) setMsg(toKorean(error.message));
    else setDone(true);
  }

  return (
    <main className="mx-auto w-full max-w-[400px] px-4 py-14">
      <h1 className="text-center text-2xl font-extrabold tracking-tight text-pine">예약 시스템</h1>

      <section className="box mt-6">
        <h2 className="tit">비밀번호 재설정</h2>
        {done ? (
          <div className="text-sm">
            <p className="text-pine">※ 비밀번호가 변경되었습니다. 다음부터 새 비밀번호로 로그인해 주세요.</p>
            <Link href="/" className="btn btn-main mt-4 block py-2.5 text-center text-[15px]">
              예약 화면으로
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="text-sm">
              새 비밀번호
              <input
                className="field mt-1 w-full"
                type="password"
                placeholder="6자 이상"
                minLength={6}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                required
              />
            </label>
            <label className="text-sm">
              새 비밀번호 확인
              <input
                className="field mt-1 w-full"
                type="password"
                minLength={6}
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                required
              />
            </label>
            {msg && <p className="text-sm text-stop">※ {msg}</p>}
            <button disabled={busy} className="btn btn-main mt-1 py-2.5 text-[15px]">
              변경하기
            </button>
          </form>
        )}
      </section>
    </main>
  );
}

function toKorean(m: string) {
  if (m.includes("different from the old")) return "이전과 다른 비밀번호를 입력해 주세요.";
  if (m.includes("at least")) return "비밀번호는 6자 이상이어야 합니다.";
  if (m.includes("session")) return "링크가 만료되었습니다. 비밀번호 찾기를 다시 해 주세요.";
  return m;
}

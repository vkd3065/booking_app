"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) setMsg(toKorean(error.message));
      else if (!data.session) setMsg("가입이 완료되었습니다. 메일함에서 인증 링크를 누른 뒤 로그인해 주세요.");
      else router.replace("/");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(toKorean(error.message));
      else router.replace("/");
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto w-full max-w-[400px] px-4 py-14">
      <h1 className="text-center text-2xl font-extrabold tracking-tight text-pine">예약 시스템</h1>
      <p className="mt-2 text-center text-sm text-sub">예약금 대신 예약 신용 점수로 운영하는 예약 서비스</p>

      <section className="box mt-6 p-0">
        {/* 로그인 / 회원가입 전환 */}
        <div className="grid grid-cols-2 text-center text-[15px]">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setMsg("");
              }}
              className={`border-b-2 py-3 ${
                mode === m ? "border-pine font-bold text-pine" : "border-line bg-wash text-sub"
              }`}
            >
              {m === "login" ? "로그인" : "회원가입"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3 p-5">
          {mode === "signup" && (
            <label className="text-sm">
              이름
              <input className="field mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
          )}
          <label className="text-sm">
            이메일
            <input
              className="field mt-1 w-full"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="text-sm">
            비밀번호
            <input
              className="field mt-1 w-full"
              type="password"
              placeholder="6자 이상"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {msg && <p className="text-sm text-stop">※ {msg}</p>}
          <button disabled={busy} className="btn btn-main mt-1 py-2.5 text-[15px]">
            {mode === "login" ? "로그인" : "가입하기"}
          </button>
        </form>
      </section>

      <ul className="mt-4 space-y-1 text-xs leading-5 text-sub">
        <li>※ 가입하면 신용 점수 100점(일반 등급)에서 시작합니다.</li>
        <li>※ 방문하면 +5점, 늦은 취소 −15점, 노쇼 −30점이 반영됩니다.</li>
        <li>※ 점수에 따라 예약 가능 기간과 동시 예약 수가 달라집니다.</li>
      </ul>
    </main>
  );
}

function toKorean(m: string) {
  if (m.includes("Invalid login credentials")) return "이메일 또는 비밀번호가 틀렸습니다.";
  if (m.includes("already registered")) return "이미 가입된 이메일입니다.";
  if (m.includes("Email not confirmed")) return "메일 인증을 먼저 해 주세요.";
  return m;
}

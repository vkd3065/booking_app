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
      else if (!data.session) setMsg("가입 완료. 메일함에서 인증 링크를 누른 뒤 로그인하세요.");
      else router.replace("/");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(toKorean(error.message));
      else router.replace("/");
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold">예약 시스템</h1>
      <p className="mt-1 text-sm text-gray-500">{mode === "login" ? "로그인" : "회원가입"}</p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        {mode === "signup" && (
          <input
            className="rounded border px-3 py-2"
            placeholder="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        )}
        <input
          className="rounded border px-3 py-2"
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="rounded border px-3 py-2"
          type="password"
          placeholder="비밀번호 (6자 이상)"
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          disabled={busy}
          className="rounded bg-black py-2 text-white disabled:opacity-50"
        >
          {mode === "login" ? "로그인" : "가입하기"}
        </button>
      </form>

      {msg && <p className="mt-4 text-sm text-red-600">{msg}</p>}

      <button
        className="mt-6 text-sm text-gray-600 underline"
        onClick={() => {
          setMode(mode === "login" ? "signup" : "login");
          setMsg("");
        }}
      >
        {mode === "login" ? "처음이면 회원가입" : "이미 계정이 있으면 로그인"}
      </button>
    </main>
  );
}

function toKorean(m: string) {
  if (m.includes("Invalid login credentials")) return "이메일 또는 비밀번호가 틀렸습니다.";
  if (m.includes("already registered")) return "이미 가입된 이메일입니다.";
  if (m.includes("Email not confirmed")) return "메일 인증을 먼저 해 주세요.";
  return m;
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "findId" | "findPw";
type Found = { email: string; joined: string };

const TITLE: Record<Mode, string> = {
  login: "로그인",
  signup: "회원가입",
  findId: "아이디 찾기",
  findPw: "비밀번호 찾기",
};
const SUBMIT: Record<Mode, string> = {
  login: "로그인",
  signup: "가입하기",
  findId: "아이디 찾기",
  findPw: "재설정 메일 보내기",
};

export default function LoginForm({ linkError }: { linkError: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(
    linkError ? { text: "링크가 만료되었거나 이미 사용되었습니다. 비밀번호 찾기를 다시 해 주세요.", ok: false } : null
  );
  const [found, setFound] = useState<Found[] | null>(null);
  const [busy, setBusy] = useState(false);

  function go(m: Mode) {
    setMode(m);
    setMsg(null);
    setFound(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const supabase = createClient();

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) setMsg({ text: toKorean(error.message), ok: false });
      else if (!data.session)
        setMsg({ text: "가입이 완료되었습니다. 메일함에서 인증 링크를 누른 뒤 로그인해 주세요.", ok: true });
      else router.replace("/");
    } else if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ text: toKorean(error.message), ok: false });
      else router.replace("/");
    } else if (mode === "findId") {
      // 이메일은 앞부분만 가려서 돌아옴
      const { data, error } = await supabase.rpc("find_login_email", { p_name: name });
      if (error) setMsg({ text: "조회하지 못했습니다. 잠시 후 다시 시도해 주세요.", ok: false });
      else setFound((data as Found[]) ?? []);
    } else {
      // 가입 여부와 관계없이 같은 안내 (남이 가입 여부를 알아낼 수 없게)
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm?next=/reset`,
      });
      if (error && /rate limit/i.test(error.message))
        setMsg({ text: "메일 발송 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.", ok: false });
      else
        setMsg({
          text: "가입된 이메일이면 재설정 링크를 보냈습니다. 메일의 링크는 지금 이 브라우저에서 열어 주세요.",
          ok: true,
        });
    }
    setBusy(false);
  }

  return (
    <main className="mx-auto w-full max-w-[400px] px-4 py-14">
      <h1 className="text-center text-2xl font-extrabold tracking-tight text-pine">예약 시스템</h1>
      <p className="mt-2 text-center text-sm text-sub">예약금 대신 예약 신용 점수로 운영하는 예약 서비스</p>

      <section className="box mt-6 p-0">
        {mode === "login" || mode === "signup" ? (
          // 로그인 / 회원가입 전환
          <div className="grid grid-cols-2 text-center text-[15px]">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => go(m)}
                className={`border-b-2 py-3 ${
                  mode === m ? "border-pine font-bold text-pine" : "border-line bg-wash text-sub"
                }`}
              >
                {TITLE[m]}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center border-b-2 border-pine px-5 py-3">
            <strong className="text-[15px] text-pine">{TITLE[mode]}</strong>
            <button
              type="button"
              onClick={() => go("login")}
              className="ml-auto text-sm text-sub hover:text-ink hover:underline"
            >
              로그인으로
            </button>
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-3 p-5">
          {(mode === "signup" || mode === "findId") && (
            <label className="text-sm">
              {mode === "findId" ? "가입할 때 입력한 이름" : "이름"}
              <input className="field mt-1 w-full" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
          )}
          {mode !== "findId" && (
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
          )}
          {(mode === "login" || mode === "signup") && (
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
          )}

          {/* 아이디 찾기 결과 */}
          {found && (
            <div className="border border-line bg-wash px-4 py-3 text-sm">
              {found.length === 0 ? (
                <p className="text-sub">해당 이름으로 가입된 계정이 없습니다.</p>
              ) : (
                <ul className="num space-y-1">
                  {found.map((f) => (
                    <li key={f.email + f.joined}>
                      <strong>{f.email}</strong>
                      <span className="ml-2 text-xs text-sub">{f.joined} 가입</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {msg && <p className={`text-sm ${msg.ok ? "text-pine" : "text-stop"}`}>※ {msg.text}</p>}
          <button disabled={busy} className="btn btn-main mt-1 py-2.5 text-[15px]">
            {SUBMIT[mode]}
          </button>

          {mode === "login" && (
            <div className="flex justify-center gap-3 text-sm text-sub">
              <button type="button" onClick={() => go("findId")} className="hover:text-ink hover:underline">
                아이디 찾기
              </button>
              <span className="text-line">|</span>
              <button type="button" onClick={() => go("findPw")} className="hover:text-ink hover:underline">
                비밀번호 찾기
              </button>
            </div>
          )}
          {mode === "findId" && found && found.length > 0 && (
            <button type="button" onClick={() => go("findPw")} className="btn py-2">
              비밀번호 찾기
            </button>
          )}
        </form>
      </section>

      <ul className="mt-4 space-y-1 text-xs leading-5 text-sub">
        {mode === "findId" ? (
          <>
            <li>※ 아이디는 가입할 때 입력한 이메일입니다.</li>
            <li>※ 개인정보 보호를 위해 이메일 앞부분만 보여 드립니다.</li>
          </>
        ) : mode === "findPw" ? (
          <>
            <li>※ 메일의 링크를 누르면 새 비밀번호를 정하는 화면으로 이동합니다.</li>
            <li>※ 링크는 재설정을 요청한 브라우저에서 열어야 합니다.</li>
            <li>※ 메일이 오지 않으면 스팸함을 확인해 주세요.</li>
          </>
        ) : (
          <>
            <li>※ 가입하면 신용 점수 100점(일반 등급)에서 시작합니다.</li>
            <li>※ 방문하면 +5점, 늦은 취소 −15점, 노쇼 −30점이 반영됩니다.</li>
            <li>※ 점수에 따라 예약 가능 기간과 동시 예약 수가 달라집니다.</li>
          </>
        )}
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

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CATEGORIES, categoryOf, methodText } from "@/lib/category";

const ERRORS: Record<string, string> = {
  ALREADY_OWNER: "이미 만든 매장이 있습니다. 지금은 한 사람이 매장 하나만 만들 수 있습니다.",
  BAD_NAME: "매장 이름은 1~40자로 입력해 주세요.",
  BAD_SLUG: "매장 주소는 영문 소문자, 숫자, 하이픈(-)으로 3~30자 입력해 주세요.",
  BAD_CATEGORY: "업종을 선택해 주세요.",
  SLUG_TAKEN: "이미 쓰고 있는 매장 주소입니다. 다른 주소를 입력해 주세요.",
};

// 매장 만들기
export default function StoreForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [category, setCategory] = useState("hair");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const cat = categoryOf(category);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const { error } = await createClient().rpc("create_store", {
      p_name: name,
      p_slug: slug,
      p_category: category,
    });
    setBusy(false);
    if (error) {
      const key = Object.keys(ERRORS).find((k) => error.message.includes(k));
      setMsg(key ? ERRORS[key] : "매장을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } else {
      router.refresh();
    }
  }

  return (
    <section className="box">
      <h2 className="tit">매장 만들기</h2>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-sm">
          매장 이름
          <input
            className="field mt-1 w-full"
            value={name}
            maxLength={40}
            placeholder="예: 하늘 미용실"
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="text-sm">
          매장 주소
          <div className="mt-1 flex items-center gap-1">
            <span className="text-sub">/s/</span>
            <input
              className="field w-full"
              value={slug}
              maxLength={30}
              placeholder="sky-hair"
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              required
            />
          </div>
          <span className="mt-1 block text-xs text-sub">영문 소문자, 숫자, 하이픈(-) 3~30자</span>
        </label>
        <label className="text-sm">
          업종
          <select className="field mt-1 w-full" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <p className="border border-line bg-wash px-3 py-2 text-sm">
          예약 방식: <b className="text-pine">{methodText(cat.group)}</b>
        </p>
        {msg && <p className="text-sm text-stop">※ {msg}</p>}
        <button disabled={busy} className="btn btn-main mt-1 py-2.5 text-[15px]">
          매장 만들기
        </button>
      </form>
      <ul className="mt-4 space-y-1 text-xs leading-5 text-sub">
        <li>※ 매장을 만들면 그 매장의 주인(관리자)이 됩니다.</li>
        <li>※ 업종에 따라 예약 방식이 정해집니다. 미용실, 병원처럼 같은 시간에 한 명만 받거나, 식당처럼 정원까지 받습니다.</li>
        <li>※ 신용 점수는 매장과 관계없이 회원 한 명당 하나입니다.</li>
      </ul>
    </section>
  );
}

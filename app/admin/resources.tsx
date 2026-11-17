"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Resource = { id: number; name: string; open_hour: number; close_hour: number; active: boolean; price: number };
type Form = { id: number | null; name: string; open: number; close: number; price: number };

const ERRORS: Record<string, string> = {
  NOT_ADMIN: "관리자만 변경할 수 있습니다.",
  BAD_NAME: "이름을 입력해 주세요.",
  BAD_HOURS: "운영 시작 시각이 종료 시각보다 빨라야 합니다.",
  BAD_PRICE: "요금은 0원 이상이어야 합니다.",
  HAS_RESERVATIONS: "남아 있는 예약이 있어 변경할 수 없습니다. 예약이 끝난 뒤 다시 시도해 주세요.",
};
const EMPTY: Form = { id: null, name: "", open: 10, close: 20, price: 10000 };
const HOURS = Array.from({ length: 25 }, (_, i) => i);

// 예약 대상 관리 (A8)
export default function Resources() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [list, setList] = useState<Resource[]>([]);
  const [form, setForm] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("resources").select("id, name, open_hour, close_hour, active, price").order("id");
    setList(data ?? []);
  }, [supabase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // DB 함수 실행 후 목록과 다른 메뉴의 대상 목록을 새로 고침
  async function run(
    fn: string,
    args: Record<string, unknown>,
    done: string,
    then?: (data: unknown) => PromiseLike<{ error: { message: string } | null }>
  ) {
    setBusy(true);
    const first = await supabase.rpc(fn, args);
    let error: { message: string } | null = first.error;
    // 이어서 할 일 (대상 저장 뒤 요금 저장)
    if (!error && then) error = (await then(first.data)).error;
    setBusy(false);
    if (error) {
      const key = Object.keys(ERRORS).find((k) => error.message.includes(k));
      setMsg({ text: key ? ERRORS[key] : "실패: " + error.message, ok: false });
      return false;
    }
    setMsg({ text: done, ok: true });
    load();
    router.refresh();
    return true;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(
      "save_resource",
      { p_id: form.id, p_name: form.name, p_open: form.open, p_close: form.close },
      form.id ? "수정했습니다." : "추가했습니다.",
      (id) => supabase.rpc("set_resource_price", { p_id: id, p_price: form.price })
    );
    if (ok) setForm(EMPTY);
  }

  return (
    <div>
      <table className="list num">
        <thead>
          <tr>
            <th className="w-14">번호</th>
            <th>이름</th>
            <th>운영 시간</th>
            <th>요금 (1시간)</th>
            <th>상태</th>
            <th className="w-40">관리</th>
          </tr>
        </thead>
        <tbody>
          {list.map((r, i) => (
            <tr key={r.id} className={r.active ? "" : "text-sub"}>
              <td>{i + 1}</td>
              <td className="font-semibold">{r.name}</td>
              <td>
                {r.open_hour}:00 ~ {r.close_hour}:00
              </td>
              <td>{r.price.toLocaleString("ko-KR")}원</td>
              <td className={r.active ? "text-pine" : ""}>{r.active ? "예약 받는 중" : "숨김"}</td>
              <td>
                <span className="flex gap-1.5">
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => {
                      setForm({ id: r.id, name: r.name, open: r.open_hour, close: r.close_hour, price: r.price });
                      setMsg(null);
                    }}
                  >
                    수정
                  </button>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() =>
                      run(
                        "set_resource_active",
                        { p_id: r.id, p_active: !r.active },
                        r.active ? "숨겼습니다. 회원 화면에 나오지 않습니다." : "다시 예약을 받습니다."
                      )
                    }
                  >
                    {r.active ? "숨기기" : "다시 받기"}
                  </button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-pine" : "text-stop"}`}>※ {msg.text}</p>}

      <h3 className="mt-8 font-bold">{form.id ? "예약 대상 수정" : "예약 대상 추가"}</h3>
      <form onSubmit={save} className="mt-2 border-t-2 border-ink">
        <table className="info num w-full text-sm">
          <tbody>
            <tr>
              <th className="!align-middle">이름</th>
              <td>
                <input
                  className="field w-full max-w-xs font-normal"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="예: 스터디룸 A"
                  maxLength={30}
                  required
                />
              </td>
            </tr>
            <tr>
              <th className="!align-middle">운영 시간</th>
              <td className="font-normal">
                <select
                  className="field"
                  value={form.open}
                  onChange={(e) => setForm({ ...form, open: Number(e.target.value) })}
                >
                  {HOURS.slice(0, 24).map((h) => (
                    <option key={h} value={h}>
                      {h}:00
                    </option>
                  ))}
                </select>
                <span className="mx-2">~</span>
                <select
                  className="field"
                  value={form.close}
                  onChange={(e) => setForm({ ...form, close: Number(e.target.value) })}
                >
                  {HOURS.slice(1).map((h) => (
                    <option key={h} value={h}>
                      {h}:00
                    </option>
                  ))}
                </select>
              </td>
            </tr>
            <tr>
              <th className="!align-middle">요금 (1시간)</th>
              <td className="font-normal">
                <input
                  type="number"
                  min={0}
                  step={1000}
                  className="field w-32 text-right"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                />
                <span className="ml-2">원</span>
              </td>
            </tr>
          </tbody>
        </table>
        <div className="mt-3 flex gap-1.5">
          <button className="btn btn-main px-5 py-2" disabled={busy}>
            {form.id ? "수정 저장" : "추가"}
          </button>
          {form.id && (
            <button type="button" className="btn px-4 py-2" onClick={() => setForm(EMPTY)}>
              취소
            </button>
          )}
        </div>
      </form>

      <p className="mt-4 text-xs leading-5 text-sub">
        ※ 남아 있는 예약이 있는 대상은 숨기거나, 그 예약이 빠지도록 운영 시간을 줄일 수 없습니다.
        <br />※ 예약 기록을 보존하기 위해 삭제 대신 숨기기를 사용합니다.
      </p>
    </div>
  );
}

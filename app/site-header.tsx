import Link from "next/link";
import LogoutButton from "./logout-button";

// 모든 화면 위쪽 메뉴
export default function SiteHeader({
  name,
  isAdmin,
  current,
}: {
  name: string;
  isAdmin: boolean;
  current: "book" | "history" | "admin";
}) {
  const menu = [
    { key: "book", href: "/", text: "예약하기" },
    { key: "history", href: "/history", text: "점수 내역" },
    ...(isAdmin ? [{ key: "admin", href: "/admin", text: "관리자" }] : []),
  ];
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex h-14 w-full max-w-[1080px] items-center gap-8 px-4">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-pine">
          예약 시스템
        </Link>
        <nav className="flex h-full text-[15px]">
          {menu.map((m) => (
            <Link
              key={m.key}
              href={m.href}
              className={`flex items-center border-b-[3px] px-3 ${
                m.key === current ? "border-pine font-bold" : "border-transparent text-sub hover:text-ink"
              }`}
            >
              {m.text}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm text-sub">
          <span>
            <b className="font-semibold text-ink">{name}</b> 님
          </span>
          <span className="h-3 w-px bg-line" />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: "⌂", exact: true },
  { href: "/matches/new", label: "경기 등록", icon: "＋", exact: false },
  { href: "/matches", label: "경기 목록", icon: "▤", exact: true },
  { href: "/analysis", label: "분석", icon: "◔", exact: false },
  { href: "/hypotheses", label: "가설", icon: "◇", exact: false },
  { href: "/settings", label: "설정", icon: "⚙", exact: false },
] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  if (href === "/matches") {
    return pathname === "/matches" || (pathname.startsWith("/matches/") && !pathname.startsWith("/matches/new"));
  }
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen md:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-[var(--line)] bg-[#0b0f16]/95 px-4 py-5 backdrop-blur md:flex md:flex-col">
        <Link href="/" className="mb-7 flex items-center gap-3 rounded-xl px-2 py-1 text-white no-underline">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--orange)] text-sm font-black text-black">OI</span>
          <span>
            <span className="block text-sm font-black tracking-wide">OVERWATCH INSIGHT</span>
            <span className="mt-0.5 block text-[10px] text-[var(--muted)]">승패 요인 분석기 · v0.7</span>
          </span>
        </Link>

        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold no-underline transition ${
                  active
                    ? "bg-[var(--orange-soft)] text-[var(--orange)]"
                    : "text-[#aab3c2] hover:bg-[#151b27] hover:text-white"
                }`}
              >
                <span className="flex h-7 w-7 items-center justify-center text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
          <p className="m-0 text-xs font-bold text-white">사용자 A</p>
          <p className="mb-0 mt-1 text-[10px] text-[var(--muted)]">Mock backend 연결 중</p>
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--line)] bg-[#090c12]/90 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2 text-white no-underline">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--orange)] text-xs font-black text-black">OI</span>
          <span className="text-xs font-black">OVERWATCH INSIGHT</span>
        </Link>
        <div className="flex gap-1">
          <Link href="/matches/new" className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[10px] font-bold text-white no-underline">등록</Link>
          <Link href="/matches" className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[10px] font-bold text-white no-underline">목록</Link>
        </div>
      </header>

      <div className="min-h-screen">{children}</div>
    </div>
  );
}

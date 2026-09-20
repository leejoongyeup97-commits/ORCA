"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getStoredSession, getSupabaseConfig, signOut, type OrcaSession } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: "⌂", exact: true },
  { href: "/matches/new", label: "경기 등록", icon: "＋", exact: false },
  { href: "/matches", label: "경기 목록", icon: "☷", exact: true },
  { href: "/analysis", label: "분석", icon: "▥", exact: false },
  { href: "/insights", label: "인사이트", icon: "◉", exact: false },
  { href: "/hypotheses", label: "가설", icon: "△", exact: false },
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
  const router = useRouter();
  const [session, setSession] = useState<OrcaSession | null>(null);
  const config = getSupabaseConfig();

  useEffect(() => {
    setSession(getStoredSession());
  }, [pathname]);

  if (pathname === "/login") return <>{children}</>;

  async function handleSignOut() {
    await signOut();
    setSession(null);
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[#0a1119]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-[1600px] items-center gap-5 px-4 md:px-6">
          <Link href="/" className="flex min-w-fit items-center gap-3 text-white no-underline">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(255,139,61,0.35)] bg-[var(--orange-soft)] text-sm font-black text-[var(--orange)]">
              OR
            </span>
            <span className="leading-tight">
              <span className="block text-[17px] font-extrabold tracking-[0.02em]">ORCA</span>
              <span className="hidden text-[10px] text-[var(--muted)] lg:block">Overwatch Result Correlation Analysis</span>
            </span>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-[13px] font-semibold no-underline ${
                    active
                      ? "border-[rgba(255,107,26,0.42)] bg-[var(--orange-soft)] text-[var(--orange-2)]"
                      : "border-transparent text-[#aeb9c7] hover:bg-[#121b26] hover:text-white"
                  }`}
                >
                  <span className="text-sm">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="hidden rounded-lg border border-[var(--line)] bg-[#101823] px-3 py-2 text-[11px] text-[var(--muted)] xl:block">
              ● {session ? session.user.email : config.configured ? "로그인 필요" : "Mock mode"}
            </span>
            {session ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="cursor-pointer rounded-lg border border-[var(--line)] bg-[#121b26] px-3 py-2 text-[12px] font-semibold text-white hover:border-[#39495d]"
              >
                로그아웃
              </button>
            ) : (
              <Link
                href="/login"
                className="rounded-lg border border-[var(--line)] bg-[#121b26] px-3 py-2 text-[12px] font-semibold text-white no-underline hover:border-[#39495d]"
              >
                계정
              </Link>
            )}
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto border-t border-[var(--line-soft)] px-3 py-2 md:hidden">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-lg px-3 py-2 text-[12px] font-semibold no-underline ${
                  active ? "bg-[var(--orange-soft)] text-[var(--orange-2)]" : "text-[var(--muted)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="min-h-[calc(100vh-72px)]">{children}</div>
    </div>
  );
}

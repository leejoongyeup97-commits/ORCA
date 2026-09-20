"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getStoredSession, getSupabaseConfig, signOut, type OrcaSession } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: "⌂", exact: true },
  { href: "/matches/new", label: "경기 등록", icon: "＋", exact: false },
  { href: "/matches", label: "경기 목록", icon: "▤", exact: true },
  { href: "/analysis", label: "분석", icon: "◔", exact: false },
  { href: "/insights", label: "인사이트", icon: "✦", exact: false },
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
    <div className="min-h-screen md:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-[var(--line)] bg-[#0b0f16]/95 px-4 py-5 backdrop-blur md:flex md:flex-col">
        <Link href="/" className="mb-7 flex items-center gap-3 rounded-xl px-2 py-1 text-white no-underline">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--orange)] text-xs font-black text-black">OR</span>
          <span>
            <span className="block text-sm font-black tracking-[0.08em]">ORCA</span>
            <span className="mt-0.5 block text-[10px] text-[var(--muted)]">Overwatch Analytics · FE v0.12</span>
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
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${session ? "bg-[#8ee9aa]" : config.configured ? "bg-[#ffc779]" : "bg-[#667085]"}`} />
            <p className="m-0 min-w-0 flex-1 truncate text-xs font-bold text-white">
              {session?.user.email || (config.configured ? "로그인 필요" : "Mock mode")}
            </p>
          </div>
          <p className="mb-0 mt-1 text-[10px] text-[var(--muted)]">
            {session ? "Supabase auth session" : config.configured ? "Supabase 연결 준비됨" : "Local mock backend"}
          </p>
          {session ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="mt-3 w-full cursor-pointer rounded-lg border border-[var(--line)] bg-[#0d1118] px-3 py-2 text-[10px] font-bold text-white hover:border-[#4b5668]"
            >
              로그아웃
            </button>
          ) : (
            <Link
              href="/login"
              className="mt-3 block rounded-lg border border-[var(--line)] bg-[#0d1118] px-3 py-2 text-center text-[10px] font-bold text-white no-underline hover:border-[#4b5668]"
            >
              {config.configured ? "로그인" : "로그인 화면 보기"}
            </Link>
          )}
        </div>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[var(--line)] bg-[#090c12]/90 px-4 py-3 backdrop-blur md:hidden">
        <Link href="/" className="flex items-center gap-2 text-white no-underline">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--orange)] text-[10px] font-black text-black">OR</span>
          <span className="text-xs font-black tracking-[0.08em]">ORCA</span>
        </Link>
        <div className="flex gap-1">
          <Link href="/matches/new" className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[10px] font-bold text-white no-underline">등록</Link>
          <Link href="/matches" className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[10px] font-bold text-white no-underline">목록</Link>
          <Link href="/insights" className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[10px] font-bold text-white no-underline">인사이트</Link>
          <Link href="/login" className="rounded-lg border border-[var(--line)] px-2.5 py-1.5 text-[10px] font-bold text-white no-underline">계정</Link>
        </div>
      </header>

      <div className="min-h-screen">{children}</div>
    </div>
  );
}

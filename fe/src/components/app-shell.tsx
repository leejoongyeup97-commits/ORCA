"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getStoredSession, getSupabaseConfig, signOut, type OrcaSession } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", exact: true },
  { href: "/matches/new", label: "경기 등록", exact: false },
  { href: "/matches", label: "경기 목록", exact: true },
  { href: "/analysis", label: "분석", exact: false },
  { href: "/insights", label: "인사이트", exact: false },
  { href: "/hypotheses", label: "가설", exact: false },
  { href: "/settings", label: "설정", exact: false },
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 bg-white/80 text-[#171A20] backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-[1440px] items-center gap-4 px-4 md:px-8">
          <Link href="/" className="shrink-0 text-[#171A20] no-underline">
            <span className="block text-[17px] font-medium">ORCA</span>
            <span className="hidden text-[10px] font-normal text-[#5C5E62] lg:block">
              Overwatch Result Correlation Analysis
            </span>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-[4px] px-3 py-2 text-[13px] font-medium no-underline ${
                    active
                      ? "bg-[#F4F4F4] text-[#171A20]"
                      : "text-[#393C41] hover:bg-[#F4F4F4] hover:text-[#171A20]"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="hidden max-w-44 truncate text-[11px] text-[#5C5E62] xl:block">
              {session?.user.email || (config.configured ? "로그인 필요" : "Mock mode")}
            </span>
            {session ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="cursor-pointer rounded-[4px] bg-[#F4F4F4] px-3 py-2 text-[12px] font-medium text-[#393C41] hover:bg-[#EEEEEE]"
              >
                로그아웃
              </button>
            ) : (
              <Link
                href="/login"
                className="rounded-[4px] bg-[#F4F4F4] px-3 py-2 text-[12px] font-medium text-[#393C41] no-underline hover:bg-[#EEEEEE]"
              >
                {config.configured ? "로그인" : "계정"}
              </Link>
            )}
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-4 pb-3 md:hidden">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-[4px] px-3 py-2 text-[12px] font-medium no-underline ${
                  active ? "bg-[#F4F4F4] text-[#171A20]" : "text-[#5C5E62]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="min-h-screen">{children}</div>
    </div>
  );
}

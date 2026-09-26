"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { getStoredSession, getSupabaseConfig, signOut, type OrcaSession } from "@/lib/auth";

type NavIconName = "home" | "plus" | "list" | "chart" | "insight" | "hypothesis" | "settings";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: "home", exact: true },
  { href: "/matches/new", label: "경기 등록", icon: "plus", exact: false },
  { href: "/matches", label: "경기 목록", icon: "list", exact: true },
  { href: "/analysis", label: "분석", icon: "chart", exact: false },
  { href: "/insights", label: "인사이트", icon: "insight", exact: false },
  { href: "/hypotheses", label: "가설", icon: "hypothesis", exact: false },
  { href: "/settings", label: "설정", icon: "settings", exact: false },
] as const satisfies ReadonlyArray<{ href: string; label: string; icon: NavIconName; exact: boolean }>;

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
      <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--bg)]/96 backdrop-blur">
        <div className="mx-auto flex h-[60px] max-w-[1600px] items-center gap-6 px-4 md:px-6">
          <Link href="/" className="flex min-w-fit items-center gap-3 text-white no-underline">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--line)] bg-[#111214] text-[12px] font-semibold tracking-[0.04em] text-[var(--orange-2)]">
              OR
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold tracking-[0.02em]">ORCA</span>
              <span className="hidden text-[11px] text-[#70747d] lg:block">Overwatch Result Correlation Analysis</span>
            </span>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 md:flex">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`group flex h-9 items-center gap-2 rounded-md border px-3 text-[12px] font-medium no-underline transition-colors ${
                    active
                      ? "border-[#34373d] bg-[#17181b] text-white"
                      : "border-transparent text-[#858992] hover:bg-[#121316] hover:text-[#d8dade]"
                  }`}
                >
                  <NavIcon
                    name={item.icon}
                    className={active ? "text-[#cfd2d8]" : "text-[#747983] group-hover:text-[#aeb2bb]"}
                  />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-2 px-1 text-[11px] text-[#737780] xl:flex">
              <span className={`h-1.5 w-1.5 rounded-full ${session ? "bg-[#7fbf95]" : config.configured ? "bg-[#c6a15b]" : "bg-[#666a73]"}`} />
              {session ? session.user.email : config.configured ? "로그인 필요" : "Mock mode"}
            </span>

            {session ? (
              <button
                type="button"
                onClick={handleSignOut}
                className="cursor-pointer rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[11px] font-medium text-[#c7c9ce] hover:bg-[#151619] hover:text-white"
              >
                로그아웃
              </button>
            ) : (
              <Link
                href="/login"
                className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[11px] font-medium text-[#c7c9ce] no-underline hover:bg-[#151619] hover:text-white"
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
                className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-[11px] font-medium no-underline ${
                  active ? "bg-[#17181b] text-white" : "text-[var(--muted)]"
                }`}
              >
                <NavIcon name={item.icon} className={active ? "text-[#cfd2d8]" : "text-[#747983]"} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="min-h-[calc(100vh-60px)]">{children}</div>
    </div>
  );
}

function NavIcon({ name, className = "" }: { name: NavIconName; className?: string }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };

  if (name === "home") {
    return (
      <svg {...common}>
        <path d="M4 10.5 12 4l8 6.5" />
        <path d="M6.5 9.5V20h11V9.5" />
        <path d="M10 20v-6h4v6" />
      </svg>
    );
  }

  if (name === "plus") {
    return (
      <svg {...common}>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </svg>
    );
  }

  if (name === "list") {
    return (
      <svg {...common}>
        <path d="M9 6h10" />
        <path d="M9 12h10" />
        <path d="M9 18h10" />
        <path d="M5 6h.01" />
        <path d="M5 12h.01" />
        <path d="M5 18h.01" />
      </svg>
    );
  }

  if (name === "chart") {
    return (
      <svg {...common}>
        <path d="M5 19V9" />
        <path d="M10 19V5" />
        <path d="M15 19v-7" />
        <path d="M20 19V8" />
      </svg>
    );
  }

  if (name === "insight") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M9 13.5 11 11l2 1.5 3-4" />
      </svg>
    );
  }

  if (name === "hypothesis") {
    return (
      <svg {...common}>
        <path d="M9 3h6" />
        <path d="M10 3v5l-5 9a2.5 2.5 0 0 0 2.2 3.7h9.6A2.5 2.5 0 0 0 19 17l-5-9V3" />
        <path d="M8 14h8" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.22.37.35.8.4 1.23V10h1v4h-.09A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  );
}

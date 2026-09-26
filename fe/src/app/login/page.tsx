"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseConfig, signInWithPassword } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const config = useMemo(() => getSupabaseConfig(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      await signInWithPassword(email, password);
      router.push("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="grid w-full max-w-[820px] overflow-hidden rounded-md border border-[var(--line)] bg-[var(--bg)] lg:grid-cols-[0.9fr_1.1fr]">
        <section className="hidden border-r border-[var(--line)] p-8 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--line)] bg-[#151619] text-xs font-semibold text-[var(--orange-2)]">
              OR
            </div>
            <p className="mb-0 mt-5 text-[11px] font-medium tracking-[0.16em] text-[var(--muted)]">ORCA</p>
            <h1 className="mt-2 text-[24px] font-semibold tracking-[-0.03em] text-white">
              Overwatch Result Correlation Analysis
            </h1>
            <p className="mt-3 max-w-sm text-[12px] leading-6 text-[var(--muted)]">
              경기 캡처부터 OCR 검수와 분석까지 한 흐름으로 관리합니다.
            </p>
          </div>

          <div className="border-t border-[var(--line)] pt-4">
            <p className="m-0 text-[11px] leading-5 text-[var(--muted)]">
              개발 버전 · Frontend v0.12
            </p>
          </div>
        </section>

        <form onSubmit={login} className="p-6 sm:p-9">
          <div className="mb-7 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--line)] bg-[#151619] text-xs font-semibold text-[var(--orange-2)]">
              OR
            </div>
          </div>

          <p className="m-0 text-[11px] font-medium tracking-[0.16em] text-[var(--muted)]">ORCA ACCOUNT</p>
          <h2 className="mb-0 mt-2 text-[24px] font-semibold text-white">로그인</h2>
          <p className="mt-2 text-[12px] leading-5 text-[var(--muted)]">
            {config.configured ? "Supabase 계정으로 로그인합니다." : "현재는 Mock 모드로 사용할 수 있습니다."}
          </p>

          <label className="mt-7 block">
            <span className="mb-2 block text-[11px] font-medium text-[var(--muted)]">이메일</span>
            <input
              className="field-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="email@example.com"
              required
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-[11px] font-medium text-[var(--muted)]">비밀번호</span>
            <input
              className="field-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              required
            />
          </label>

          <button
            className="app-orange-button mt-5 w-full"
            disabled={loading || !config.configured}
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>

          {!config.configured && (
            <button
              type="button"
              onClick={() => router.push("/")}
              className="app-secondary-button mt-2 w-full cursor-pointer"
            >
              Mock 모드로 계속
            </button>
          )}

          {message && (
            <p className="mt-4 border-y border-[#4b2f33] py-3 text-[11px] text-[#d98b91]">
              {message}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}

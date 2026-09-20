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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(249,158,26,0.12),transparent_34rem)]" />

      <div className="relative grid w-full max-w-[920px] overflow-hidden rounded-3xl border border-[var(--line)] bg-[#0d1118]/95 shadow-2xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden border-r border-[var(--line)] bg-[#0a0e15] p-10 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--orange)] text-sm font-black text-black">OR</div>
            <p className="mb-0 mt-6 text-xs font-black tracking-[0.22em] text-[var(--orange)]">ORCA</p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-white">Overwatch Research & Competitive Analytics</h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-[var(--muted)]">
              경기 캡처부터 OCR 검수, 승패 요인 분석까지 한 흐름으로 관리합니다.
            </p>
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <p className="m-0 text-xs font-bold text-white">Merged frontend</p>
            <p className="mb-0 mt-1 text-[10px] leading-5 text-[var(--muted)]">
              기존 ORCA 로그인 흐름과 현재 대시보드, CRUD, 분석 UI를 하나로 합친 개발 버전입니다.
            </p>
          </div>
        </section>

        <form onSubmit={login} className="p-6 sm:p-9">
          <div className="mb-7 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--orange)] text-xs font-black text-black">OR</div>
          </div>

          <p className="m-0 text-xs font-black tracking-[0.18em] text-[var(--orange)]">ORCA ACCOUNT</p>
          <h2 className="mb-0 mt-2 text-2xl font-black text-white">로그인</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {config.configured ? "Supabase 계정으로 로그인합니다." : "Supabase 환경변수가 없어서 현재는 Mock 모드로 사용할 수 있습니다."}
          </p>

          <label className="mt-7 block">
            <span className="mb-2 block text-[11px] font-bold text-[var(--muted)]">이메일</span>
            <input className="field-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@example.com" required />
          </label>

          <label className="mt-4 block">
            <span className="mb-2 block text-[11px] font-bold text-[var(--muted)]">비밀번호</span>
            <input className="field-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" required />
          </label>

          <button
            className="mt-5 w-full rounded-xl bg-[var(--orange)] px-4 py-3 text-sm font-black text-black transition enabled:cursor-pointer enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={loading || !config.configured}
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>

          {!config.configured && (
            <button
              type="button"
              onClick={() => router.push("/")}
              className="mt-2 w-full cursor-pointer rounded-xl border border-[var(--line)] bg-[#121823] px-4 py-3 text-sm font-bold text-white hover:border-[#4b5668]"
            >
              Mock 모드로 계속
            </button>
          )}

          {message && <p className="mt-4 rounded-lg border border-[#503336] bg-[#241216] px-3 py-2.5 text-xs text-[#ff9b9b]">{message}</p>}

          <div className="mt-7 border-t border-[var(--line)] pt-4">
            <p className="m-0 text-[10px] leading-5 text-[var(--muted)]">
              실제 백엔드 인증 방식이 확정되면 이 화면은 Auth Adapter에 연결합니다. 지금은 여자친구 버전의 Supabase 로그인 구조를 유지한 임시 브리지입니다.
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getMatchBackendAdapter, type MatchImportStatus, type MatchListItem } from "@/lib/backend";

const STATUS_LABELS: Record<MatchImportStatus, string> = {
  awaiting_upload: "업로드 대기",
  pending_ocr: "OCR 대기",
  processing_ocr: "OCR 처리 중",
  needs_review: "검수 필요",
  confirmed: "완료",
  failed: "오류",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export default function DashboardPage() {
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getMatchBackendAdapter()
      .listMatchImports()
      .then((items) => {
        if (mounted) setMatches(items);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const needsAction = matches.filter((m) => m.status === "needs_review" || m.status === "failed").length;
    const ocr = matches.filter((m) => m.status === "pending_ocr" || m.status === "processing_ocr").length;
    const confirmed = matches.filter((m) => m.status === "confirmed").length;
    return { total: matches.length, needsAction, ocr, confirmed };
  }, [matches]);

  const recent = matches.slice(0, 5);

  return (
    <main className="min-h-screen px-5 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1240px]">
        <section className="mb-7 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--orange)]">대시보드</p>
            <h1 className="m-0 text-3xl font-bold tracking-[-0.03em] md:text-4xl">오늘의 경기 데이터를 확인합니다</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              등록부터 OCR, 검수, 분석 준비 상태까지 한 화면에서 확인할 수 있습니다.
            </p>
          </div>
          <Link
            href="/matches/new"
            className="w-fit rounded-xl bg-[var(--orange)] px-5 py-3 text-sm font-black text-black no-underline transition hover:brightness-110"
          >
            + 새 경기 등록
          </Link>
        </section>

        <section className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard label="전체 경기" value={stats.total} />
          <MetricCard label="확인 필요" value={stats.needsAction} warning={stats.needsAction > 0} />
          <MetricCard label="OCR 대기/처리" value={stats.ocr} />
          <MetricCard label="분석 가능" value={stats.confirmed} accent />
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.45fr_0.75fr]">
          <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
              <div>
                <p className="m-0 text-sm font-bold">최근 경기</p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">가장 최근에 등록한 경기 5건</p>
              </div>
              <Link href="/matches" className="text-xs font-bold text-[#9bbcff] no-underline hover:text-white">전체 보기 →</Link>
            </div>

            {loading ? (
              <div className="px-5 py-12 text-center text-sm text-[var(--muted)]">불러오는 중...</div>
            ) : recent.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <p className="m-0 text-sm font-bold">아직 등록된 경기가 없습니다</p>
                <p className="mt-2 text-xs text-[var(--muted)]">첫 경기를 등록하면 최근 경기와 상태가 여기에 표시됩니다.</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--line)]">
                {recent.map((match) => (
                  <div key={match.match_id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="m-0 text-sm font-bold text-white">{formatDate(match.detected_at)}</p>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">
                        이미지 {match.files.length}장 · {match.match_id.slice(0, 12)}...
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full border border-[var(--line)] bg-[#0d1118] px-2.5 py-1 text-[10px] font-bold text-[var(--muted)]">
                        {STATUS_LABELS[match.status]}
                      </span>
                      <span className="text-[10px] text-[var(--muted)]">
                        {match.status === "confirmed" ? "분석 가능" : "처리 진행 중"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
              <p className="m-0 text-sm font-bold">빠른 이동</p>
              <div className="mt-4 space-y-2">
                <QuickLink href="/matches/new" title="경기 등록" text="새 스크린샷 자동 분류" />
                <QuickLink href="/matches" title="경기 목록" text="OCR 및 검수 상태 확인" />
                <QuickLink href="/analysis" title="분석" text="확정 경기 기반 분석" />
              </div>
            </section>

            <section className="rounded-2xl border border-[rgba(102,169,255,0.25)] bg-[rgba(102,169,255,0.06)] p-5">
              <p className="m-0 text-sm font-bold text-[#9bc6ff]">현재 개발 상태</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                경기 등록과 Mock 업로드 흐름이 연결되어 있습니다. 다음 단계에서 OCR 결과 검수 화면을 붙입니다.
              </p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function MetricCard({ label, value, accent = false, warning = false }: { label: string; value: number; accent?: boolean; warning?: boolean }) {
  const valueClass = warning ? "text-[#ffb45f]" : accent ? "text-[#8ee9aa]" : "text-white";
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 md:p-5">
      <p className="m-0 text-[11px] text-[var(--muted)]">{label}</p>
      <p className={`mb-0 mt-2 text-3xl font-black ${valueClass}`}>{value}</p>
    </div>
  );
}

function QuickLink({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link href={href} className="block rounded-xl border border-[var(--line)] bg-[#0d1118] px-3.5 py-3 no-underline transition hover:border-[#465064] hover:bg-[#141a25]">
      <span className="block text-xs font-bold text-white">{title}</span>
      <span className="mt-1 block text-[10px] text-[var(--muted)]">{text}</span>
    </Link>
  );
}

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
    const confirmedMatches = matches.filter((m) => m.status === "confirmed");
    const decided = confirmedMatches.filter((m) => m.editable.result === "win" || m.editable.result === "loss");
    const wins = decided.filter((m) => m.editable.result === "win").length;
    const winRate = decided.length > 0 ? Math.round((wins / decided.length) * 100) : null;

    return {
      total: matches.length,
      needsAction,
      ocr,
      confirmed: confirmedMatches.length,
      winRate,
    };
  }, [matches]);

  const recent = matches.slice(0, 6);

  return (
    <main className="min-h-screen px-4 py-7 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1320px]">
        <section className="flex flex-col gap-5 border-b border-[var(--line)] pb-7 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">Overview</p>
            <h1 className="m-0 text-[28px] font-semibold tracking-[-0.03em] text-white md:text-[32px]">대시보드</h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-6 text-[var(--muted)]">
              경기 수집, 검수, 분석 준비 상태를 한곳에서 확인합니다.
            </p>
          </div>
          <Link
            href="/matches/new"
            className="app-orange-button w-fit"
          >
            새 경기 등록
          </Link>
        </section>

        <section className="grid grid-cols-2 border-b border-[var(--line)] md:grid-cols-5">
          <Stat label="전체 경기" value={String(stats.total)} />
          <Stat label="확인 필요" value={String(stats.needsAction)} tone={stats.needsAction > 0 ? "warning" : "default"} />
          <Stat label="OCR 처리" value={String(stats.ocr)} />
          <Stat label="분석 가능" value={String(stats.confirmed)} />
          <Stat label="확정 승률" value={stats.winRate === null ? "-" : `${stats.winRate}%`} />
        </section>

        <div className="grid gap-8 pt-8 xl:grid-cols-[1fr_300px]">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="m-0 text-[14px] font-semibold text-white">최근 경기</h2>
                <p className="mt-1 text-[11px] text-[var(--muted)]">최근 등록된 경기 6건</p>
              </div>
              <Link href="/matches" className="text-[11px] font-medium text-[var(--muted)] no-underline hover:text-white">
                전체 보기
              </Link>
            </div>

            <div className="overflow-hidden border-y border-[var(--line)]">
              {loading ? (
                <div className="py-14 text-center text-[12px] text-[var(--muted)]">불러오는 중...</div>
              ) : recent.length === 0 ? (
                <div className="py-14 text-center">
                  <p className="m-0 text-[13px] font-medium text-white">아직 등록된 경기가 없습니다</p>
                  <p className="mt-2 text-[11px] text-[var(--muted)]">첫 경기를 등록하면 여기에 표시됩니다.</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--line-soft)]">
                  {recent.map((match) => (
                    <Link
                      key={match.match_id}
                      href={`/matches/${match.match_id}`}
                      className="grid gap-3 px-1 py-3.5 text-white no-underline hover:bg-[#101114] sm:grid-cols-[128px_1fr_120px] sm:items-center sm:px-2"
                    >
                      <span className="text-[12px] text-[#c8cad0]">
                        {formatDate(match.editable.played_at || match.detected_at)}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium text-white">
                          {match.editable.map_name || "맵 미확인"}
                        </span>
                        <span className="mt-1 block truncate text-[10px] text-[var(--muted)]">
                          {match.editable.my_hero || "영웅 미확인"} · 이미지 {match.files.length}장
                        </span>
                      </span>
                      <span className="text-left text-[11px] text-[var(--muted)] sm:text-right">
                        {STATUS_LABELS[match.status]}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-7">
            <section>
              <h2 className="m-0 text-[14px] font-semibold text-white">확인 필요</h2>
              <div className="mt-3 border-t border-[var(--line)]">
                <InfoRow label="검수 또는 오류" value={stats.needsAction} emphasize={stats.needsAction > 0} />
                <InfoRow label="OCR 처리 중" value={stats.ocr} />
              </div>
            </section>

            <section>
              <h2 className="m-0 text-[14px] font-semibold text-white">바로가기</h2>
              <div className="mt-3 border-t border-[var(--line)]">
                <SimpleLink href="/matches">경기 목록</SimpleLink>
                <SimpleLink href="/analysis">분석</SimpleLink>
                <SimpleLink href="/insights">인사이트</SimpleLink>
                <SimpleLink href="/hypotheses">가설</SimpleLink>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "warning" }) {
  return (
    <div className="border-r border-[var(--line)] px-3 py-5 first:pl-0 last:border-r-0 md:px-5">
      <p className="m-0 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">{label}</p>
      <p className={`mb-0 mt-2 text-[24px] font-semibold tracking-[-0.03em] ${tone === "warning" ? "text-[var(--warning)]" : "text-white"}`}>
        {value}
      </p>
    </div>
  );
}

function InfoRow({ label, value, emphasize = false }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-[var(--line-soft)] py-3 text-[12px]">
      <span className="text-[var(--muted)]">{label}</span>
      <span className={emphasize ? "font-semibold text-[var(--warning)]" : "font-medium text-white"}>{value}</span>
    </div>
  );
}

function SimpleLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between border-b border-[var(--line-soft)] py-3 text-[12px] text-[#c8cad0] no-underline hover:text-white"
    >
      <span>{children}</span>
      <span className="text-[var(--muted)]">→</span>
    </Link>
  );
}

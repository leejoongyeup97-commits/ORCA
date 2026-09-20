"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getMatchBackendAdapter, type MatchImportStatus, type MatchListItem } from "@/lib/backend";
import { PREDEFINED_HYPOTHESIS_COUNT } from "@/lib/hypothesis-library";

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
    return { total: matches.length, needsAction, ocr, confirmed: confirmedMatches.length, winRate };
  }, [matches]);

  const recent = matches.slice(0, 5);

  return (
    <main className="min-h-screen px-4 py-5 md:px-6 md:py-6">
      <div className="mx-auto max-w-[1540px]">
        <section className="relative overflow-hidden rounded-[18px] border border-[var(--line)] bg-[#0f1721] px-5 py-7 shadow-[0_24px_60px_rgba(0,0,0,0.2)] md:px-8 md:py-9">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute right-[-8%] top-[-38%] h-[420px] w-[420px] rounded-full bg-[rgba(255,107,26,0.15)] blur-3xl" />
            <div className="absolute right-[14%] top-[18%] h-[180px] w-[180px] rounded-full bg-[rgba(255,139,61,0.08)] blur-2xl" />
          </div>

          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-3">
                <span className="text-[12px] font-bold text-[var(--orange-2)]">대시보드</span>
                <span className="h-px w-10 bg-[var(--orange)]" />
              </div>
              <h1 className="m-0 max-w-3xl text-3xl font-extrabold leading-[1.18] text-white md:text-[42px]">
                경기 수집부터 <span className="text-[var(--orange-2)]">분석 준비까지</span>
              </h1>
              <p className="mt-4 max-w-2xl text-[14px] leading-6 text-[var(--muted)]">
                등록, OCR, 검수, 확정 상태를 한 화면에서 확인하고 다음 작업으로 바로 이동합니다.
              </p>
            </div>

            <Link
              href="/matches/new"
              className="app-orange-button inline-flex w-fit items-center justify-center rounded-xl px-6 py-3.5 text-[14px] font-extrabold no-underline"
            >
              + 새 경기 등록
            </Link>
          </div>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <MetricCard icon="☷" label="전체 경기" value={String(stats.total)} note="등록된 모든 경기" />
          <MetricCard icon="◷" label="확인 필요" value={String(stats.needsAction)} note="검수가 필요한 경기" warning={stats.needsAction > 0} />
          <MetricCard icon="▤" label="OCR 대기/처리" value={String(stats.ocr)} note="OCR 처리 중인 경기" />
          <MetricCard icon="▥" label="분석 가능" value={String(stats.confirmed)} note="분석할 수 있는 경기" accent />
          <MetricCard icon="♜" label="확정 승률" value={stats.winRate === null ? "-" : `${stats.winRate}%`} note="확정 경기 기준" />
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[1.6fr_0.8fr]">
          <section className="app-panel overflow-hidden rounded-[16px]">
            <div className="flex items-center justify-between border-b border-[var(--line-soft)] px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--orange-soft)] text-[var(--orange-2)]">◷</span>
                <div>
                  <p className="m-0 text-[15px] font-bold text-white">최근 경기</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">가장 최근에 등록한 경기 5건</p>
                </div>
              </div>
              <Link href="/matches" className="text-[11px] font-bold text-[var(--orange-2)] no-underline hover:text-white">전체 보기 →</Link>
            </div>

            {loading ? (
              <div className="px-5 py-16 text-center text-sm text-[var(--muted)]">불러오는 중...</div>
            ) : recent.length === 0 ? (
              <div className="flex min-h-[360px] flex-col items-center justify-center px-5 py-12 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[rgba(255,107,26,0.24)] bg-[var(--orange-soft)] text-2xl text-[var(--orange-2)]">☷</span>
                <p className="mb-0 mt-5 text-[15px] font-bold text-white">아직 등록된 경기가 없습니다</p>
                <p className="mt-2 text-xs text-[var(--muted)]">첫 경기를 등록하면 최근 경기와 상태가 여기에 표시됩니다.</p>
                <Link href="/matches/new" className="app-orange-button mt-5 rounded-xl px-5 py-3 text-xs font-bold no-underline">
                  + 새 경기 등록하기
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-[var(--line-soft)]">
                {recent.map((match) => (
                  <Link
                    key={match.match_id}
                    href={`/matches/${match.match_id}`}
                    className="flex flex-col gap-3 px-5 py-4 text-white no-underline hover:bg-[#151f2b] sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="m-0 text-sm font-semibold">{formatDate(match.editable.played_at || match.detected_at)}</p>
                        <span className="text-xs font-bold text-[var(--blue)]">{match.editable.map_name || "맵 미확인"}</span>
                        {match.editable.my_hero && <span className="text-[10px] text-[var(--muted)]">{match.editable.my_hero}</span>}
                      </div>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">이미지 {match.files.length}장 · {match.match_id.slice(0, 12)}...</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg border border-[var(--line)] bg-[#0c131c] px-2.5 py-1.5 text-[10px] font-bold text-[var(--muted)]">
                        {STATUS_LABELS[match.status]}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <section className="app-panel rounded-[16px] p-4">
              <div className="mb-4 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--orange-soft)] text-[var(--orange-2)]">ϟ</span>
                <div>
                  <p className="m-0 text-[15px] font-bold text-white">빠른 이동</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">주요 기능으로 바로 이동</p>
                </div>
              </div>

              <div className="space-y-2">
                <QuickLink href="/matches/new" icon="＋" title="경기 등록" text="새 스크린샷 자동 분류" />
                <QuickLink href="/matches" icon="☷" title="경기 목록" text="상세 · 수정 · 삭제 · OCR 검수" />
                <QuickLink href="/analysis" icon="▥" title="분석" text="확정 경기 기반 기초 분석" />
                <QuickLink href="/insights" icon="◉" title="인사이트" text="최근 변화와 다음 검증 포인트" />
                <QuickLink href="/hypotheses" icon="△" title="가설" text={`사전 가설 Library ${PREDEFINED_HYPOTHESIS_COUNT}개`} />
              </div>
            </section>

            <section className="app-panel rounded-[16px] p-4">
              <p className="m-0 text-[14px] font-bold text-white">ORCA 파이프라인</p>
              <div className="mt-4 space-y-2">
                <PipelineStep label="1. 스크린샷 수집 / 분류" state="done" />
                <PipelineStep label="2. 업로드 / 저장" state="mock" />
                <PipelineStep label="3. OCR 구조화" state="mock" />
                <PipelineStep label="4. 사용자 검수" state="done" />
                <PipelineStep label="5. 분석 / 가설 검증" state="partial" />
                <PipelineStep label="6. AI 인사이트" state="partial" />
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function MetricCard({
  icon,
  label,
  value,
  note,
  accent = false,
  warning = false,
}: {
  icon: string;
  label: string;
  value: string;
  note: string;
  accent?: boolean;
  warning?: boolean;
}) {
  const valueClass = warning ? "text-[var(--warning)]" : accent ? "text-[var(--blue)]" : "text-white";
  return (
    <div className="app-panel rounded-[14px] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--line)] bg-[#17212d] text-[16px] text-[#c7d1dd]">{icon}</span>
        <div className="min-w-0">
          <p className="m-0 text-[11px] font-semibold text-[var(--muted)]">{label}</p>
          <p className={`mb-0 mt-1 text-3xl font-extrabold ${valueClass}`}>{value}</p>
          <p className="mb-0 mt-2 truncate text-[10px] text-[#718096]">{note}</p>
        </div>
      </div>
    </div>
  );
}

function PipelineStep({ label, state }: { label: string; state: "done" | "mock" | "partial" }) {
  const meta = {
    done: { text: "FE 완료", className: "text-[var(--green)]" },
    mock: { text: "Mock", className: "text-[var(--blue)]" },
    partial: { text: "준비 중", className: "text-[var(--warning)]" },
  }[state];

  return (
    <div className="app-panel-soft flex items-center justify-between gap-3 rounded-lg px-3 py-2.5">
      <span className="text-[10px] font-semibold text-white">{label}</span>
      <span className={`text-[9px] font-extrabold ${meta.className}`}>{meta.text}</span>
    </div>
  );
}

function QuickLink({ href, icon, title, text }: { href: string; icon: string; title: string; text: string }) {
  return (
    <Link href={href} className="app-panel-soft flex items-center gap-3 rounded-xl px-3 py-3 no-underline hover:border-[#3a4b60] hover:bg-[#16212d]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#182331] text-[var(--orange-2)]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-white">{title}</span>
        <span className="mt-1 block truncate text-[10px] text-[var(--muted)]">{text}</span>
      </span>
      <span className="text-[var(--muted)]">›</span>
    </Link>
  );
}

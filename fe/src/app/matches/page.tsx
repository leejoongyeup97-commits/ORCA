"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getMatchBackendAdapter, type MatchImportStatus, type MatchListItem } from "@/lib/backend";

const STATUS_META: Record<MatchImportStatus, { label: string; className: string }> = {
  awaiting_upload: { label: "업로드 대기", className: "bg-[rgba(249,158,26,0.12)] text-[var(--orange)]" },
  pending_ocr: { label: "OCR 대기", className: "bg-[rgba(102,169,255,0.14)] text-[#8fc1ff]" },
  processing_ocr: { label: "OCR 처리 중", className: "bg-[rgba(198,145,255,0.13)] text-[#d0a9ff]" },
  needs_review: { label: "검수 필요", className: "bg-[rgba(255,184,92,0.14)] text-[#ffc779]" },
  confirmed: { label: "완료", className: "bg-[rgba(121,227,156,0.12)] text-[#8ee9aa]" },
  failed: { label: "오류", className: "bg-[rgba(255,113,113,0.12)] text-[#ff9b9b]" },
};

type FilterKey = "all" | "action" | MatchImportStatus;

function formatDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function countType(match: MatchListItem, type: string) {
  return match.files.filter((file) => file.screen_type === type).length;
}

function MatchStatus({ status }: { status: MatchImportStatus }) {
  const meta = STATUS_META[status];
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${meta.className}`}>{meta.label}</span>;
}

export default function MatchesPage() {
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");

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

  const visible = useMemo(() => {
    if (filter === "all") return matches;
    if (filter === "action") return matches.filter((match) => match.status === "needs_review" || match.status === "failed");
    return matches.filter((match) => match.status === filter);
  }, [filter, matches]);

  const actionCount = matches.filter((match) => match.status === "needs_review" || match.status === "failed").length;

  return (
    <main className="min-h-screen px-5 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1240px]">
        <section className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--orange)]">경기 데이터</p>
            <h1 className="m-0 text-3xl font-bold tracking-[-0.03em] md:text-4xl">경기 목록</h1>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              등록한 경기의 업로드, OCR, 검수 상태를 한곳에서 확인합니다.
            </p>
          </div>
          <Link
            href="/matches/new"
            className="w-fit rounded-xl bg-[var(--orange)] px-5 py-3 text-sm font-black text-black no-underline transition hover:brightness-110"
          >
            + 경기 등록
          </Link>
        </section>

        <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryCard label="전체 경기" value={matches.length} />
          <SummaryCard label="확인 필요" value={actionCount} warning={actionCount > 0} />
          <SummaryCard label="OCR 대기/처리" value={matches.filter((m) => m.status === "pending_ocr" || m.status === "processing_ocr").length} />
          <SummaryCard label="확정 완료" value={matches.filter((m) => m.status === "confirmed").length} accent />
        </section>

        <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex flex-col gap-3 border-b border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-2">
              <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>전체 {matches.length}</FilterButton>
              <FilterButton active={filter === "action"} onClick={() => setFilter("action")}>확인 필요 {actionCount}</FilterButton>
              <FilterButton active={filter === "pending_ocr"} onClick={() => setFilter("pending_ocr")}>OCR 대기</FilterButton>
              <FilterButton active={filter === "confirmed"} onClick={() => setFilter("confirmed")}>완료</FilterButton>
            </div>
            <span className="text-xs text-[var(--muted)]">Mock 데이터 기준</span>
          </div>

          {loading ? (
            <div className="px-6 py-16 text-center text-sm text-[var(--muted)]">경기 목록을 불러오는 중...</div>
          ) : visible.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="m-0 text-sm font-bold text-white">표시할 경기가 없습니다</p>
              <p className="mt-2 text-xs text-[var(--muted)]">
                경기 등록에서 검수 완료 후 Mock 업로드까지 진행하면 여기에 나타납니다.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--line)]">
              {visible.map((match) => {
                const summary = countType(match, "summary");
                const team = countType(match, "team");
                const personal = countType(match, "personal");
                const replay = countType(match, "replay");
                return (
                  <article key={match.match_id} className="grid gap-4 px-5 py-4 transition hover:bg-[#141a25] lg:grid-cols-[170px_120px_1fr_210px] lg:items-center">
                    <div>
                      <p className="m-0 text-sm font-bold text-white">{formatDate(match.detected_at)}</p>
                      <p className="mt-1 truncate text-[10px] text-[var(--muted)]">{match.match_id.slice(0, 18)}...</p>
                    </div>

                    <div>
                      <MatchStatus status={match.status} />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                      <DataChip label="요약" value={summary} />
                      <DataChip label="팀" value={team} />
                      <DataChip label="개인" value={personal} />
                      <DataChip label="리플레이" value={replay} />
                    </div>

                    <div className="flex items-center justify-between gap-3 lg:justify-end">
                      <div className="text-right">
                        <p className="m-0 text-xs font-bold text-white">{match.files.length}장</p>
                        <p className="mt-1 text-[10px] text-[var(--muted)]">
                          {match.status === "confirmed" ? "분석 데이터 사용 가능" : "맵 · 승패 · 영웅은 OCR 후 표시"}
                        </p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ label, value, accent = false, warning = false }: { label: string; value: number; accent?: boolean; warning?: boolean }) {
  const valueClass = warning ? "text-[#ffb45f]" : accent ? "text-[#8ee9aa]" : "text-white";
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <p className="m-0 text-[11px] text-[var(--muted)]">{label}</p>
      <p className={`mb-0 mt-2 text-2xl font-black ${valueClass}`}>{value}</p>
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-bold transition ${
        active
          ? "border-[rgba(249,158,26,0.45)] bg-[var(--orange-soft)] text-[var(--orange)]"
          : "border-[var(--line)] bg-[#0d1118] text-[var(--muted)] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function DataChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[#0d1118] px-2.5 py-2">
      <span className="text-[10px] text-[var(--muted)]">{label}</span>
      <strong className="ml-2 text-white">{value}</strong>
    </div>
  );
}

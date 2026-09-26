"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getMatchBackendAdapter,
  type MatchImportStatus,
  type MatchListItem,
  type MatchResult,
} from "@/lib/backend";
import { removeReviewDraft } from "@/lib/review-draft";

const STATUS_META: Record<MatchImportStatus, { label: string; className: string }> = {
  awaiting_upload: { label: "업로드 대기", className: "bg-[rgba(249,158,26,0.12)] text-[var(--orange)]" },
  pending_ocr: { label: "OCR 대기", className: "bg-[rgba(102,169,255,0.14)] text-[#8fc1ff]" },
  processing_ocr: { label: "OCR 처리 중", className: "bg-[rgba(198,145,255,0.13)] text-[#d0a9ff]" },
  needs_review: { label: "검수 필요", className: "bg-[rgba(255,184,92,0.14)] text-[#ffc779]" },
  confirmed: { label: "완료", className: "bg-[rgba(121,227,156,0.12)] text-[#8ee9aa]" },
  failed: { label: "오류", className: "bg-[rgba(255,113,113,0.12)] text-[#ff9b9b]" },
};

const RESULT_META: Record<MatchResult, { label: string; className: string }> = {
  win: { label: "승리", className: "text-[#8ee9aa]" },
  loss: { label: "패배", className: "text-[#ff9b9b]" },
  draw: { label: "무승부", className: "text-[#d0a9ff]" },
  unknown: { label: "미확인", className: "text-[var(--muted)]" },
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
  return <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${meta.className}`}>{meta.label}</span>;
}

export default function MatchesPage() {
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [seasonFilter, setSeasonFilter] = useState("all");
  const [patchFilter, setPatchFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

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

  const actionCount = matches.filter((match) => match.status === "needs_review" || match.status === "failed").length;

  const seasonOptions = useMemo(
    () => Array.from(new Set(matches.map((match) => match.editable.season).filter(Boolean))).sort(),
    [matches],
  );
  const patchOptions = useMemo(
    () => Array.from(new Set(matches.map((match) => match.editable.patch_label).filter(Boolean))).sort().reverse(),
    [matches],
  );

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return matches.filter((match) => {
      const filterOk =
        filter === "all"
          ? true
          : filter === "action"
            ? match.status === "needs_review" || match.status === "failed"
            : match.status === filter;

      if (!filterOk) return false;
      if (seasonFilter !== "all" && match.editable.season !== seasonFilter) return false;
      if (patchFilter !== "all" && match.editable.patch_label !== patchFilter) return false;
      if (!normalized) return true;

      return [
        match.match_id,
        match.editable.map_name,
        match.editable.game_mode,
        match.editable.my_hero,
        match.editable.season,
        match.editable.patch_label,
        RESULT_META[match.editable.result].label,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [filter, matches, patchFilter, query, seasonFilter]);

  const visibleIds = visible.map((match) => match.match_id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  function toggleSelected(matchId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    const ok = window.confirm(`선택한 경기 ${ids.length}개를 한 번에 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`);
    if (!ok) return;

    setDeleting(true);
    try {
      const adapter = getMatchBackendAdapter();
      for (const id of ids) {
        await adapter.deleteMatchImport(id);
        removeReviewDraft(id);
      }
      setMatches((current) => current.filter((match) => !selectedIds.has(match.match_id)));
      setSelectedIds(new Set());
    } finally {
      setDeleting(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-7 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1320px]">
        <section className="mb-6 flex flex-col gap-4 border-b border-[var(--line)] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">경기 데이터</p>
            <h1 className="m-0 text-[28px] font-semibold tracking-[-0.03em] md:text-[32px]">경기 목록</h1>
            <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
              등록한 경기의 업로드, OCR, 검수 상태와 확정 데이터를 한곳에서 관리합니다.
            </p>
          </div>
          <Link
            href="/matches/new"
            className="app-orange-button w-fit rounded-md px-4 py-2.5 text-[12px] font-semibold no-underline"
          >
            + 경기 등록
          </Link>
        </section>

        <section className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--line)] pb-4 text-[11px] text-[var(--muted)]">
          <span><strong className="font-semibold text-white">{matches.length}</strong> 전체</span>
          <span><strong className={actionCount > 0 ? "font-semibold text-[var(--warning)]" : "font-semibold text-white"}>{actionCount}</strong> 확인 필요</span>
          <span><strong className="font-semibold text-white">{matches.filter((m) => m.status === "pending_ocr" || m.status === "processing_ocr").length}</strong> OCR 처리</span>
          <span><strong className="font-semibold text-white">{matches.filter((m) => m.status === "confirmed").length}</strong> 확정</span>
        </section>

        <section className="border-t border-[var(--line)]">
          <div className="border-b border-[var(--line)] py-2.5">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap gap-1">
              <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>전체 {matches.length}</FilterButton>
              <FilterButton active={filter === "action"} onClick={() => setFilter("action")}>확인 필요 {actionCount}</FilterButton>
              <FilterButton active={filter === "pending_ocr"} onClick={() => setFilter("pending_ocr")}>OCR 대기</FilterButton>
              <FilterButton active={filter === "needs_review"} onClick={() => setFilter("needs_review")}>검수 필요</FilterButton>
              <FilterButton active={filter === "confirmed"} onClick={() => setFilter("confirmed")}>완료</FilterButton>
              </div>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="맵 · 영웅 · 시즌 · 패치 · 경기 ID 검색"
                className="w-full rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[11px] text-white outline-none placeholder:text-[#666a73] focus:border-[#474a51] xl:w-[300px]"
              />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-[var(--line-soft)] pt-2">
              <select
                value={seasonFilter}
                onChange={(event) => setSeasonFilter(event.target.value)}
                className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[10px] font-medium text-[#c7c9ce] outline-none"
              >
                <option value="all">시즌 전체</option>
                {seasonOptions.map((season) => <option key={season} value={season}>{season}</option>)}
              </select>
              <select
                value={patchFilter}
                onChange={(event) => setPatchFilter(event.target.value)}
                className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[10px] font-medium text-[#c7c9ce] outline-none"
              >
                <option value="all">패치 전체</option>
                {patchOptions.map((patch) => <option key={patch} value={patch}>{patch}</option>)}
              </select>
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                className="cursor-pointer rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[10px] font-medium text-[#c7c9ce] hover:border-[#4b5668]"
              >
                {allVisibleSelected ? "현재 목록 선택 해제" : `현재 목록 전체 선택 (${visible.length})`}
              </button>
              {selectedIds.size > 0 && (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void deleteSelected()}
                  className="cursor-pointer rounded-md border border-[#5b3237] bg-[#241416] px-3 py-2 text-[10px] font-semibold text-[#ff9b9b] hover:bg-[#34191f] disabled:cursor-wait disabled:opacity-50"
                >
                  {deleting ? "삭제 중..." : `선택 ${selectedIds.size}개 삭제`}
                </button>
              )}
              {(seasonFilter !== "all" || patchFilter !== "all" || query) && (
                <button
                  type="button"
                  onClick={() => {
                    setSeasonFilter("all");
                    setPatchFilter("all");
                    setQuery("");
                  }}
                  className="cursor-pointer rounded-md border border-transparent bg-transparent px-3 py-2 text-[10px] font-medium text-[var(--muted)] hover:text-white"
                >
                  필터 초기화
                </button>
              )}
            </div>
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
                const result = RESULT_META[match.editable.result];

                return (
                  <article key={match.match_id} className={`grid gap-4 px-5 py-4 transition hover:bg-[#101114] xl:grid-cols-[34px_150px_110px_1fr_200px_auto] xl:items-center ${selectedIds.has(match.match_id) ? "bg-[rgba(242,140,40,0.04)]" : ""}`}>
                    <label className="flex cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(match.match_id)}
                        onChange={() => toggleSelected(match.match_id)}
                        className="h-4 w-4 accent-[var(--orange)]"
                        aria-label={`${match.match_id} 선택`}
                      />
                    </label>

                    <div>
                      <p className="m-0 text-sm font-bold text-white">{formatDate(match.editable.played_at || match.detected_at)}</p>
                      <p className="mt-1 truncate text-[10px] text-[var(--muted)]">{match.match_id.slice(0, 16)}...</p>
                    </div>

                    <div>
                      <MatchStatus status={match.status} />
                    </div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <strong className="truncate text-sm text-white">{match.editable.map_name || "맵 미확인"}</strong>
                        <span className={`text-xs font-semibold ${result.className}`}>{result.label}</span>
                        {match.editable.my_hero && <span className="text-xs text-[#aeb4bf]">{match.editable.my_hero}</span>}
                      </div>
                      <p className="mb-0 mt-1 truncate text-[10px] text-[var(--muted)]">
                        {match.editable.game_mode || "게임 모드 미확인"} · 이미지 {match.files.length}장
                      </p>
                      {(match.editable.season || match.editable.patch_label) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {match.editable.season && <span className="rounded-sm bg-[#151619] px-2 py-1 text-[9px] font-bold text-[#b8c0cf]">{match.editable.season}</span>}
                          {match.editable.patch_label && <span className="rounded-sm bg-[#151619] px-2 py-1 text-[9px] font-bold text-[#aeb4bf]">{match.editable.patch_label}</span>}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 text-xs">
                      <DataChip label="요약" value={summary} />
                      <DataChip label="팀" value={team} />
                      <DataChip label="개인" value={personal} />
                      <DataChip label="리플" value={replay} />
                    </div>

                    <Link
                      href={`/matches/${match.match_id}`}
                      className="rounded-md border border-[var(--line)] bg-[#0d0e11] px-3 py-2 text-center text-xs font-bold text-white no-underline transition hover:border-[#4b5668] hover:bg-[#19202d]"
                    >
                      상세 / 수정
                    </Link>
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

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-md border px-3 py-2 text-[11px] font-medium transition ${
        active
          ? "border-[#34373d] bg-[#17181b] text-white"
          : "border-transparent bg-transparent text-[var(--muted)] hover:bg-[#121316] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function DataChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-l border-[var(--line-soft)] px-2 py-1 text-center">
      <span className="block text-[9px] text-[var(--muted)]">{label}</span>
      <strong className="mt-0.5 block text-[11px] text-white">{value}</strong>
    </div>
  );
}

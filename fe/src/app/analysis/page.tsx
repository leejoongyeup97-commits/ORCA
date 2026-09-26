"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getMatchBackendAdapter, type MatchListItem } from "@/lib/backend";

type BreakdownRow = {
  key: string;
  games: number;
  wins: number;
  losses: number;
  winRate: number | null;
};

function buildBreakdown(matches: MatchListItem[], pick: (match: MatchListItem) => string) {
  const map = new Map<string, { games: number; wins: number; losses: number }>();

  for (const match of matches) {
    const key = pick(match).trim() || "미확인";
    const current = map.get(key) ?? { games: 0, wins: 0, losses: 0 };
    current.games += 1;
    if (match.editable.result === "win") current.wins += 1;
    if (match.editable.result === "loss") current.losses += 1;
    map.set(key, current);
  }

  return Array.from(map.entries())
    .map(([key, value]): BreakdownRow => {
      const decided = value.wins + value.losses;
      return {
        key,
        ...value,
        winRate: decided > 0 ? Math.round((value.wins / decided) * 100) : null,
      };
    })
    .sort((a, b) => b.games - a.games || a.key.localeCompare(b.key));
}

export default function AnalysisPage() {
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

  const confirmed = useMemo(() => matches.filter((match) => match.status === "confirmed"), [matches]);
  const decided = useMemo(
    () => confirmed.filter((match) => match.editable.result === "win" || match.editable.result === "loss"),
    [confirmed],
  );
  const wins = decided.filter((match) => match.editable.result === "win").length;
  const losses = decided.filter((match) => match.editable.result === "loss").length;
  const winRate = decided.length > 0 ? Math.round((wins / decided.length) * 100) : null;

  const mapRows = useMemo(() => buildBreakdown(confirmed, (match) => match.editable.map_name), [confirmed]);
  const heroRows = useMemo(() => buildBreakdown(confirmed, (match) => match.editable.my_hero), [confirmed]);
  const modeRows = useMemo(() => buildBreakdown(confirmed, (match) => match.editable.game_mode), [confirmed]);
  const seasonRows = useMemo(() => buildBreakdown(confirmed, (match) => match.editable.season), [confirmed]);
  const patchRows = useMemo(() => buildBreakdown(confirmed, (match) => match.editable.patch_label), [confirmed]);
  const sideRows = useMemo(
    () =>
      buildBreakdown(confirmed, (match) =>
        match.editable.side === "attack"
          ? "선공"
          : match.editable.side === "defense"
            ? "선수비"
            : match.editable.side === "neutral"
              ? "해당 없음"
              : "미확인",
      ),
    [confirmed],
  );

  return (
    <main className="min-h-screen px-4 py-7 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1320px]">
        <section className="mb-6 border-b border-[var(--line)] pb-6">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">분석</p>
          <h1 className="m-0 text-[28px] font-semibold tracking-[-0.03em] md:text-[32px]">확정 경기 기초 분석</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[var(--muted)]">
            현재는 확정된 경기의 검수값을 기준으로 승률과 맵, 영웅, 모드, 시즌, 패치, 선공/선수비를 비교합니다. 실제 통계 모델 연결 전 단계입니다.
          </p>
        </section>

        {loading ? (
          <div className="border-y border-[var(--line)] px-6 py-16 text-center text-sm text-[var(--muted)]">분석 데이터를 불러오는 중...</div>
        ) : (
          <>
            <section className="mb-7 grid grid-cols-2 border-b border-[var(--line)] lg:grid-cols-4">
              <Metric label="확정 경기" value={String(confirmed.length)} />
              <Metric label="승리 / 패배" value={`${wins} / ${losses}`} />
              <Metric label="승률" value={winRate === null ? "-" : `${winRate}%`} accent />
              <Metric label="결과 미확인" value={String(confirmed.length - decided.length)} warning={confirmed.length - decided.length > 0} />
            </section>

            {confirmed.length === 0 ? (
              <section className="border-y border-dashed border-[#35383f] px-6 py-16 text-center">
                <p className="m-0 text-sm font-bold">아직 분석 가능한 경기가 없습니다</p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">경기 상세에서 OCR 검수 후 확정하면 여기에 집계됩니다.</p>
                <Link href="/matches" className="mt-4 inline-block text-xs font-bold text-[#9bbcff] no-underline hover:text-white">경기 목록으로 →</Link>
              </section>
            ) : (
              <div className="grid gap-x-7 gap-y-8 xl:grid-cols-3">
                <Breakdown title="맵별" rows={mapRows} />
                <Breakdown title="영웅별" rows={heroRows} />
                <Breakdown title="모드별" rows={modeRows} />
                <Breakdown title="시즌별" rows={seasonRows} />
                <Breakdown title="패치별" rows={patchRows} />
                <Breakdown title="선공 / 선수비" rows={sideRows} />
              </div>
            )}

            <section className="mt-8 border-t border-[var(--line)] pt-5">
              <p className="m-0 text-[12px] font-semibold text-white">해석 주의</p>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                이 화면은 단순 집계입니다. 표본 수가 적은 항목의 승률을 승패 원인으로 해석하지 않습니다. 이후 표본 수, 패치, 조합, 역할군 등 조건을 추가해 가설 검증 단계로 확장합니다.
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value, accent = false, warning = false }: { label: string; value: string; accent?: boolean; warning?: boolean }) {
  const valueClass = warning ? "text-[#ffb45f]" : accent ? "text-[#8ee9aa]" : "text-white";
  return (
    <div className="border-r border-[var(--line)] px-4 py-5 first:pl-0 last:border-r-0">
      <p className="m-0 text-[11px] text-[var(--muted)]">{label}</p>
      <p className={`mb-0 mt-2 text-[24px] font-semibold tracking-[-0.03em] ${valueClass}`}>{value}</p>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return (
    <section className="overflow-hidden border-t border-[var(--line)]">
      <div className="border-b border-[var(--line-soft)] px-1 py-3">
        <p className="m-0 text-sm font-bold">{title}</p>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-xs text-[var(--muted)]">데이터 없음</div>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          {rows.slice(0, 10).map((row) => (
            <div key={row.key} className="px-1 py-3">
              <div className="flex items-center justify-between gap-3">
                <strong className="min-w-0 truncate text-xs text-white">{row.key}</strong>
                <span className="text-xs font-semibold text-[#c8cad0]">{row.winRate === null ? "-" : `${row.winRate}%`}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-[var(--muted)]">
                <span>{row.games}경기 · {row.wins}승 {row.losses}패</span>
                <div className="h-1 w-20 overflow-hidden rounded-sm bg-[#1b1d21]">
                  <div className="h-full bg-[var(--orange)]" style={{ width: `${row.winRate ?? 0}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

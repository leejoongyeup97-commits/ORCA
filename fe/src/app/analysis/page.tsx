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

  return (
    <main className="min-h-screen px-5 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1240px]">
        <section className="mb-7">
          <p className="mb-2 text-sm font-semibold text-[var(--orange)]">분석</p>
          <h1 className="m-0 text-3xl font-bold tracking-[-0.03em] md:text-4xl">확정 경기 기초 분석</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            현재는 확정된 경기의 수동 검수값을 기준으로 승률과 맵, 영웅, 모드별 표를 만듭니다. 실제 OCR 및 통계 모델 연결 전 단계입니다.
          </p>
        </section>

        {loading ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-6 py-16 text-center text-sm text-[var(--muted)]">분석 데이터를 불러오는 중...</div>
        ) : (
          <>
            <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric label="확정 경기" value={String(confirmed.length)} />
              <Metric label="승리 / 패배" value={`${wins} / ${losses}`} />
              <Metric label="승률" value={winRate === null ? "-" : `${winRate}%`} accent />
              <Metric label="결과 미확인" value={String(confirmed.length - decided.length)} warning={confirmed.length - decided.length > 0} />
            </section>

            {confirmed.length === 0 ? (
              <section className="rounded-2xl border border-dashed border-[#364052] bg-[#0d1118] px-6 py-16 text-center">
                <p className="m-0 text-sm font-bold">아직 분석 가능한 경기가 없습니다</p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">경기 상세에서 OCR 검수 후 확정하면 여기에 집계됩니다.</p>
                <Link href="/matches" className="mt-4 inline-block text-xs font-bold text-[#9bbcff] no-underline hover:text-white">경기 목록으로 →</Link>
              </section>
            ) : (
              <div className="grid gap-5 xl:grid-cols-3">
                <Breakdown title="맵별" rows={mapRows} />
                <Breakdown title="영웅별" rows={heroRows} />
                <Breakdown title="모드별" rows={modeRows} />
              </div>
            )}

            <section className="mt-5 rounded-2xl border border-[rgba(249,158,26,0.25)] bg-[rgba(249,158,26,0.05)] p-5">
              <p className="m-0 text-sm font-bold text-[var(--orange)]">해석 주의</p>
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
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <p className="m-0 text-[11px] text-[var(--muted)]">{label}</p>
      <p className={`mb-0 mt-2 text-2xl font-black ${valueClass}`}>{value}</p>
    </div>
  );
}

function Breakdown({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
      <div className="border-b border-[var(--line)] px-5 py-4">
        <p className="m-0 text-sm font-bold">{title}</p>
      </div>
      {rows.length === 0 ? (
        <div className="px-5 py-10 text-center text-xs text-[var(--muted)]">데이터 없음</div>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          {rows.slice(0, 10).map((row) => (
            <div key={row.key} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <strong className="min-w-0 truncate text-xs text-white">{row.key}</strong>
                <span className="text-xs font-black text-[#9bc6ff]">{row.winRate === null ? "-" : `${row.winRate}%`}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-[var(--muted)]">
                <span>{row.games}경기 · {row.wins}승 {row.losses}패</span>
                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[#1b2230]">
                  <div className="h-full rounded-full bg-[#8ee9aa]" style={{ width: `${row.winRate ?? 0}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getMatchBackendAdapter, type MatchListItem } from "@/lib/backend";
import {
  HYPOTHESIS_DATA_LABELS,
  PREDEFINED_HYPOTHESES,
  type HypothesisDataKey,
} from "@/lib/hypothesis-library";

function isDecided(match: MatchListItem) {
  return match.editable.result === "win" || match.editable.result === "loss";
}

function winRate(matches: MatchListItem[]) {
  const decided = matches.filter(isDecided);
  if (decided.length === 0) return null;
  return Math.round((decided.filter((match) => match.editable.result === "win").length / decided.length) * 100);
}

function percent(value: number, total: number) {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

function basicAvailability(matches: MatchListItem[], key: HypothesisDataKey) {
  switch (key) {
    case "result":
      return matches.filter(isDecided).length;
    case "map":
      return matches.filter((match) => match.editable.map_name.trim()).length;
    case "mode":
      return matches.filter((match) => match.editable.game_mode.trim()).length;
    case "hero":
      return matches.filter((match) => match.editable.my_hero.trim()).length;
    case "manual_context":
      return matches.filter(
        (match) =>
          match.editable.side !== "unknown" ||
          match.editable.control_submap.trim() ||
          match.editable.round_sequence.trim(),
      ).length;
    case "patch":
      return matches.filter((match) => match.editable.patch_label.trim()).length;
    default:
      return 0;
  }
}

export default function InsightsPage() {
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

  const confirmed = useMemo(
    () =>
      matches
        .filter((match) => match.status === "confirmed")
        .sort(
          (a, b) =>
            new Date(b.editable.played_at || b.detected_at).getTime() -
            new Date(a.editable.played_at || a.detected_at).getTime(),
        ),
    [matches],
  );

  const decided = confirmed.filter(isDecided);
  const overall = winRate(confirmed);
  const recent10 = decided.slice(0, 10);
  const previous10 = decided.slice(10, 20);
  const recentRate = winRate(recent10);
  const previousRate = winRate(previous10);
  const delta =
    recentRate !== null && previousRate !== null && recent10.length >= 5 && previous10.length >= 5
      ? recentRate - previousRate
      : null;

  const completeness = {
    result: percent(decided.length, confirmed.length),
    map: percent(confirmed.filter((m) => m.editable.map_name.trim()).length, confirmed.length),
    hero: percent(confirmed.filter((m) => m.editable.my_hero.trim()).length, confirmed.length),
    mode: percent(confirmed.filter((m) => m.editable.game_mode.trim()).length, confirmed.length),
  };

  const observedMaps = useMemo(() => {
    const map = new Map<string, MatchListItem[]>();
    for (const match of decided) {
      const name = match.editable.map_name.trim();
      if (!name) continue;
      const bucket = map.get(name) ?? [];
      bucket.push(match);
      map.set(name, bucket);
    }

    return Array.from(map.entries())
      .map(([name, items]) => ({
        name,
        games: items.length,
        rate: winRate(items),
      }))
      .filter((item) => item.games >= 3 && item.rate !== null)
      .sort((a, b) => b.games - a.games || (b.rate ?? 0) - (a.rate ?? 0))
      .slice(0, 6);
  }, [decided]);

  const missingHighPriority = PREDEFINED_HYPOTHESES.filter((hypothesis) => hypothesis.priority === "high")
    .map((hypothesis) => {
      const missing = hypothesis.requiredData.filter((key) => basicAvailability(confirmed, key) === 0);
      return { hypothesis, missing };
    })
    .filter((item) => item.missing.length > 0)
    .slice(0, 6);

  const readyBasicHypotheses = PREDEFINED_HYPOTHESES.filter((hypothesis) => {
    const available = Math.min(...hypothesis.requiredData.map((key) => basicAvailability(confirmed, key)));
    return available >= hypothesis.minSamples;
  }).length;

  const summaryText =
    confirmed.length === 0
      ? "아직 확정된 경기가 없어 인사이트를 계산하지 않습니다."
      : delta === null
        ? `현재 확정 경기 ${confirmed.length}건이 있습니다. 최근 구간 비교를 하기에는 표본이 아직 부족합니다.`
        : delta > 0
          ? `최근 10경기 승률이 이전 구간보다 ${delta}%p 높게 관찰됩니다. 아직 원인으로 해석하지 않고 추가 데이터를 기다립니다.`
          : delta < 0
            ? `최근 10경기 승률이 이전 구간보다 ${Math.abs(delta)}%p 낮게 관찰됩니다. 어떤 조건이 함께 변했는지 추가 검증이 필요합니다.`
            : "최근 10경기와 이전 구간의 승률이 현재 표본에서는 비슷하게 관찰됩니다.";

  return (
    <main className="min-h-screen px-5 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1240px]">
        <section className="mb-7">
          <p className="mb-2 text-sm font-semibold text-[var(--orange)]">인사이트</p>
          <h1 className="m-0 text-3xl font-bold tracking-[-0.03em] md:text-4xl">최근 변화와 다음 검증 포인트</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            현재 데이터에서 관찰되는 변화와 아직 부족한 데이터를 분리해서 보여줍니다. 원인으로 단정하지 않고 다음 검증 방향을 안내합니다.
          </p>
        </section>

        {loading ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-6 py-16 text-center text-sm text-[var(--muted)]">
            인사이트를 계산하는 중...
          </div>
        ) : (
          <>
            <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric label="확정 경기" value={String(confirmed.length)} />
              <Metric label="전체 승률" value={overall === null ? "-" : `${overall}%`} />
              <Metric label="최근 10경기" value={recentRate === null ? "-" : `${recentRate}%`} accent />
              <Metric
                label="최근 변화"
                value={delta === null ? "-" : `${delta > 0 ? "+" : ""}${delta}%p`}
                success={delta !== null && delta > 0}
                warning={delta !== null && delta < 0}
              />
            </section>

            <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
              <section className="space-y-5">
                <section className="rounded-2xl border border-[rgba(102,169,255,0.24)] bg-[rgba(102,169,255,0.05)] p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="m-0 text-sm font-bold text-[#9bc6ff]">현재 요약</p>
                      <p className="mt-2 text-sm leading-6 text-[#c9d0dc]">{summaryText}</p>
                    </div>
                    <span className="hidden rounded-xl border border-[rgba(102,169,255,0.2)] bg-[#0d1118] px-3 py-2 text-[10px] font-black text-[#9bc6ff] sm:block">
                      자동 요약
                    </span>
                  </div>
                </section>

                <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
                  <div className="border-b border-[var(--line)] px-5 py-4">
                    <p className="m-0 text-sm font-bold">맵별 관찰값</p>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">최소 3경기 이상 있는 맵만 표시합니다.</p>
                  </div>

                  {observedMaps.length === 0 ? (
                    <div className="px-5 py-12 text-center text-xs text-[var(--muted)]">아직 비교 가능한 맵 표본이 없습니다.</div>
                  ) : (
                    <div className="divide-y divide-[var(--line)]">
                      {observedMaps.map((item) => (
                        <div key={item.name} className="px-5 py-4">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="m-0 text-xs font-bold text-white">{item.name}</p>
                              <p className="mt-1 text-[10px] text-[var(--muted)]">{item.games}경기</p>
                            </div>
                            <span className="text-sm font-black text-[#9bc6ff]">{item.rate}%</span>
                          </div>
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#171e2a]">
                            <div className="h-full rounded-full bg-[#9bc6ff]" style={{ width: `${item.rate}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="m-0 text-sm font-bold">데이터 완성도</p>
                      <p className="mt-1 text-[10px] text-[var(--muted)]">확정 경기 중 기본 필드 입력 비율</p>
                    </div>
                    <Link href="/matches" className="text-[10px] font-bold text-[#9bc6ff] no-underline hover:text-white">경기 수정 →</Link>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Completeness label="승패" value={completeness.result} />
                    <Completeness label="맵" value={completeness.map} />
                    <Completeness label="내 영웅" value={completeness.hero} />
                    <Completeness label="게임 모드" value={completeness.mode} />
                  </div>
                </section>
              </section>

              <aside className="space-y-5">
                <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
                  <p className="m-0 text-sm font-bold">가설 준비 상태</p>
                  <div className="mt-4 rounded-xl border border-[var(--line)] bg-[#0d1118] p-4">
                    <p className="m-0 text-[10px] text-[var(--muted)]">현재 기본 데이터만으로 검증 대기 가능한 가설</p>
                    <p className="mb-0 mt-2 text-3xl font-black text-white">{readyBasicHypotheses}</p>
                    <p className="mb-0 mt-1 text-[10px] text-[var(--muted)]">전체 {PREDEFINED_HYPOTHESES.length}개 Library</p>
                  </div>
                  <Link href="/hypotheses" className="mt-3 block rounded-xl bg-[var(--orange)] px-4 py-3 text-center text-xs font-black text-black no-underline">
                    가설 Library 보기
                  </Link>
                </section>

                <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
                  <p className="m-0 text-sm font-bold">다음으로 필요한 데이터</p>
                  <p className="mt-1 text-[10px] leading-5 text-[var(--muted)]">우선 검증 가설을 열기 위해 아직 없는 입력입니다.</p>

                  <div className="mt-4 space-y-3">
                    {missingHighPriority.length === 0 ? (
                      <p className="text-xs text-[var(--muted)]">우선 가설의 필수 데이터가 준비되었습니다.</p>
                    ) : (
                      missingHighPriority.map(({ hypothesis, missing }) => (
                        <div key={hypothesis.id} className="rounded-xl border border-[var(--line)] bg-[#0d1118] p-3">
                          <p className="m-0 text-[11px] font-bold text-white">{hypothesis.title}</p>
                          <p className="mb-0 mt-2 text-[9px] leading-4 text-[var(--muted)]">
                            필요: {missing.map((key) => HYPOTHESIS_DATA_LABELS[key]).join(" · ")}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  accent = false,
  success = false,
  warning = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  success?: boolean;
  warning?: boolean;
}) {
  const color = success ? "text-[#8ee9aa]" : warning ? "text-[#ff9b9b]" : accent ? "text-[#9bc6ff]" : "text-white";

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <p className="m-0 text-[11px] text-[var(--muted)]">{label}</p>
      <p className={`mb-0 mt-2 text-2xl font-black ${color}`}>{value}</p>
    </div>
  );
}

function Completeness({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[#0d1118] p-3">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[10px] font-bold text-white">{label}</span>
        <span className="text-[10px] font-black text-[#9bc6ff]">{value}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#171e2a]">
        <div className="h-full rounded-full bg-[#9bc6ff]" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

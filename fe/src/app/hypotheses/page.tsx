"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  getMatchBackendAdapter,
  type MatchListItem,
} from "@/lib/backend";
import {
  HYPOTHESIS_CATEGORY_META,
  HYPOTHESIS_DATA_LABELS,
  PREDEFINED_HYPOTHESES,
  type HypothesisCategory,
  type HypothesisDataKey,
  type HypothesisPriority,
} from "@/lib/hypothesis-library";

type FilterKey = "all" | HypothesisCategory;
type Readiness = "insufficient_data" | "candidate";

const PRIORITY_META: Record<HypothesisPriority, { label: string; className: string }> = {
  high: { label: "우선 검증", className: "bg-[rgba(249,158,26,0.14)] text-[var(--orange)]" },
  medium: { label: "중간", className: "bg-[rgba(102,169,255,0.12)] text-[#9bc6ff]" },
  explore: { label: "탐색", className: "bg-[#171e2a] text-[var(--muted)]" },
};

const READINESS_META: Record<Readiness, { label: string; className: string }> = {
  insufficient_data: { label: "데이터 부족", className: "bg-[#171e2a] text-[var(--muted)]" },
  candidate: { label: "검증 대기", className: "bg-[rgba(121,227,156,0.12)] text-[#8ee9aa]" },
};

function countAvailable(matches: MatchListItem[], key: HypothesisDataKey) {
  const confirmed = matches.filter((match) => match.status === "confirmed");

  switch (key) {
    case "result":
      return confirmed.filter((match) => match.editable.result === "win" || match.editable.result === "loss").length;
    case "map":
      return confirmed.filter((match) => match.editable.map_name.trim()).length;
    case "mode":
      return confirmed.filter((match) => match.editable.game_mode.trim()).length;
    case "hero":
      return confirmed.filter((match) => match.editable.my_hero.trim()).length;
    case "manual_context":
      return confirmed.filter(
        (match) =>
          match.editable.side !== "unknown" ||
          match.editable.control_submap.trim() ||
          match.editable.round_sequence.trim(),
      ).length;
    case "patch":
      return confirmed.filter((match) => match.editable.patch_label.trim()).length;
    case "player_stats":
    case "hero_detail":
    case "team_comp":
    case "meta_snapshot":
    case "profile_snapshot":
    case "duo_link":
      return 0;
  }
}

function formatRequiredData(keys: HypothesisDataKey[]) {
  return keys.map((key) => HYPOTHESIS_DATA_LABELS[key]).join(" · ");
}

export default function HypothesesPage() {
  const [matches, setMatches] = useState<MatchListItem[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [priority, setPriority] = useState<"all" | HypothesisPriority>("all");
  const [readiness, setReadiness] = useState<"all" | Readiness>("all");
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

  const rows = useMemo(() => {
    return PREDEFINED_HYPOTHESES.map((item) => {
      const available = Math.min(...item.requiredData.map((key) => countAvailable(matches, key)));
      const state: Readiness = available >= item.minSamples ? "candidate" : "insufficient_data";
      return {
        ...item,
        available,
        state,
        progress: Math.min(100, Math.round((available / item.minSamples) * 100)),
      };
    });
  }, [matches]);

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return rows.filter((item) => {
      if (filter !== "all" && item.category !== filter) return false;
      if (priority !== "all" && item.priority !== priority) return false;
      if (readiness !== "all" && item.state !== readiness) return false;
      if (!normalized) return true;

      return [
        item.title,
        item.question,
        item.rule,
        HYPOTHESIS_CATEGORY_META[item.category].label,
        formatRequiredData(item.requiredData),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [filter, priority, query, readiness, rows]);

  const candidateCount = rows.filter((item) => item.state === "candidate").length;
  const highCount = rows.filter((item) => item.priority === "high").length;
  const confirmedCount = matches.filter((match) => match.status === "confirmed").length;

  return (
    <main className="min-h-screen px-5 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1280px]">
        <section className="mb-7 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="mb-2 text-sm font-semibold text-[var(--orange)]">가설 Registry</p>
            <h1 className="m-0 text-3xl font-bold tracking-[-0.03em] md:text-4xl">미리 준비된 가설 Library</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              사용자가 가설을 직접 쓰는 화면이 아닙니다. ORCA가 처음부터 검증할 질문을 등록해두고,
              데이터가 쌓이면 자동으로 검증 가능한 가설부터 올립니다.
            </p>
          </div>
          <div className="rounded-2xl border border-[rgba(249,158,26,0.25)] bg-[rgba(249,158,26,0.05)] px-4 py-3">
            <p className="m-0 text-[10px] font-bold text-[var(--orange)]">현재 규칙</p>
            <p className="mb-0 mt-1 text-xs text-[var(--muted)]">
              발견과 검증을 분리하고, 표본이 부족하면 결론을 내리지 않습니다.
            </p>
          </div>
        </section>

        <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="사전 가설" value={String(rows.length)} />
          <Metric label="우선 검증" value={String(highCount)} accent />
          <Metric label="검증 대기" value={String(candidateCount)} success />
          <Metric label="확정 경기" value={String(confirmedCount)} />
        </section>

        <section className="mb-5 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto] xl:items-center">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="가설 검색 · 예: 데스, 맵, 패치, 아군 영웅"
              className="field-input"
            />

            <div className="flex flex-wrap gap-2">
              <SelectButton active={priority === "all"} onClick={() => setPriority("all")}>우선순위 전체</SelectButton>
              <SelectButton active={priority === "high"} onClick={() => setPriority("high")}>우선 검증</SelectButton>
              <SelectButton active={priority === "medium"} onClick={() => setPriority("medium")}>중간</SelectButton>
              <SelectButton active={priority === "explore"} onClick={() => setPriority("explore")}>탐색</SelectButton>
            </div>

            <div className="flex flex-wrap gap-2">
              <SelectButton active={readiness === "all"} onClick={() => setReadiness("all")}>상태 전체</SelectButton>
              <SelectButton active={readiness === "candidate"} onClick={() => setReadiness("candidate")}>검증 대기</SelectButton>
              <SelectButton active={readiness === "insufficient_data"} onClick={() => setReadiness("insufficient_data")}>데이터 부족</SelectButton>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
            <CategoryButton active={filter === "all"} onClick={() => setFilter("all")} label="전체" count={rows.length} />
            {(Object.keys(HYPOTHESIS_CATEGORY_META) as HypothesisCategory[]).map((category) => (
              <CategoryButton
                key={category}
                active={filter === category}
                onClick={() => setFilter(category)}
                label={HYPOTHESIS_CATEGORY_META[category].label}
                count={rows.filter((item) => item.category === category).length}
              />
            ))}
          </div>
        </section>

        {loading ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-6 py-16 text-center text-sm text-[var(--muted)]">
            가설 준비 상태를 계산하는 중...
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-6 py-16 text-center text-sm text-[var(--muted)]">
            조건에 맞는 가설이 없습니다.
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {visible.map((item) => {
              const category = HYPOTHESIS_CATEGORY_META[item.category];
              const priorityMeta = PRIORITY_META[item.priority];
              const readinessMeta = READINESS_META[item.state];

              return (
                <article key={item.id} className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#171e2a] px-2.5 py-1 text-[9px] font-black text-[#b8c0cf]">
                      {category.label}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${priorityMeta.className}`}>
                      {priorityMeta.label}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${readinessMeta.className}`}>
                      {readinessMeta.label}
                    </span>
                  </div>

                  <h2 className="mb-0 mt-4 text-base font-black text-white">{item.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#c9d0dc]">{item.question}</p>

                  <div className="mt-4 rounded-xl border border-[var(--line)] bg-[#0d1118] p-3">
                    <p className="m-0 text-[9px] font-black tracking-[0.08em] text-[var(--muted)]">RULE</p>
                    <p className="mb-0 mt-1 break-words font-mono text-[10px] leading-5 text-[#9bc6ff]">{item.rule}</p>
                  </div>

                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between gap-4 text-[10px]">
                      <span className="text-[var(--muted)]">최소 표본 {item.minSamples}경기</span>
                      <span className="font-bold text-white">{item.available} / {item.minSamples}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#171e2a]">
                      <div className="h-full rounded-full bg-[var(--orange)] transition-all" style={{ width: `${item.progress}%` }} />
                    </div>
                  </div>

                  <div className="mt-4 border-t border-[var(--line)] pt-3">
                    <p className="m-0 text-[9px] font-black text-[var(--muted)]">필요 데이터</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.requiredData.map((key) => {
                        const count = countAvailable(matches, key);
                        const ready = count > 0;
                        return (
                          <span
                            key={key}
                            className={`rounded-md border px-2 py-1 text-[9px] font-bold ${
                              ready
                                ? "border-[rgba(121,227,156,0.18)] bg-[rgba(121,227,156,0.06)] text-[#8ee9aa]"
                                : "border-[var(--line)] bg-[#0a0d12] text-[var(--muted)]"
                            }`}
                          >
                            {HYPOTHESIS_DATA_LABELS[key]}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <section className="mt-5 rounded-2xl border border-[rgba(102,169,255,0.25)] bg-[rgba(102,169,255,0.05)] p-5">
          <p className="m-0 text-sm font-bold text-[#9bc6ff]">자동 생성 가설은 따로 들어옵니다</p>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            이 화면의 항목은 사람이 미리 생각할 수 있는 사전 Library입니다. 나중에 ML이 특이 패턴을 발견하면
            별도의 candidate 가설로 추가하고, 새 경기에서 다시 검증하는 구조로 연결합니다.
          </p>
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  accent = false,
  success = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  success?: boolean;
}) {
  const valueClass = success ? "text-[#8ee9aa]" : accent ? "text-[var(--orange)]" : "text-white";

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <p className="m-0 text-[11px] text-[var(--muted)]">{label}</p>
      <p className={`mb-0 mt-2 text-2xl font-black ${valueClass}`}>{value}</p>
    </div>
  );
}

function SelectButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-lg border px-3 py-2 text-[10px] font-bold transition ${
        active
          ? "border-[rgba(249,158,26,0.42)] bg-[var(--orange-soft)] text-[var(--orange)]"
          : "border-[var(--line)] bg-[#0d1118] text-[var(--muted)] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function CategoryButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-lg border px-3 py-2 text-[10px] font-bold transition ${
        active
          ? "border-[#4e5e76] bg-[#192230] text-white"
          : "border-[var(--line)] bg-[#0d1118] text-[var(--muted)] hover:text-white"
      }`}
    >
      {label} <span className="ml-1 opacity-60">{count}</span>
    </button>
  );
}

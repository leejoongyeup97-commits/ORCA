"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createDefaultReviewDraft,
  loadReviewDraft,
  saveReviewDraft,
  type MatchReviewDraft,
  type ReviewHeroDetail,
  type ReviewPlayer,
} from "@/lib/review-draft";

type TabKey = "scoreboard" | "hero";

function formatStatValue(value: string) {
  const trimmed = value.trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) return value;

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [integerPart, decimalPart] = unsigned.split(".");
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "") || "0";
  const grouped = normalizedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `${negative ? "-" : ""}${grouped}${decimalPart !== undefined ? `.${decimalPart}` : ""}`;
}

function stripStatSeparators(value: string) {
  return value.replace(/,/g, "");
}

export default function MatchReviewEditor({
  matchId,
  defaultHero,
  onChange,
}: {
  matchId: string;
  defaultHero: string;
  onChange?: (draft: MatchReviewDraft) => void;
}) {
  const [draft, setDraft] = useState<MatchReviewDraft | null>(null);
  const [tab, setTab] = useState<TabKey>("scoreboard");
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    const loaded = loadReviewDraft(matchId, defaultHero);
    setDraft(loaded);
    onChange?.(loaded);
  }, [matchId, defaultHero, onChange]);

  function commit(next: MatchReviewDraft) {
    const saved = saveReviewDraft(matchId, next);
    setDraft(saved);
    setSavedAt(
      new Date(saved.updated_at).toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
    onChange?.(saved);
  }

  function updatePlayer(id: string, patch: Partial<ReviewPlayer>) {
    if (!draft) return;
    commit({
      ...draft,
      players: draft.players.map((player) =>
        player.id === id ? { ...player, ...patch } : player,
      ),
    });
  }

  function setMe(id: string) {
    if (!draft) return;
    commit({
      ...draft,
      players: draft.players.map((player) => ({
        ...player,
        is_me: player.id === id,
        player_name: player.id === id ? "나" : "",
      })),
    });
  }

  function updateHeroDetail(id: string, patch: Partial<ReviewHeroDetail>) {
    if (!draft) return;
    commit({
      ...draft,
      hero_details: draft.hero_details.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  }

  function updateMetricValue(detailId: string, metricKey: string, value: string) {
    if (!draft) return;
    commit({
      ...draft,
      hero_details: draft.hero_details.map((item) =>
        item.id !== detailId
          ? item
          : {
              ...item,
              metrics: item.metrics.map((metric) =>
                metric.metric_key === metricKey
                  ? { ...metric, value, needs_review: false }
                  : metric,
              ),
            },
      ),
    });
  }

  function addHeroDetail() {
    if (!draft) return;
    commit({
      ...draft,
      hero_details: [
        ...draft.hero_details,
        {
          id: crypto.randomUUID(),
          hero: "",
          hero_key: "",
          play_time: "",
          metrics: [],
        },
      ],
    });
  }

  function removeHeroDetail(id: string) {
    if (!draft || draft.hero_details.length <= 1) return;
    commit({
      ...draft,
      hero_details: draft.hero_details.filter((item) => item.id !== id),
    });
  }

  function resetDraft() {
    const ok = window.confirm("이 경기의 OCR 검수 초안을 초기화할까요?");
    if (!ok) return;
    commit(createDefaultReviewDraft(defaultHero));
  }

  const completion = useMemo(() => {
    if (!draft) return { players: 0, hero: 0 };

    const playerFields = draft.players.flatMap((player) => [
      player.hero,
      player.hero_key,
      player.eliminations,
      player.assists,
      player.deaths,
      player.damage,
      player.healing,
      player.mitigation,
    ]);
    const playerDone = playerFields.filter((value) => value.trim()).length;
    const playerTotal = Math.max(1, playerFields.length);

    const heroFields = draft.hero_details.flatMap((item) => [
      item.hero,
      item.hero_key,
      item.play_time,
      ...item.metrics.map((metric) => metric.value),
    ]);
    const heroDone = heroFields.filter((value) => value.trim()).length;
    const heroTotal = Math.max(1, heroFields.length);

    return {
      players: Math.round((playerDone / playerTotal) * 100),
      hero: Math.round((heroDone / heroTotal) * 100),
    };
  }, [draft]);

  if (!draft) {
    return (
      <section className="border-t border-[var(--line)] py-5 text-xs text-[var(--muted)]">
        OCR 검수 편집기를 준비하는 중...
      </section>
    );
  }

  return (
    <section className="overflow-hidden border-t border-[var(--line)]">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="m-0 text-sm font-bold">OCR 구조화 데이터 검수</p>
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            OCR 값을 확인하고 수정한 최종값이 경기 확정 시 DB에 저장됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && (
            <span className="text-[9px] text-[var(--muted)]">
              자동 저장 {savedAt}
            </span>
          )}
          <button
            type="button"
            onClick={resetDraft}
            className="cursor-pointer rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-[10px] font-bold text-[var(--muted)] hover:text-white"
          >
            초기화
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-[var(--line)] bg-transparent px-4 py-3">
        <TabButton
          active={tab === "scoreboard"}
          onClick={() => setTab("scoreboard")}
          label="10인 스코어보드"
          progress={completion.players}
        />
        <TabButton
          active={tab === "hero"}
          onClick={() => setTab("hero")}
          label="내 영웅 상세"
          progress={completion.hero}
        />
      </div>

      {tab === "scoreboard" ? (
        <ScoreboardEditor
          players={draft.players}
          onUpdate={updatePlayer}
          onSetMe={setMe}
        />
      ) : (
        <HeroDetailEditor
          items={draft.hero_details}
          onUpdate={updateHeroDetail}
          onUpdateMetric={updateMetricValue}
          onAdd={addHeroDetail}
          onRemove={removeHeroDetail}
        />
      )}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  label,
  progress,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  progress: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-lg border px-3 py-2 text-[10px] font-bold transition ${
        active
          ? "border-[rgba(249,158,26,0.42)] bg-[#17181b] text-[#d8dade]"
          : "border-[var(--line)] bg-[#121823] text-[var(--muted)] hover:text-white"
      }`}
    >
      {label} <span className="ml-1 opacity-60">{progress}%</span>
    </button>
  );
}

function ScoreboardEditor({
  players,
  onUpdate,
  onSetMe,
}: {
  players: ReviewPlayer[];
  onUpdate: (id: string, patch: Partial<ReviewPlayer>) => void;
  onSetMe: (id: string) => void;
}) {
  const ally = players.filter((player) => player.team === "ally");
  const enemy = players.filter((player) => player.team === "enemy");

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1040px]">
        <ScoreboardTable
          title="우리 팀"
          rows={ally}
          onUpdate={onUpdate}
          onSetMe={onSetMe}
        />
        <ScoreboardTable
          title="상대 팀"
          rows={enemy}
          onUpdate={onUpdate}
          onSetMe={onSetMe}
        />
      </div>
    </div>
  );
}

function ScoreboardTable({
  title,
  rows,
  onUpdate,
  onSetMe,
}: {
  title: string;
  rows: ReviewPlayer[];
  onUpdate: (id: string, patch: Partial<ReviewPlayer>) => void;
  onSetMe: (id: string) => void;
}) {
  return (
    <div className="border-b border-[var(--line)] last:border-b-0">
      <div className="flex items-center gap-2 bg-[#111722] px-5 py-3">
        <span className="text-xs font-semibold text-white">{title}</span>
        <span className="text-[9px] text-[var(--muted)]">5명</span>
      </div>

      <div className="grid grid-cols-[46px_140px_130px_repeat(6,90px)] gap-2 border-b border-[var(--line)] px-4 py-2 text-[9px] font-semibold text-[var(--muted)]">
        <span>나</span>
        <span>영웅 표시명</span>
        <span>hero_key</span>
        <span>처치</span>
        <span>도움</span>
        <span>죽음</span>
        <span>피해</span>
        <span>치유</span>
        <span>경감</span>
      </div>

      {rows.map((player) => (
        <div
          key={player.id}
          className={`grid grid-cols-[46px_140px_130px_repeat(6,90px)] gap-2 border-b border-[var(--line)] px-4 py-2 last:border-b-0 ${
            player.is_me ? "bg-[rgba(249,158,26,0.05)]" : "bg-transparent"
          }`}
        >
          <button
            type="button"
            onClick={() => onSetMe(player.id)}
            className={`cursor-pointer rounded-lg border text-[9px] font-semibold ${
              player.is_me
                ? "border-[rgba(249,158,26,0.45)] bg-[#17181b] text-[#d8dade]"
                : "border-[var(--line)] bg-transparent text-[var(--muted)]"
            }`}
          >
            {player.is_me ? "ME" : player.slot}
          </button>

          <CellInput
            value={player.hero}
            onChange={(value) => onUpdate(player.id, { hero: value })}
            placeholder="라인하르트"
          />
          <CellInput
            value={player.hero_key}
            onChange={(value) => onUpdate(player.id, { hero_key: value })}
            placeholder="reinhardt"
          />
          <CellInput value={player.eliminations} onChange={(value) => onUpdate(player.id, { eliminations: value })} placeholder="0" numeric />
          <CellInput value={player.assists} onChange={(value) => onUpdate(player.id, { assists: value })} placeholder="0" numeric />
          <CellInput value={player.deaths} onChange={(value) => onUpdate(player.id, { deaths: value })} placeholder="0" numeric />
          <CellInput value={player.damage} onChange={(value) => onUpdate(player.id, { damage: value })} placeholder="0" numeric />
          <CellInput value={player.healing} onChange={(value) => onUpdate(player.id, { healing: value })} placeholder="0" numeric />
          <CellInput value={player.mitigation} onChange={(value) => onUpdate(player.id, { mitigation: value })} placeholder="0" numeric />
        </div>
      ))}
    </div>
  );
}

function CellInput({
  value,
  onChange,
  placeholder,
  numeric = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  numeric?: boolean;
}) {
  return (
    <input
      value={numeric ? formatStatValue(value) : value}
      onChange={(event) =>
        onChange(numeric ? stripStatSeparators(event.target.value) : event.target.value)
      }
      inputMode={numeric ? "numeric" : "text"}
      placeholder={placeholder}
      className="w-full rounded-lg border border-[var(--line)] bg-[#0a0d12] px-2 py-2 text-[10px] text-white outline-none placeholder:text-[#525c6e] focus:border-[var(--orange)]"
    />
  );
}

function HeroDetailEditor({
  items,
  onUpdate,
  onUpdateMetric,
  onAdd,
  onRemove,
}: {
  items: ReviewHeroDetail[];
  onUpdate: (id: string, patch: Partial<ReviewHeroDetail>) => void;
  onUpdateMetric: (detailId: string, metricKey: string, value: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="p-5">
      <div className="space-y-4">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="rounded-md border border-[var(--line)] bg-transparent p-4"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="m-0 text-xs font-bold text-white">영웅 #{index + 1}</p>
                  {!item.hero_key && (
                    <span className="rounded-md bg-[rgba(255,184,92,0.14)] px-1.5 py-0.5 text-[8px] font-bold text-[#ffc779]">
                      hero_key 검수 필요
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[9px] text-[var(--muted)]">
                  표시명은 metric_key 기준 고정 라벨을 사용합니다. OCR 원문 라벨은 디버깅용으로만 보관합니다.
                </p>
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="cursor-pointer rounded-lg border border-[#503336] px-3 py-2 text-[9px] font-bold text-[#ff9b9b]"
                >
                  삭제
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <HeroField label="영웅 표시명">
                <input
                  className="field-input"
                  value={item.hero}
                  onChange={(event) => onUpdate(item.id, { hero: event.target.value })}
                  placeholder="예: 아나"
                />
              </HeroField>
              <HeroField label="hero_key">
                <input
                  className="field-input"
                  value={item.hero_key}
                  onChange={(event) => onUpdate(item.id, { hero_key: event.target.value })}
                  placeholder="예: ana"
                />
              </HeroField>
              <HeroField label="플레이 시간">
                <input
                  className="field-input"
                  value={item.play_time}
                  onChange={(event) => onUpdate(item.id, { play_time: event.target.value })}
                  placeholder="예: 05:11"
                />
              </HeroField>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="m-0 text-[11px] font-bold text-white">
                  Personal metrics
                </p>
                <span className="text-[9px] text-[var(--muted)]">
                  {item.metrics.length}개
                </span>
              </div>

              {item.metrics.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--line)] px-4 py-5 text-center text-[10px] text-[var(--muted)]">
                  OCR에서 전달된 metrics가 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {item.metrics.map((metric) => (
                    <div
                      key={metric.metric_key}
                      className={`grid gap-3 rounded-lg border px-3 py-3 sm:grid-cols-[1fr_180px] sm:items-center ${
                        metric.needs_review
                          ? "border-[rgba(255,184,92,0.45)] bg-[rgba(255,184,92,0.05)]"
                          : "border-[var(--line)] bg-[#101722]"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-bold text-white">
                            {metric.label || metric.metric_key}
                          </span>
                          {metric.needs_review && (
                            <span className="rounded-md bg-[rgba(255,184,92,0.14)] px-1.5 py-0.5 text-[8px] font-bold text-[#ffc779]">
                              검수 필요
                            </span>
                          )}
                        </div>
                        <p className="mb-0 mt-1 break-all text-[9px] text-[var(--muted)]">
                          {metric.metric_key} · {metric.scope}
                          {metric.confidence !== null
                            ? ` · confidence ${Math.round(metric.confidence * 100)}%`
                            : ""}
                        </p>
                      </div>
                      <input
                        className="field-input"
                        value={formatStatValue(metric.value)}
                        onChange={(event) =>
                          onUpdateMetric(
                            item.id,
                            metric.metric_key,
                            stripStatSeparators(event.target.value),
                          )
                        }
                        placeholder="값"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="mt-4 cursor-pointer rounded-md border border-[var(--line)] bg-[#121823] px-4 py-3 text-xs font-bold text-white hover:border-[#4b5668]"
      >
        + 플레이 영웅 추가
      </button>
    </div>
  );
}

function HeroField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label>
      <span className="mb-2 block text-[10px] font-bold text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

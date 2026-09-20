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
  const [savedAt, setSavedAt] = useState<string>("");

  useEffect(() => {
    const loaded = loadReviewDraft(matchId, defaultHero);
    setDraft(loaded);
    onChange?.(loaded);
  }, [matchId, defaultHero, onChange]);

  function commit(next: MatchReviewDraft) {
    const saved = saveReviewDraft(matchId, next);
    setDraft(saved);
    setSavedAt(new Date(saved.updated_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }));
    onChange?.(saved);
  }

  function updatePlayer(id: string, patch: Partial<ReviewPlayer>) {
    if (!draft) return;
    commit({
      ...draft,
      players: draft.players.map((player) => (player.id === id ? { ...player, ...patch } : player)),
    });
  }

  function setMe(id: string) {
    if (!draft) return;
    commit({
      ...draft,
      players: draft.players.map((player) => ({
        ...player,
        is_me: player.id === id,
        player_name: player.id === id && !player.player_name ? "나" : player.player_name,
      })),
    });
  }

  function updateHeroDetail(id: string, patch: Partial<ReviewHeroDetail>) {
    if (!draft) return;
    commit({
      ...draft,
      hero_details: draft.hero_details.map((item) => (item.id === id ? { ...item, ...patch } : item)),
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
          play_time: "",
          accuracy: "",
          critical: "",
          custom_label: "",
          custom_value: "",
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
      player.eliminations,
      player.assists,
      player.deaths,
      player.damage,
      player.healing,
      player.mitigation,
    ]);
    const playerDone = playerFields.filter((value) => value.trim()).length;
    const playerTotal = playerFields.length;

    const heroFields = draft.hero_details.flatMap((item) => [
      item.hero,
      item.play_time,
      item.accuracy,
      item.critical,
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
      <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 text-xs text-[var(--muted)]">
        OCR 검수 편집기를 준비하는 중...
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
      <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="m-0 text-sm font-bold">OCR 구조화 데이터 검수</p>
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            실제 OCR이 붙으면 이 표에 자동으로 값이 들어오고, 사용자가 틀린 값만 고칩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && <span className="text-[9px] text-[var(--muted)]">자동 저장 {savedAt}</span>}
          <button
            type="button"
            onClick={resetDraft}
            className="cursor-pointer rounded-lg border border-[var(--line)] bg-[#0d1118] px-3 py-2 text-[10px] font-bold text-[var(--muted)] hover:text-white"
          >
            초기화
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-[var(--line)] bg-[#0d1118] px-4 py-3">
        <TabButton active={tab === "scoreboard"} onClick={() => setTab("scoreboard")} label="10인 스코어보드" progress={completion.players} />
        <TabButton active={tab === "hero"} onClick={() => setTab("hero")} label="내 영웅 상세" progress={completion.hero} />
      </div>

      {tab === "scoreboard" ? (
        <ScoreboardEditor players={draft.players} onUpdate={updatePlayer} onSetMe={setMe} />
      ) : (
        <HeroDetailEditor
          items={draft.hero_details}
          onUpdate={updateHeroDetail}
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
          ? "border-[rgba(249,158,26,0.42)] bg-[var(--orange-soft)] text-[var(--orange)]"
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
      <div className="min-w-[1100px]">
        <ScoreboardTable title="우리 팀" rows={ally} onUpdate={onUpdate} onSetMe={onSetMe} />
        <ScoreboardTable title="상대 팀" rows={enemy} onUpdate={onUpdate} onSetMe={onSetMe} />
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
        <span className="text-xs font-black text-white">{title}</span>
        <span className="text-[9px] text-[var(--muted)]">5명</span>
      </div>

      <div className="grid grid-cols-[46px_120px_110px_repeat(6,90px)] gap-2 border-b border-[var(--line)] px-4 py-2 text-[9px] font-black text-[var(--muted)]">
        <span>나</span>
        <span>닉네임</span>
        <span>영웅</span>
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
          className={`grid grid-cols-[46px_120px_110px_repeat(6,90px)] gap-2 border-b border-[var(--line)] px-4 py-2 last:border-b-0 ${
            player.is_me ? "bg-[rgba(249,158,26,0.05)]" : "bg-[var(--panel)]"
          }`}
        >
          <button
            type="button"
            onClick={() => onSetMe(player.id)}
            className={`cursor-pointer rounded-lg border text-[9px] font-black ${
              player.is_me
                ? "border-[rgba(249,158,26,0.45)] bg-[var(--orange-soft)] text-[var(--orange)]"
                : "border-[var(--line)] bg-[#0d1118] text-[var(--muted)]"
            }`}
          >
            {player.is_me ? "ME" : player.slot}
          </button>

          <CellInput value={player.player_name} onChange={(value) => onUpdate(player.id, { player_name: value })} placeholder="닉네임" />
          <CellInput value={player.hero} onChange={(value) => onUpdate(player.id, { hero: value })} placeholder="영웅" />
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
      value={value}
      onChange={(event) => onChange(event.target.value)}
      inputMode={numeric ? "numeric" : "text"}
      placeholder={placeholder}
      className="w-full rounded-lg border border-[var(--line)] bg-[#0a0d12] px-2 py-2 text-[10px] text-white outline-none placeholder:text-[#525c6e] focus:border-[var(--orange)]"
    />
  );
}

function HeroDetailEditor({
  items,
  onUpdate,
  onAdd,
  onRemove,
}: {
  items: ReviewHeroDetail[];
  onUpdate: (id: string, patch: Partial<ReviewHeroDetail>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="p-5">
      <div className="space-y-4">
        {items.map((item, index) => (
          <div key={item.id} className="rounded-xl border border-[var(--line)] bg-[#0d1118] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="m-0 text-xs font-bold text-white">영웅 #{index + 1}</p>
                <p className="mt-1 text-[9px] text-[var(--muted)]">한 경기에서 여러 영웅을 플레이한 경우 추가합니다.</p>
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

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <HeroField label="영웅">
                <input className="field-input" value={item.hero} onChange={(event) => onUpdate(item.id, { hero: event.target.value })} placeholder="예: 리퍼" />
              </HeroField>
              <HeroField label="플레이 시간">
                <input className="field-input" value={item.play_time} onChange={(event) => onUpdate(item.id, { play_time: event.target.value })} placeholder="예: 08:42" />
              </HeroField>
              <HeroField label="명중률">
                <input className="field-input" value={item.accuracy} onChange={(event) => onUpdate(item.id, { accuracy: event.target.value })} placeholder="예: 37%" />
              </HeroField>
              <HeroField label="치명타">
                <input className="field-input" value={item.critical} onChange={(event) => onUpdate(item.id, { critical: event.target.value })} placeholder="예: 12%" />
              </HeroField>
              <HeroField label="영웅 고유 지표 이름">
                <input className="field-input" value={item.custom_label} onChange={(event) => onUpdate(item.id, { custom_label: event.target.value })} placeholder="예: 생명력 흡수" />
              </HeroField>
              <HeroField label="영웅 고유 지표 값">
                <input className="field-input" value={item.custom_value} onChange={(event) => onUpdate(item.id, { custom_value: event.target.value })} placeholder="값" />
              </HeroField>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAdd}
        className="mt-4 cursor-pointer rounded-xl border border-[var(--line)] bg-[#121823] px-4 py-3 text-xs font-bold text-white hover:border-[#4b5668]"
      >
        + 플레이 영웅 추가
      </button>
    </div>
  );
}

function HeroField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span className="mb-2 block text-[10px] font-bold text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

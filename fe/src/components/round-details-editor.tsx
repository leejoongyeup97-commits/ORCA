"use client";

import type { MapSubmapOption, MatchResult, RoundDetail } from "@/lib/backend";

const RESULT_LABELS: Record<MatchResult, string> = {
  win: "승리",
  loss: "패배",
  draw: "무승부",
  unknown: "미확인",
};

export default function RoundDetailsEditor({
  rounds,
  submaps,
  loading,
  enabled,
  onChange,
}: {
  rounds: RoundDetail[];
  submaps: MapSubmapOption[];
  loading: boolean;
  enabled: boolean;
  onChange: (rounds: RoundDetail[]) => void;
}) {
  function addRound() {
    onChange([
      ...rounds,
      {
        order: rounds.length + 1,
        submap: submaps[0]?.submap_name ?? "",
        result: "unknown",
      },
    ]);
  }

  function loadExampleRounds() {
    onChange([
      { order: 1, submap: "예시 세부맵 A", result: "win" },
      { order: 2, submap: "예시 세부맵 B", result: "loss" },
      { order: 3, submap: "예시 세부맵 C", result: "win" },
    ]);
  }

  function updateRound(index: number, patch: Partial<RoundDetail>) {
    onChange(
      rounds.map((round, rowIndex) =>
        rowIndex === index
          ? { ...round, ...patch, order: rowIndex + 1 }
          : { ...round, order: rowIndex + 1 },
      ),
    );
  }

  function removeRound(index: number) {
    onChange(
      rounds
        .filter((_, rowIndex) => rowIndex !== index)
        .map((round, rowIndex) => ({ ...round, order: rowIndex + 1 })),
    );
  }

  if (!enabled) return null;

  return (
    <section className="md:col-span-2 border-t border-[var(--line)] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-[15px] font-semibold text-white">세트별 세부맵 · 결과</h2>
          <p className="mt-1 text-[12px] leading-6 text-[var(--muted)]">
            세부맵을 선택하고 각 세트의 승패를 기록하세요. 진행 순서는 위에서 아래로 자동 저장됩니다.
          </p>
        </div>
        <button
          type="button"
          disabled={loading || submaps.length === 0}
          onClick={addRound}
          className="app-secondary-button cursor-pointer"
        >
          세트 추가
        </button>
      </div>

      {loading ? (
        <p className="mt-4 text-[12px] text-[var(--muted)]">세부맵 기준 데이터를 불러오는 중...</p>
      ) : rounds.length === 0 && submaps.length === 0 ? (
        <div className="mt-4 border-y border-[var(--line)] py-4">
          <p className="m-0 text-[12px] leading-6 text-[var(--muted)]">
            현재 맵/모드에 등록된 세부맵 기준 데이터가 없습니다.
          </p>
          <button
            type="button"
            onClick={loadExampleRounds}
            className="app-secondary-button mt-3 cursor-pointer"
          >
            예시 데이터 채우기
          </button>
        </div>
      ) : rounds.length === 0 ? (
        <p className="mt-4 border-y border-[var(--line)] py-3 text-[12px] leading-6 text-[var(--muted)]">
          아직 입력된 세트가 없습니다. ‘세트 추가’를 눌러 1세트부터 기록하세요.
        </p>
      ) : null}

      {rounds.length > 0 && (
        <div className="mt-4 border-t border-[var(--line)]">
          {rounds.map((round, index) => (
            <div
              key={`${index}-${round.order}`}
              className="grid gap-3 border-b border-[var(--line-soft)] py-3 md:grid-cols-[72px_1fr_180px_auto] md:items-center"
            >
              <span className="text-[12px] font-semibold text-white">{index + 1}세트</span>

              <select
                value={round.submap}
                onChange={(event) => updateRound(index, { submap: event.target.value })}
                className="field-input"
              >
                <option value="">세부맵 선택</option>
                {submaps.length > 0 ? (
                  submaps.map((submap) => (
                    <option key={submap.submap_key} value={submap.submap_name}>
                      {submap.submap_name}
                    </option>
                  ))
                ) : round.submap ? (
                  <option value={round.submap}>{round.submap}</option>
                ) : null}
              </select>

              <select
                value={round.result}
                onChange={(event) => updateRound(index, { result: event.target.value as MatchResult })}
                className="field-input"
              >
                {(Object.keys(RESULT_LABELS) as MatchResult[]).map((result) => (
                  <option key={result} value={result}>{RESULT_LABELS[result]}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => removeRound(index)}
                className="app-danger-button cursor-pointer"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

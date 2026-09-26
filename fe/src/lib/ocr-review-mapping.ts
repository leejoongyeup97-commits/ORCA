import type { OcrExtractResult } from "@/lib/ocr-client";
import { getPersonalMetricLabel } from "@/lib/personal-metric-labels";
import type {
  MatchReviewDraft,
  ReviewHeroMetric,
} from "@/lib/review-draft";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function normalizeMetric(value: unknown): ReviewHeroMetric | null {
  const record = asRecord(value);
  if (!record) return null;

  const metricKey = asString(record.metric_key).trim();
  if (!metricKey) return null;

  const confidence =
    typeof record.confidence === "number" && Number.isFinite(record.confidence)
      ? record.confidence
      : null;

  return {
    metric_key: metricKey,
    scope: asString(record.scope) || "hero_specific",
    label: getPersonalMetricLabel(metricKey),
    label_raw: asString(record.label_raw),
    value: asString(record.value),
    confidence,
    needs_review: record.needs_review === true,
  };
}

export function applyTeamOcrResult(
  draft: MatchReviewDraft,
  result: OcrExtractResult,
): MatchReviewDraft {
  const rows = Array.isArray(result.players) ? result.players : [];
  if (rows.length === 0) return draft;

  const nextPlayers = draft.players.map((player) => {
    const target = rows.find((row) => {
      const record = asRecord(row);
      if (!record) return false;
      const team = record.team === "blue" ? "ally" : record.team === "red" ? "enemy" : null;
      return team === player.team && Number(record.slot) === player.slot;
    });

    const record = asRecord(target);
    if (!record) return player;

    const hasIsMe = typeof record.is_me === "boolean";
    const isMe = hasIsMe ? record.is_me === true : player.is_me;

    return {
      ...player,
      is_me: isMe,
      player_name: isMe ? "나" : "",
      hero: asString(record.hero_id) || player.hero,
      hero_key: asString(record.hero_key) || player.hero_key,
      eliminations: asString(record.elims) || player.eliminations,
      assists: asString(record.assists) || player.assists,
      deaths: asString(record.deaths) || player.deaths,
      damage: asString(record.damage) || player.damage,
      healing: asString(record.healing) || player.healing,
      mitigation: asString(record.mitigation) || player.mitigation,
    };
  });

  return { ...draft, players: nextPlayers };
}

export function applyPersonalOcrResults(
  draft: MatchReviewDraft,
  results: OcrExtractResult[],
): MatchReviewDraft {
  if (results.length === 0) return draft;

  const myPlayer = draft.players.find((player) => player.is_me);

  const heroDetails = results.map((result, index) => {
    const current = draft.hero_details[index];
    const metrics = Array.isArray(result.metrics)
      ? result.metrics.map(normalizeMetric).filter((item): item is ReviewHeroMetric => Boolean(item))
      : current?.metrics ?? [];

    return {
      // Never reuse hero #1's id for newly discovered Personal cards.
      id: current?.id || crypto.randomUUID(),
      hero:
        asString(result.hero_id) ||
        current?.hero ||
        (index === 0 ? myPlayer?.hero || "" : ""),
      hero_key: asString(result.hero_key) || current?.hero_key || "",
      play_time: asString(result.play_time) || current?.play_time || "",
      metrics,
    };
  });

  return { ...draft, hero_details: heroDetails };
}

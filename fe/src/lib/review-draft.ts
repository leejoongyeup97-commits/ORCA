export type ReviewTeam = "ally" | "enemy";

export type ReviewPlayer = {
  id: string;
  team: ReviewTeam;
  slot: number;
  is_me: boolean;
  player_name: string;
  hero: string;
  hero_key: string;
  eliminations: string;
  assists: string;
  deaths: string;
  damage: string;
  healing: string;
  mitigation: string;
};

export type ReviewHeroMetric = {
  metric_key: string;
  scope: string;
  label: string;
  value: string;
  confidence: number | null;
  needs_review: boolean;
};

export type ReviewHeroDetail = {
  id: string;
  hero: string;
  hero_key: string;
  play_time: string;
  metrics: ReviewHeroMetric[];
};

export type MatchReviewDraft = {
  players: ReviewPlayer[];
  hero_details: ReviewHeroDetail[];
  updated_at: string;
};

const STORAGE_PREFIX = "ow-insight-review-draft:";

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}

function asNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function migrateMetric(value: unknown): ReviewHeroMetric | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const metricKey = asString(record.metric_key).trim();
  if (!metricKey) return null;

  return {
    metric_key: metricKey,
    scope: asString(record.scope) || "hero_specific",
    label: asString(record.label) || asString(record.label_raw) || metricKey,
    value:
      typeof record.value === "number" && Number.isFinite(record.value)
        ? String(record.value)
        : asString(record.value),
    confidence: asNullableNumber(record.confidence),
    needs_review: asBoolean(record.needs_review),
  };
}

function migrateHeroDetail(value: unknown, defaultHero = ""): ReviewHeroDetail {
  const record =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  const metrics = Array.isArray(record.metrics)
    ? record.metrics.map(migrateMetric).filter((item): item is ReviewHeroMetric => Boolean(item))
    : [];

  // One-time compatibility for drafts created before the metrics[] contract.
  const legacyAccuracy = asString(record.accuracy);
  const legacyCritical = asString(record.critical);
  if (metrics.length === 0) {
    if (legacyAccuracy) {
      metrics.push({
        metric_key: "weapon_accuracy",
        scope: "common",
        label: "무기 명중률",
        value: legacyAccuracy,
        confidence: null,
        needs_review: false,
      });
    }
    if (legacyCritical) {
      metrics.push({
        metric_key: "critical_hit_accuracy",
        scope: "common",
        label: "치명타 명중률",
        value: legacyCritical,
        confidence: null,
        needs_review: false,
      });
    }
  }

  return {
    id: asString(record.id) || crypto.randomUUID(),
    hero: asString(record.hero) || defaultHero,
    hero_key: asString(record.hero_key),
    play_time: asString(record.play_time),
    metrics,
  };
}

export function createDefaultReviewDraft(defaultHero = ""): MatchReviewDraft {
  const players: ReviewPlayer[] = [];

  for (const team of ["ally", "enemy"] as const) {
    for (let slot = 1; slot <= 5; slot += 1) {
      players.push({
        id: `${team}-${slot}`,
        team,
        slot,
        is_me: false,
        player_name: "",
        hero: "",
        hero_key: "",
        eliminations: "",
        assists: "",
        deaths: "",
        damage: "",
        healing: "",
        mitigation: "",
      });
    }
  }

  return {
    players,
    hero_details: [
      {
        id: crypto.randomUUID(),
        hero: defaultHero,
        hero_key: "",
        play_time: "",
        metrics: [],
      },
    ],
    updated_at: new Date().toISOString(),
  };
}

export function loadReviewDraft(matchId: string, defaultHero = ""): MatchReviewDraft {
  if (typeof window === "undefined") return createDefaultReviewDraft(defaultHero);

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${matchId}`);
    if (!raw) return createDefaultReviewDraft(defaultHero);

    const parsed = JSON.parse(raw) as Partial<MatchReviewDraft>;
    if (!Array.isArray(parsed.players) || !Array.isArray(parsed.hero_details)) {
      return createDefaultReviewDraft(defaultHero);
    }

    const defaults = createDefaultReviewDraft(defaultHero);
    const players = defaults.players.map((fallback) => {
      const source = parsed.players?.find(
        (player) => player?.team === fallback.team && Number(player?.slot) === fallback.slot,
      ) as Partial<ReviewPlayer> | undefined;

      if (!source) return fallback;
      return {
        ...fallback,
        ...source,
        id: source.id || fallback.id,
        team: fallback.team,
        slot: fallback.slot,
        hero: asString(source.hero),
        hero_key: asString(source.hero_key),
        player_name: asString(source.player_name),
      };
    });

    return {
      players,
      hero_details: parsed.hero_details.map((item) => migrateHeroDetail(item, defaultHero)),
      updated_at: asString(parsed.updated_at) || new Date().toISOString(),
    };
  } catch {
    return createDefaultReviewDraft(defaultHero);
  }
}

export function saveReviewDraft(matchId: string, draft: MatchReviewDraft) {
  const next = { ...draft, updated_at: new Date().toISOString() };
  localStorage.setItem(`${STORAGE_PREFIX}${matchId}`, JSON.stringify(next));
  return next;
}

export function toConfirmPlayers(draft: MatchReviewDraft) {
  return draft.players.map(({ id: _id, ...player }) => player);
}

export function toConfirmHeroDetails(draft: MatchReviewDraft) {
  return draft.hero_details.map((detail) => {
    const byKey = new Map(detail.metrics.map((metric) => [metric.metric_key, metric.value]));
    const heroSpecific = Object.fromEntries(
      detail.metrics
        .filter((metric) => metric.scope === "hero_specific" && metric.metric_key)
        .map((metric) => [metric.metric_key, metric.value]),
    );

    return {
      hero: detail.hero,
      hero_key: detail.hero_key,
      play_time: detail.play_time,
      accuracy: byKey.get("weapon_accuracy") || "",
      critical: byKey.get("critical_hit_accuracy") || "",
      hero_specific: heroSpecific,
    };
  });
}

export function removeReviewDraft(matchId: string) {
  localStorage.removeItem(`${STORAGE_PREFIX}${matchId}`);
}

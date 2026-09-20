export type ReviewTeam = "ally" | "enemy";

export type ReviewPlayer = {
  id: string;
  team: ReviewTeam;
  slot: number;
  is_me: boolean;
  player_name: string;
  hero: string;
  eliminations: string;
  assists: string;
  deaths: string;
  damage: string;
  healing: string;
  mitigation: string;
};

export type ReviewHeroDetail = {
  id: string;
  hero: string;
  play_time: string;
  accuracy: string;
  critical: string;
  custom_label: string;
  custom_value: string;
};

export type MatchReviewDraft = {
  players: ReviewPlayer[];
  hero_details: ReviewHeroDetail[];
  updated_at: string;
};

const STORAGE_PREFIX = "ow-insight-review-draft:";

export function createDefaultReviewDraft(defaultHero = ""): MatchReviewDraft {
  const players: ReviewPlayer[] = [];

  for (const team of ["ally", "enemy"] as const) {
    for (let slot = 1; slot <= 5; slot += 1) {
      players.push({
        id: `${team}-${slot}`,
        team,
        slot,
        is_me: team === "ally" && slot === 1,
        player_name: team === "ally" && slot === 1 ? "나" : "",
        hero: team === "ally" && slot === 1 ? defaultHero : "",
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
        play_time: "",
        accuracy: "",
        critical: "",
        custom_label: "",
        custom_value: "",
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

    const parsed = JSON.parse(raw) as MatchReviewDraft;
    if (!Array.isArray(parsed.players) || !Array.isArray(parsed.hero_details)) {
      return createDefaultReviewDraft(defaultHero);
    }

    return parsed;
  } catch {
    return createDefaultReviewDraft(defaultHero);
  }
}

export function saveReviewDraft(matchId: string, draft: MatchReviewDraft) {
  const next = { ...draft, updated_at: new Date().toISOString() };
  localStorage.setItem(`${STORAGE_PREFIX}${matchId}`, JSON.stringify(next));
  return next;
}

export function removeReviewDraft(matchId: string) {
  localStorage.removeItem(`${STORAGE_PREFIX}${matchId}`);
}

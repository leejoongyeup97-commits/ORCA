import type { MatchSide } from "@/lib/backend";

const NEUTRAL_SIDE_GAME_MODE_TOKENS = [
  "쟁탈",
  "플래시포인트",
  "밀기",
  "control",
  "flashpoint",
  "push",
];

export function isNeutralSideGameMode(gameMode: string) {
  const normalized = gameMode.trim().toLowerCase();
  return NEUTRAL_SIDE_GAME_MODE_TOKENS.some((token) => normalized.includes(token));
}

export function normalizeSideForGameMode(gameMode: string, side: MatchSide): MatchSide {
  return isNeutralSideGameMode(gameMode) ? "neutral" : side;
}

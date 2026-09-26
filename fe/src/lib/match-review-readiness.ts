import type { MatchImportView, MatchListItem, RoundDetail } from "@/lib/backend";
import type { MatchReviewDraft } from "@/lib/review-draft";

export type ReviewCheck = {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
};

export function isRoundBasedMode(gameMode: string) {
  const normalized = gameMode.trim().toLowerCase();
  return (
    normalized.includes("control") ||
    normalized.includes("쟁탈") ||
    normalized.includes("flashpoint") ||
    normalized.includes("플래시포인트")
  );
}

export function basicReviewReady(match: MatchListItem) {
  const summary = match.files.some((file) => file.screen_type === "summary");
  const team = match.files.some((file) => file.screen_type === "team");
  const personal = match.files.some((file) => file.screen_type === "personal");
  const noUnknown = !match.files.some((file) => file.screen_type === "unknown");
  const coreFields =
    Boolean(match.editable.map_name.trim()) &&
    Boolean(match.editable.game_mode.trim()) &&
    match.editable.result !== "unknown";

  return summary && team && personal && noUnknown && coreFields;
}

export function buildReviewChecks(
  match: MatchImportView,
  draft: MatchReviewDraft | null,
  rounds: RoundDetail[],
): ReviewCheck[] {
  const checks: ReviewCheck[] = [
    {
      key: "summary",
      label: "Summary 이미지",
      ok: match.files.some((file) => file.screen_type === "summary"),
    },
    {
      key: "team",
      label: "Team 이미지",
      ok: match.files.some((file) => file.screen_type === "team"),
    },
    {
      key: "personal",
      label: "Personal 이미지",
      ok: match.files.some((file) => file.screen_type === "personal"),
    },
    {
      key: "classified",
      label: "미분류 이미지 없음",
      ok: !match.files.some((file) => file.screen_type === "unknown"),
    },
    {
      key: "match_fields",
      label: "맵 · 모드 · 결과 확인",
      ok:
        Boolean(match.editable.map_name.trim()) &&
        Boolean(match.editable.game_mode.trim()) &&
        match.editable.result !== "unknown",
    },
  ];

  if (draft) {
    checks.push({
      key: "review_draft",
      label: "OCR 구조화 데이터 검수",
      ok:
        draft.players.some((player) => player.is_me) &&
        draft.hero_details.some((detail) => Boolean(detail.hero.trim() || detail.hero_key.trim())),
      detail: "내 플레이어와 영웅 정보",
    });
  }

  if (isRoundBasedMode(match.editable.game_mode)) {
    checks.push({
      key: "rounds",
      label: "세트 상세 입력",
      ok:
        rounds.length > 0 &&
        rounds.every((round) => Boolean(round.submap.trim()) && round.result !== "unknown"),
    });
  }

  return checks;
}

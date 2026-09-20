import type {
  BackendScreenType,
  EditableMatchFields,
  MatchManagementAdapter,
  MatchResult,
} from "@/lib/backend";
import { extractScreenshot, type OcrExtractResult, type OcrScreenType } from "@/lib/ocr-client";
import {
  loadReviewDraft,
  saveReviewDraft,
  type MatchReviewDraft,
} from "@/lib/review-draft";

export type OcrSourceFile = {
  screen_type: BackendScreenType;
  file: File;
};

export type StoredOcrFileResult = {
  filename: string;
  screen_type: BackendScreenType;
  ok: boolean;
  result?: OcrExtractResult;
  error?: string;
};

export type StoredOcrBundle = {
  match_id: string;
  generated_at: string;
  files: StoredOcrFileResult[];
};

const STORAGE_PREFIX = "ow-insight-ocr-results:";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNumberString(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function secondsToClock(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "";
  const total = Math.round(value);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function collectConfidenceValues(value: unknown, inConfidence = false, output: number[] = []) {
  if (typeof value === "number" && inConfidence && value >= 0 && value <= 1) {
    output.push(value);
    return output;
  }

  if (!value || typeof value !== "object") return output;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    collectConfidenceValues(child, inConfidence || key === "confidence", output);
  }

  return output;
}

function averageConfidence(results: StoredOcrFileResult[]) {
  const values = results
    .filter((item) => item.ok && item.result)
    .flatMap((item) => collectConfidenceValues(item.result));

  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function summaryPatch(result: OcrExtractResult): Partial<EditableMatchFields> {
  const patch: Partial<EditableMatchFields> = {};
  const rawResult = result.result;
  if (rawResult === "win" || rawResult === "loss" || rawResult === "draw") {
    patch.result = rawResult as MatchResult;
  }

  const mode = asString(result.mode).trim();
  if (mode) patch.game_mode = mode;

  const duration = secondsToClock(result.duration_seconds);
  if (duration) patch.match_duration = duration;

  return patch;
}

function applyTeamResult(draft: MatchReviewDraft, result: OcrExtractResult) {
  const rows = Array.isArray(result.players) ? result.players : [];
  if (rows.length === 0) return draft;

  return {
    ...draft,
    players: draft.players.map((player) => {
      const target = rows.find((row) => {
        const record = asRecord(row);
        if (!record) return false;
        const team = record.team === "blue" ? "ally" : record.team === "red" ? "enemy" : null;
        return team === player.team && Number(record.slot) === player.slot;
      });
      const record = asRecord(target);
      if (!record) return player;

      const isMe = player.team === "ally" && record.is_me === true;
      const nextName =
        player.team === "ally"
          ? isMe
            ? "나"
            : player.player_name === "나"
              ? ""
              : player.player_name
          : player.player_name;

      return {
        ...player,
        is_me: isMe,
        player_name: nextName,
        hero: asString(record.hero_id) || player.hero,
        eliminations: asNumberString(record.elims) || player.eliminations,
        assists: asNumberString(record.assists) || player.assists,
        deaths: asNumberString(record.deaths) || player.deaths,
        damage: asNumberString(record.damage) || player.damage,
        healing: asNumberString(record.healing) || player.healing,
        mitigation: asNumberString(record.mitigation) || player.mitigation,
      };
    }),
  };
}

function applyPersonalResults(draft: MatchReviewDraft, results: OcrExtractResult[]) {
  if (results.length === 0) return draft;

  const heroDetails = results.map((result, index) => {
    const current = draft.hero_details[index] ?? draft.hero_details[0];
    const known = asRecord(result.known_metrics);
    const per10 = known ? asString(known.per_10_min_average) : "";

    return {
      id: current?.id || crypto.randomUUID(),
      hero: current?.hero || "",
      play_time: asString(result.play_time) || current?.play_time || "",
      accuracy: (known ? asString(known.weapon_accuracy) : "") || current?.accuracy || "",
      critical: current?.critical || "",
      custom_label: per10 ? "10분당 평균" : current?.custom_label || "",
      custom_value: per10 || current?.custom_value || "",
    };
  });

  return { ...draft, hero_details: heroDetails };
}

export function getStoredOcrBundle(matchId: string): StoredOcrBundle | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${matchId}`);
    return raw ? (JSON.parse(raw) as StoredOcrBundle) : null;
  } catch {
    return null;
  }
}

export async function runRealOcrForMatch(
  adapter: MatchManagementAdapter,
  matchId: string,
  files: OcrSourceFile[],
) {
  await adapter.setOcrState(matchId, "processing_ocr", {
    message: "실제 OCR 서버에서 이미지를 읽고 있습니다.",
  });

  const results: StoredOcrFileResult[] = [];

  for (const item of files) {
    if (item.screen_type === "unknown") {
      results.push({
        filename: item.file.name,
        screen_type: item.screen_type,
        ok: false,
        error: "미분류 이미지는 OCR에서 제외했습니다.",
      });
      continue;
    }

    try {
      const result = await extractScreenshot(item.screen_type as OcrScreenType, item.file);
      results.push({
        filename: item.file.name,
        screen_type: item.screen_type,
        ok: true,
        result,
      });
    } catch (error) {
      results.push({
        filename: item.file.name,
        screen_type: item.screen_type,
        ok: false,
        error: error instanceof Error ? error.message : "OCR 처리 실패",
      });
    }
  }

  const generatedAt = new Date().toISOString();
  const bundle: StoredOcrBundle = {
    match_id: matchId,
    generated_at: generatedAt,
    files: results,
  };
  localStorage.setItem(`${STORAGE_PREFIX}${matchId}`, JSON.stringify(bundle));

  const summary = results.find(
    (item) => item.ok && item.screen_type === "summary" && item.result,
  )?.result;
  if (summary) {
    const patch = summaryPatch(summary);
    if (Object.keys(patch).length > 0) {
      await adapter.updateMatchImport(matchId, patch);
    }
  }

  let reviewDraft = loadReviewDraft(matchId);
  const team = results.find(
    (item) => item.ok && item.screen_type === "team" && item.result,
  )?.result;
  if (team) reviewDraft = applyTeamResult(reviewDraft, team);

  const personal = results
    .filter((item) => item.ok && item.screen_type === "personal" && item.result)
    .map((item) => item.result as OcrExtractResult);
  reviewDraft = applyPersonalResults(reviewDraft, personal);
  saveReviewDraft(matchId, reviewDraft);

  const successCount = results.filter((item) => item.ok).length;
  const attemptedCount = results.filter((item) => item.screen_type !== "unknown").length;
  const confidence = averageConfidence(results);

  const status = successCount > 0 ? "needs_review" : "failed";
  const message =
    successCount > 0
      ? `실제 OCR 완료 · ${successCount}/${attemptedCount} 화면 성공${successCount < attemptedCount ? " · 일부 실패" : ""}`
      : "OCR 서버 처리에 실패했습니다. OCR 서버 상태를 확인해 주세요.";

  return adapter.setOcrState(matchId, status, {
    generated_at: generatedAt,
    overall_confidence: confidence,
    message,
  });
}

import type {
  BackendScreenType,
  EditableMatchFields,
  MatchManagementAdapter,
  MatchResult,
} from "@/lib/backend";
import { extractScreenshot, type OcrExtractResult, type OcrScreenType } from "@/lib/ocr-client";
import { loadReviewDraft, saveReviewDraft } from "@/lib/review-draft";
import { applyPersonalOcrResults, applyTeamOcrResult } from "@/lib/ocr-review-mapping";

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

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
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
  if (team) reviewDraft = applyTeamOcrResult(reviewDraft, team);

  const personal = results
    .filter((item) => item.ok && item.screen_type === "personal" && item.result)
    .map((item) => item.result as OcrExtractResult);
  reviewDraft = applyPersonalOcrResults(reviewDraft, personal);
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

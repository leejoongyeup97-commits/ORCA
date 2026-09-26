import type {
  CreateMatchDraftFile,
  MatchImportView,
  MatchManagementAdapter,
  OcrExecutionProgress,
} from "@/lib/backend";
import {
  rerunRealOcrFilesForMatch,
  runRealOcrForMatch,
  type OcrProgressEvent,
} from "@/lib/ocr-integration";
import { getSavedScreenshotFilesByName } from "@/lib/screenshot-folder";

type RerunOptions = {
  onlyFilenames?: string[];
  mergeWithExisting?: boolean;
  onProgress?: (progress: OcrExecutionProgress) => void;
};

function isProcessable(file: CreateMatchDraftFile) {
  return ["summary", "team", "personal", "replay"].includes(file.screen_type);
}

export async function rerunMatchOcrFromSavedFolder(
  adapter: MatchManagementAdapter,
  match: MatchImportView,
  options: RerunOptions = {},
) {
  const selected = match.files.filter(
    (file) =>
      isProcessable(file) &&
      (!options.onlyFilenames || options.onlyFilenames.includes(file.original_name)),
  );

  if (selected.length === 0) {
    throw new Error("OCR을 다시 실행할 이미지가 없습니다.");
  }

  const filenames = selected.map((file) => file.original_name);
  const localFiles = await getSavedScreenshotFilesByName(filenames);
  const missing = filenames.filter((name) => !localFiles.has(name));

  if (missing.length > 0) {
    throw new Error(
      `원본 스크린샷을 찾지 못했습니다: ${missing.join(", ")}. 설정의 스크린샷 폴더를 확인해 주세요.`,
    );
  }

  let successCount = 0;
  let errorCount = 0;
  const total = selected.length;

  const handleProgress = (event: OcrProgressEvent) => {
    if (event.stage === "file_success") successCount += 1;
    if (event.stage === "file_error" || event.stage === "file_skipped") errorCount += 1;

    const current =
      event.stage === "file_start"
        ? Math.max(0, Math.min(total, event.current))
        : event.stage === "completed"
          ? total
          : Math.max(0, Math.min(total, event.current));

    options.onProgress?.({
      stage: event.stage === "file_skipped" ? "file_error" : event.stage,
      current,
      total,
      percent: total === 0 ? 0 : Math.round((current / total) * 100),
      success_count: successCount,
      error_count: errorCount,
      message: event.message,
      filename: event.filename,
      screen_type: event.screen_type,
    });
  };

  const sourceFiles = selected.map((meta) => ({
    screen_type: meta.screen_type,
    file: localFiles.get(meta.original_name)!,
  }));

  return options.mergeWithExisting
    ? rerunRealOcrFilesForMatch(adapter, match.match_id, sourceFiles, {
        onProgress: handleProgress,
      })
    : runRealOcrForMatch(adapter, match.match_id, sourceFiles, {
        onProgress: handleProgress,
      });
}

import type { BackendScreenType } from "@/lib/backend";

export type OcrScreenType = Exclude<BackendScreenType, "unknown">;

export type OcrExtractResult = Record<string, unknown> & {
  screen_type?: OcrScreenType;
  ocr_version?: string;
};

export type OcrHealth = {
  ok: boolean;
  service?: string;
  version?: string;
  tesseract?: {
    executable?: string;
    languages?: string[];
    has_eng?: boolean;
    has_kor?: boolean;
  };
  tesseract_error?: string;
};

const OCR_API_URL =
  process.env.NEXT_PUBLIC_OCR_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8001";

export function getOcrApiUrl() {
  return OCR_API_URL;
}

export async function getOcrHealth(signal?: AbortSignal): Promise<OcrHealth> {
  const response = await fetch(`${OCR_API_URL}/health`, { signal });
  if (!response.ok) throw new Error(`OCR_HEALTH_${response.status}`);
  return (await response.json()) as OcrHealth;
}

export async function extractScreenshot(
  screenType: OcrScreenType,
  file: File,
): Promise<OcrExtractResult> {
  const form = new FormData();
  form.append("screen_type", screenType);
  form.append("file", file, file.name);

  const response = await fetch(`${OCR_API_URL}/extract`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail || `OCR_EXTRACT_${response.status}`);
  }

  return (await response.json()) as OcrExtractResult;
}

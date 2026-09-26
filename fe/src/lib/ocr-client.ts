import type { BackendScreenType } from "@/lib/backend";

export type OcrScreenType = Exclude<BackendScreenType, "unknown">;

export type TeamOcrPlayer = {
  team?: "blue" | "red";
  slot?: number;
  is_me?: boolean;
  hero_key?: string;
  hero_id?: string;
  elims?: number | string;
  assists?: number | string;
  deaths?: number | string;
  damage?: number | string;
  healing?: number | string;
  mitigation?: number | string;
};

export type PersonalOcrMetric = {
  metric_key: string;
  scope: string;
  label_raw: string;
  value: string | number;
  confidence: number;
  needs_review: boolean;
};

export type OcrExtractResult = Record<string, unknown> & {
  screen_type?: OcrScreenType;
  ocr_version?: string;
  hero_key?: string;
  hero_id?: string;
  play_time?: string;
  metrics?: PersonalOcrMetric[];
  players?: TeamOcrPlayer[];
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
  let response: Response;
  try {
    response = await fetch(`${OCR_API_URL}/health`, { signal });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    throw new Error(
      `OCR 서버에 연결할 수 없습니다. ${OCR_API_URL} 가 실행 중인지 확인해 주세요.\n${raw}`,
    );
  }
  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    throw new Error(
      `OCR_HEALTH_${response.status} ${response.statusText}${raw ? `\n${raw}` : ""}`,
    );
  }
  return (await response.json()) as OcrHealth;
}

export async function extractScreenshot(
  screenType: OcrScreenType,
  file: File,
): Promise<OcrExtractResult> {
  const form = new FormData();
  form.append("screen_type", screenType);
  form.append("file", file, file.name);

  let response: Response;
  try {
    response = await fetch(`${OCR_API_URL}/extract`, {
      method: "POST",
      body: form,
    });
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    throw new Error(
      `OCR 서버에 연결할 수 없습니다. ${OCR_API_URL} 가 실행 중인지 확인해 주세요.\n${raw}`,
    );
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => "");
    let detail = "";
    try {
      const payload = raw ? (JSON.parse(raw) as { detail?: unknown }) : null;
      detail = typeof payload?.detail === "string" ? payload.detail : "";
    } catch {
      detail = "";
    }

    throw new Error(
      [
        `OCR_EXTRACT_${response.status} ${response.statusText}`,
        detail,
        raw && raw !== detail ? raw : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return (await response.json()) as OcrExtractResult;
}

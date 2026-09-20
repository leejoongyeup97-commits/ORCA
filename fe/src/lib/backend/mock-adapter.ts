import type {
  CompleteMatchUploadInput,
  ConfirmMatchInput,
  CreateMatchDraftInput,
  CreateMatchDraftResult,
  EditableMatchFields,
  MatchImportStatus,
  MatchImportView,
  MatchListItem,
  MatchManagementAdapter,
  OcrReviewState,
  UploadTarget,
} from "./contracts";

type StoredMockMatch = {
  matchId: string;
  localMatchKey: string;
  status: MatchImportStatus;
  detectedAt?: string;
  files: CreateMatchDraftInput["files"];
  uploads: UploadTarget[];
  editable?: Partial<EditableMatchFields>;
  ocr?: Partial<OcrReviewState>;
};

const STORAGE_PREFIX = "ow-insight-mock-backend:";

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function extensionFromName(name: string) {
  const index = name.lastIndexOf(".");
  const ext = index >= 0 ? name.slice(index + 1).toLowerCase() : "jpg";
  return ext.replace(/[^a-z0-9]/g, "") || "jpg";
}

function loadAll(): StoredMockMatch[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}matches`);
    return raw ? (JSON.parse(raw) as StoredMockMatch[]) : [];
  } catch {
    return [];
  }
}

function saveAll(matches: StoredMockMatch[]) {
  localStorage.setItem(`${STORAGE_PREFIX}matches`, JSON.stringify(matches));
}

function updateStored(matchId: string, patch: Partial<StoredMockMatch>) {
  const matches = loadAll();
  const index = matches.findIndex((item) => item.matchId === matchId);
  if (index < 0) throw new Error("MOCK_MATCH_NOT_FOUND");
  matches[index] = { ...matches[index], ...patch };
  saveAll(matches);
  return matches[index];
}

function fallbackDetectedAt(match: StoredMockMatch) {
  if (match.detectedAt) return match.detectedAt;
  const timestamps = match.files
    .map((file) => Number(file.last_modified_ms))
    .filter((value) => Number.isFinite(value) && value > 0);
  const ms = timestamps.length > 0 ? Math.min(...timestamps) : Date.now();
  return new Date(ms).toISOString();
}

function defaultEditable(match: StoredMockMatch): EditableMatchFields {
  return {
    played_at: match.editable?.played_at ?? fallbackDetectedAt(match),
    map_name: match.editable?.map_name ?? "",
    game_mode: match.editable?.game_mode ?? "",
    result: match.editable?.result ?? "unknown",
    my_hero: match.editable?.my_hero ?? "",
    season: match.editable?.season ?? "",
    patch_label: match.editable?.patch_label ?? "",
    side: match.editable?.side ?? "unknown",
    control_submap: match.editable?.control_submap ?? "",
    round_sequence: match.editable?.round_sequence ?? "",
    match_duration: match.editable?.match_duration ?? "",
    notes: match.editable?.notes ?? "",
  };
}

function defaultOcr(match: StoredMockMatch): OcrReviewState {
  return {
    generated_at: match.ocr?.generated_at ?? null,
    overall_confidence: match.ocr?.overall_confidence ?? null,
    message: match.ocr?.message ?? "",
  };
}

function toView(match: StoredMockMatch): MatchImportView {
  return {
    match_id: match.matchId,
    local_match_key: match.localMatchKey,
    status: match.status,
    detected_at: fallbackDetectedAt(match),
    files: match.files,
    editable: defaultEditable(match),
    ocr: defaultOcr(match),
  };
}

export class MockMatchBackendAdapter implements MatchManagementAdapter {
  async createMatchDraft(input: CreateMatchDraftInput): Promise<CreateMatchDraftResult> {
    await sleep(250);

    const matches = loadAll();
    const existing = matches.find((item) => item.localMatchKey === input.local_match_key);
    if (existing) {
      if (!existing.detectedAt) {
        existing.detectedAt = input.detected_at;
        saveAll(matches);
      }
      return {
        contract_version: "0.1",
        match_id: existing.matchId,
        created: false,
        status: "awaiting_upload",
        uploads: existing.uploads,
      };
    }

    const matchId = crypto.randomUUID();
    const uploads: UploadTarget[] = input.files.map((file) => ({
      client_file_id: file.client_file_id,
      upload_id: crypto.randomUUID(),
      storage_bucket: "match-uploads",
      storage_path: `mock-user/${matchId}/${file.screen_type}/${file.sha256.slice(0, 16)}.${extensionFromName(file.original_name)}`,
    }));

    matches.push({
      matchId,
      localMatchKey: input.local_match_key,
      status: "awaiting_upload",
      detectedAt: input.detected_at,
      files: input.files,
      uploads,
      editable: {
        played_at: input.detected_at,
        map_name: "",
        game_mode: "",
        result: "unknown",
        my_hero: "",
        season: "",
        patch_label: "",
        side: "unknown",
        control_submap: "",
        round_sequence: "",
        match_duration: "",
        notes: "",
      },
      ocr: {
        generated_at: null,
        overall_confidence: null,
        message: "",
      },
    });
    saveAll(matches);

    return {
      contract_version: "0.1",
      match_id: matchId,
      created: true,
      status: "awaiting_upload",
      uploads,
    };
  }

  async uploadMatchFile(_target: UploadTarget, file: File): Promise<void> {
    const simulatedMs = Math.min(900, Math.max(180, Math.round(file.size / 1200)));
    await sleep(simulatedMs);
  }

  async completeMatchUpload(
    input: CompleteMatchUploadInput,
  ): Promise<{ matchId: string; status: "pending_ocr" }> {
    await sleep(300);
    updateStored(input.match_id, { status: "pending_ocr" });
    return { matchId: input.match_id, status: "pending_ocr" };
  }

  async getMatchImport(matchId: string): Promise<MatchImportView> {
    await sleep(120);
    const match = loadAll().find((item) => item.matchId === matchId);
    if (!match) throw new Error("MOCK_MATCH_NOT_FOUND");
    return toView(match);
  }

  async listMatchImports(): Promise<MatchListItem[]> {
    await sleep(120);
    return loadAll()
      .map(toView)
      .sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime());
  }

  async updateMatchImport(matchId: string, patch: Partial<EditableMatchFields>): Promise<MatchImportView> {
    await sleep(160);
    const current = loadAll().find((item) => item.matchId === matchId);
    if (!current) throw new Error("MOCK_MATCH_NOT_FOUND");
    const next = updateStored(matchId, {
      editable: {
        ...defaultEditable(current),
        ...patch,
      },
    });
    return toView(next);
  }

  async deleteMatchImport(matchId: string): Promise<void> {
    await sleep(180);
    const matches = loadAll();
    const next = matches.filter((item) => item.matchId !== matchId);
    if (next.length === matches.length) throw new Error("MOCK_MATCH_NOT_FOUND");
    saveAll(next);
  }

  async runMockOcr(matchId: string): Promise<MatchImportView> {
    const current = loadAll().find((item) => item.matchId === matchId);
    if (!current) throw new Error("MOCK_MATCH_NOT_FOUND");

    updateStored(matchId, {
      status: "processing_ocr",
      ocr: {
        ...defaultOcr(current),
        message: "Mock OCR 처리 중",
      },
    });

    await sleep(900);

    const refreshed = loadAll().find((item) => item.matchId === matchId);
    if (!refreshed) throw new Error("MOCK_MATCH_NOT_FOUND");
    const next = updateStored(matchId, {
      status: "needs_review",
      ocr: {
        generated_at: new Date().toISOString(),
        overall_confidence: null,
        message: "Mock OCR 완료. 실제 이미지를 읽은 값은 아니며 검수 UI 테스트용 빈 결과입니다.",
      },
    });
    return toView(next);
  }

  async resetMatchReview(matchId: string): Promise<MatchImportView> {
    await sleep(140);
    const current = loadAll().find((item) => item.matchId === matchId);
    if (!current) throw new Error("MOCK_MATCH_NOT_FOUND");
    const next = updateStored(matchId, { status: "needs_review" });
    return toView(next);
  }

  async confirmMatch(
    input: ConfirmMatchInput,
  ): Promise<{ matchId: string; status: "confirmed" }> {
    await sleep(250);
    updateStored(input.match_id, { status: "confirmed" });
    return { matchId: input.match_id, status: "confirmed" };
  }
}

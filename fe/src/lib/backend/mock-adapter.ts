import type {
  CompleteMatchUploadInput,
  ConfirmMatchInput,
  CreateMatchDraftInput,
  CreateMatchDraftResult,
  MatchBackendAdapter,
  MatchImportStatus,
  MatchImportView,
  MatchListItem,
  UploadTarget,
} from "./contracts";

type StoredMockMatch = {
  matchId: string;
  localMatchKey: string;
  status: MatchImportStatus;
  detectedAt?: string;
  files: CreateMatchDraftInput["files"];
  uploads: UploadTarget[];
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

function toView(match: StoredMockMatch): MatchImportView {
  return {
    match_id: match.matchId,
    local_match_key: match.localMatchKey,
    status: match.status,
    detected_at: fallbackDetectedAt(match),
    files: match.files,
  };
}

export class MockMatchBackendAdapter implements MatchBackendAdapter {
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

  async confirmMatch(
    input: ConfirmMatchInput,
  ): Promise<{ matchId: string; status: "confirmed" }> {
    await sleep(250);
    updateStored(input.match_id, { status: "confirmed" });
    return { matchId: input.match_id, status: "confirmed" };
  }
}

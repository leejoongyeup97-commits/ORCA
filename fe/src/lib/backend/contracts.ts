export type BackendScreenType = "summary" | "team" | "personal" | "replay" | "unknown";

export type MatchImportStatus =
  | "awaiting_upload"
  | "pending_ocr"
  | "processing_ocr"
  | "needs_review"
  | "confirmed"
  | "failed";

export type CreateMatchDraftFile = {
  client_file_id: string;
  screen_type: BackendScreenType;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  last_modified_ms: number;
  sha256: string;
  classification_score: number | null;
};

export type CreateMatchDraftInput = {
  contract_version: "0.1";
  local_match_key: string;
  source: "local_folder_import";
  detected_at: string;
  files: CreateMatchDraftFile[];
};

export type UploadTarget = {
  client_file_id: string;
  upload_id: string;
  storage_bucket: "match-uploads";
  storage_path: string;
};

export type CreateMatchDraftResult = {
  contract_version: "0.1";
  match_id: string;
  created: boolean;
  status: "awaiting_upload";
  uploads: UploadTarget[];
};

export type CompleteMatchUploadInput = {
  contract_version: "0.1";
  match_id: string;
  uploaded_files: Array<{
    upload_id: string;
    sha256: string;
  }>;
};

export type MatchImportView = {
  match_id: string;
  local_match_key: string;
  status: MatchImportStatus;
  detected_at: string;
  files: CreateMatchDraftFile[];
};

export type MatchListItem = MatchImportView;

export type ConfirmMatchInput = {
  contract_version: "0.1";
  match_id: string;
  match: Record<string, unknown>;
  players: unknown[];
  my_hero_details: unknown[];
  manual_fields: Record<string, unknown>;
};

export interface MatchBackendAdapter {
  createMatchDraft(input: CreateMatchDraftInput): Promise<CreateMatchDraftResult>;
  uploadMatchFile(target: UploadTarget, file: File): Promise<void>;
  completeMatchUpload(
    input: CompleteMatchUploadInput,
  ): Promise<{ matchId: string; status: "pending_ocr" }>;
  getMatchImport(matchId: string): Promise<MatchImportView>;
  listMatchImports(): Promise<MatchListItem[]>;
  confirmMatch(
    input: ConfirmMatchInput,
  ): Promise<{ matchId: string; status: "confirmed" }>;
}

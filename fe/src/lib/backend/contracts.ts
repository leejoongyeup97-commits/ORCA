export type BackendScreenType = "summary" | "team" | "personal" | "replay" | "unknown";

export type MatchImportStatus =
  | "awaiting_upload"
  | "pending_ocr"
  | "processing_ocr"
  | "needs_review"
  | "confirmed"
  | "failed";

export type MatchResult = "win" | "loss" | "draw" | "unknown";

export type MatchSide = "attack" | "defense" | "neutral" | "unknown";

export type RoundDetail = {
  order: number;
  submap: string;
  result: MatchResult;
};

export type MapSubmapOption = {
  submap_key: string;
  submap_name: string;
  sort_order: number;
};

export type EditableMatchFields = {
  played_at: string;
  map_name: string;
  game_mode: string;
  result: MatchResult;
  my_hero: string;
  season: string;
  patch_label: string;
  side: MatchSide;
  control_submap: string;
  round_sequence: string;
  match_duration: string;
  notes: string;
};

export type OcrReviewState = {
  generated_at: string | null;
  overall_confidence: number | null;
  message: string;
};

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
  editable: EditableMatchFields;
  ocr: OcrReviewState;
};

export type MatchListItem = MatchImportView;

export type ConfirmPlayerInput = {
  team: "ally" | "enemy";
  slot: number;
  is_me: boolean;
  player_name?: string;
  hero: string;
  hero_key: string;
  eliminations: string;
  assists: string;
  deaths: string;
  damage: string;
  healing: string;
  mitigation: string;
};

export type ConfirmHeroDetailInput = {
  hero: string;
  hero_key: string;
  play_time: string;
  accuracy?: string;
  critical?: string;
  hero_specific: Record<string, string>;
};

export type ConfirmMatchInput = {
  contract_version: "0.1";
  match_id: string;
  match: Record<string, unknown>;
  players: ConfirmPlayerInput[];
  my_hero_details: ConfirmHeroDetailInput[];
  manual_fields: Record<string, unknown>;
};

export interface MatchBackendAdapter {
  createMatchDraft(input: CreateMatchDraftInput): Promise<CreateMatchDraftResult>;
  uploadMatchFile(target: UploadTarget, file: File): Promise<void>;
  completeMatchUpload(
    input: CompleteMatchUploadInput,
  ): Promise<{ matchId: string; status: "pending_ocr" }>;
  getMatchImport(matchId: string): Promise<MatchImportView>;
  confirmMatch(
    input: ConfirmMatchInput,
  ): Promise<{ matchId: string; status: "confirmed" }>;
}

export interface MatchManagementAdapter extends MatchBackendAdapter {
  listMatchImports(): Promise<MatchListItem[]>;
  updateMatchImport(matchId: string, patch: Partial<EditableMatchFields>): Promise<MatchImportView>;
  deleteMatchImport(matchId: string): Promise<void>;
  runMockOcr(matchId: string): Promise<MatchImportView>;
  setOcrState(
    matchId: string,
    status: Extract<MatchImportStatus, "processing_ocr" | "needs_review" | "failed">,
    ocr: Partial<OcrReviewState>,
  ): Promise<MatchImportView>;
  resetMatchReview(matchId: string): Promise<MatchImportView>;
  listMapSubmaps(mapName: string, gameMode: "control" | "flashpoint"): Promise<MapSubmapOption[]>;
  getRoundDetails(matchId: string): Promise<RoundDetail[]>;
}

import { getValidSession, getSupabaseConfig } from "../auth";
import { createDefaultReviewDraft, saveReviewDraft } from "../review-draft";
import type {
  CompleteMatchUploadInput,
  ConfirmMatchInput,
  CreateMatchDraftInput,
  CreateMatchDraftResult,
  EditableMatchFields,
  MatchImportView,
  MatchListItem,
  MatchManagementAdapter,
  UploadTarget,
} from "./contracts";

type MatchRow = {
  id: string;
  local_match_key: string | null;
  import_status: MatchImportView["status"];
  detected_at: string | null;
  played_at: string | null;
  editable: Partial<EditableMatchFields> | null;
  ocr_review: MatchImportView["ocr"] | null;
};

type UploadRow = {
  id: string;
  match_id: string;
  client_file_id: string | null;
  file_path: string;
  upload_type: string;
  screen_type: string | null;
  original_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  last_modified_ms: number | null;
  sha256: string | null;
  classification_score: number | null;
};

async function configAndSession() {
  const config = getSupabaseConfig();
  const session = await getValidSession();
  if (!config.configured) throw new Error("SUPABASE_NOT_CONFIGURED");
  if (!session?.access_token || !session.user?.id) throw new Error("SUPABASE_NOT_AUTHENTICATED");
  return { config, session };
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const { config, session } = await configAndSession();
  const headers = new Headers(init.headers);
  headers.set("apikey", config.publishableKey);
  headers.set("Authorization", `Bearer ${session.access_token}`);
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");

  const response = await fetch(`${config.url}${path}`, { ...init, headers });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`SUPABASE_${response.status}: ${message || response.statusText}`);
  }
  return response;
}

function ext(name: string) {
  const dot = name.lastIndexOf(".");
  const value = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "jpg";
  return value.replace(/[^a-z0-9]/g, "") || "jpg";
}

function formatDuration(seconds: unknown) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parsePlayedAt(raw: unknown) {
  if (typeof raw !== "string") return null;
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(year, Number(m[1]) - 1, Number(m[2]), Number(m[4]), Number(m[5]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function uploadType(screenType: string) {
  if (screenType === "team") return "team_stats";
  if (screenType === "personal") return "hero_detail";
  if (screenType === "replay") return "replay";
  return "summary";
}

function defaultEditable(row: MatchRow): EditableMatchFields {
  const e = row.editable ?? {};
  return {
    played_at: e.played_at ?? row.played_at ?? row.detected_at ?? new Date().toISOString(),
    map_name: e.map_name ?? "",
    game_mode: e.game_mode ?? "",
    result: e.result ?? "unknown",
    my_hero: e.my_hero ?? "",
    season: e.season ?? "",
    patch_label: e.patch_label ?? "",
    side: e.side ?? "unknown",
    control_submap: e.control_submap ?? "",
    round_sequence: e.round_sequence ?? "",
    match_duration: e.match_duration ?? "",
    notes: e.notes ?? "",
  };
}

async function uploadsFor(matchId: string): Promise<UploadRow[]> {
  const r = await supabaseFetch(
    `/rest/v1/uploads?match_id=eq.${encodeURIComponent(matchId)}&select=id,match_id,client_file_id,file_path,upload_type,screen_type,original_name,mime_type,size_bytes,last_modified_ms,sha256,classification_score&order=created_at.asc`,
  );
  return (await r.json()) as UploadRow[];
}

function fileFromUpload(u: UploadRow) {
  return {
    client_file_id: u.client_file_id ?? u.id,
    screen_type: (u.screen_type ?? "unknown") as MatchImportView["files"][number]["screen_type"],
    original_name: u.original_name ?? "",
    mime_type: u.mime_type ?? "application/octet-stream",
    size_bytes: Number(u.size_bytes ?? 0),
    last_modified_ms: Number(u.last_modified_ms ?? 0),
    sha256: u.sha256 ?? "",
    classification_score: u.classification_score == null ? null : Number(u.classification_score),
  };
}

async function rowToView(row: MatchRow): Promise<MatchImportView> {
  const uploads = await uploadsFor(row.id);
  return {
    match_id: row.id,
    local_match_key: row.local_match_key ?? "",
    status: row.import_status,
    detected_at: row.detected_at ?? row.played_at ?? new Date().toISOString(),
    files: uploads.map(fileFromUpload),
    editable: defaultEditable(row),
    ocr: row.ocr_review ?? { generated_at: null, overall_confidence: null, message: "" },
  };
}

export class SupabaseMatchBackendAdapter implements MatchManagementAdapter {
  async createMatchDraft(input: CreateMatchDraftInput): Promise<CreateMatchDraftResult> {
    const { session } = await configAndSession();

    const existingResponse = await supabaseFetch(
      `/rest/v1/matches?user_id=eq.${session.user.id}&local_match_key=eq.${encodeURIComponent(input.local_match_key)}&select=id&limit=1`,
    );
    const existing = (await existingResponse.json()) as Array<{ id: string }>;
    if (existing[0]) {
      const rows = await uploadsFor(existing[0].id);
      return {
        contract_version: "0.1",
        match_id: existing[0].id,
        created: false,
        status: "awaiting_upload",
        uploads: rows.map((u) => ({
          client_file_id: u.client_file_id ?? u.id,
          upload_id: u.id,
          storage_bucket: "match-uploads",
          storage_path: u.file_path,
        })),
      };
    }

    const editable: EditableMatchFields = {
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
    };

    const matchResponse = await supabaseFetch("/rest/v1/matches?select=id", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: session.user.id,
        played_at: input.detected_at,
        detected_at: input.detected_at,
        local_match_key: input.local_match_key,
        import_status: "awaiting_upload",
        editable,
        ocr_review: { generated_at: null, overall_confidence: null, message: "" },
      }),
    });
    const [match] = (await matchResponse.json()) as Array<{ id: string }>;

    const uploadRows = input.files.map((file) => {
      const id = crypto.randomUUID();
      return {
        id,
        user_id: session.user.id,
        match_id: match.id,
        client_file_id: file.client_file_id,
        file_path: `${session.user.id}/${match.id}/${file.screen_type}/${file.sha256.slice(0, 16)}.${ext(file.original_name)}`,
        upload_type: uploadType(file.screen_type),
        status: "uploaded",
        screen_type: file.screen_type,
        original_name: file.original_name,
        mime_type: file.mime_type,
        size_bytes: file.size_bytes,
        last_modified_ms: file.last_modified_ms,
        sha256: file.sha256,
        classification_score: file.classification_score,
      };
    });

    if (uploadRows.length) {
      await supabaseFetch("/rest/v1/uploads", {
        method: "POST",
        body: JSON.stringify(uploadRows),
      });
    }

    return {
      contract_version: "0.1",
      match_id: match.id,
      created: true,
      status: "awaiting_upload",
      uploads: uploadRows.map((u) => ({
        client_file_id: u.client_file_id,
        upload_id: u.id,
        storage_bucket: "match-uploads",
        storage_path: u.file_path,
      })),
    };
  }

  async uploadMatchFile(target: UploadTarget, file: File): Promise<void> {
    const { config, session } = await configAndSession();
    const response = await fetch(
      `${config.url}/storage/v1/object/${target.storage_bucket}/${target.storage_path.split("/").map(encodeURIComponent).join("/")}`,
      {
        method: "POST",
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "true",
        },
        body: file,
      },
    );
    if (!response.ok) throw new Error(`STORAGE_UPLOAD_FAILED: ${await response.text()}`);
  }

  async completeMatchUpload(input: CompleteMatchUploadInput) {
    await supabaseFetch(`/rest/v1/matches?id=eq.${input.match_id}`, {
      method: "PATCH",
      body: JSON.stringify({ import_status: "pending_ocr" }),
    });
    return { matchId: input.match_id, status: "pending_ocr" as const };
  }

  async getMatchImport(matchId: string): Promise<MatchImportView> {
    const r = await supabaseFetch(
      `/rest/v1/matches?id=eq.${matchId}&select=id,local_match_key,import_status,detected_at,played_at,editable,ocr_review&limit=1`,
    );
    const [row] = (await r.json()) as MatchRow[];
    if (!row) throw new Error("MATCH_NOT_FOUND");
    return rowToView(row);
  }

  async listMatchImports(): Promise<MatchListItem[]> {
    const r = await supabaseFetch(
      "/rest/v1/matches?select=id,local_match_key,import_status,detected_at,played_at,editable,ocr_review&order=detected_at.desc",
    );
    const rows = (await r.json()) as MatchRow[];
    return Promise.all(rows.map(rowToView));
  }

  async updateMatchImport(matchId: string, patch: Partial<EditableMatchFields>) {
    const current = await this.getMatchImport(matchId);
    const editable = { ...current.editable, ...patch };
    await supabaseFetch(`/rest/v1/matches?id=eq.${matchId}`, {
      method: "PATCH",
      body: JSON.stringify({ editable, played_at: editable.played_at }),
    });
    return this.getMatchImport(matchId);
  }

  async deleteMatchImport(matchId: string): Promise<void> {
    const rows = await uploadsFor(matchId);
    for (const row of rows) {
      const { config, session } = await configAndSession();
      await fetch(
        `${config.url}/storage/v1/object/match-uploads/${row.file_path.split("/").map(encodeURIComponent).join("/")}`,
        {
          method: "DELETE",
          headers: { apikey: config.publishableKey, Authorization: `Bearer ${session.access_token}` },
        },
      ).catch(() => undefined);
    }
    await supabaseFetch(`/rest/v1/matches?id=eq.${matchId}`, { method: "DELETE" });
  }

  async runMockOcr(matchId: string) {
    await supabaseFetch(`/rest/v1/matches?id=eq.${matchId}`, {
      method: "PATCH",
      body: JSON.stringify({ import_status: "processing_ocr" }),
    });

    try {
      const rows = await uploadsFor(matchId);
      const results: Array<{ upload_id: string; screen_type: string; result: unknown }> = [];

      for (const row of rows) {
        const screenType = row.screen_type ?? "unknown";
        if (!["summary", "team", "personal", "replay"].includes(screenType)) continue;

        const { config, session } = await configAndSession();
        const objectResponse = await fetch(
          `${config.url}/storage/v1/object/authenticated/match-uploads/${row.file_path
            .split("/")
            .map(encodeURIComponent)
            .join("/")}`,
          {
            headers: {
              apikey: config.publishableKey,
              Authorization: `Bearer ${session.access_token}`,
            },
          },
        );
        if (!objectResponse.ok) {
          throw new Error(`STORAGE_DOWNLOAD_FAILED: ${await objectResponse.text()}`);
        }

        const blob = await objectResponse.blob();
        const form = new FormData();
        form.append("screen_type", screenType);
        form.append("file", blob, row.original_name || `${screenType}.jpg`);

        const ocrResponse = await fetch("http://127.0.0.1:8001/extract", {
          method: "POST",
          body: form,
        });
        if (!ocrResponse.ok) {
          throw new Error(`OCR_FAILED: ${await ocrResponse.text()}`);
        }

        const result = (await ocrResponse.json()) as unknown;
        results.push({ upload_id: row.id, screen_type: screenType, result });

        await supabaseFetch(`/rest/v1/uploads?id=eq.${row.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            status: "review_required",
            ocr_raw: result,
            ocr_processed_at: new Date().toISOString(),
            ocr_version: "local-api",
          }),
        });
      }

      const current = await this.getMatchImport(matchId);
      const editable = { ...current.editable };
      const summary = results.find((item) => item.screen_type === "summary");
      if (summary) {
        const raw = asRecord(summary.result);
        if (raw.mode) editable.game_mode = String(raw.mode);
        if (raw.result === "win" || raw.result === "loss" || raw.result === "draw") {
          editable.result = raw.result;
        }
        const duration = formatDuration(raw.duration_seconds);
        if (duration) editable.match_duration = duration;
        const playedAt = parsePlayedAt(raw.played_at_raw);
        if (playedAt) editable.played_at = playedAt;
      }

      const draft = createDefaultReviewDraft(editable.my_hero);
      const team = results.find((item) => item.screen_type === "team");
      if (team) {
        // Team OCR identifies the user's highlighted friendly row.
        // Clear the legacy "ally slot 1 = me" default before applying OCR.
        for (const p of draft.players) {
          if (p.team === "ally") {
            p.is_me = false;
            if (p.player_name === "나") p.player_name = "";
            if (p.hero === editable.my_hero) p.hero = "";
          }
        }

        const raw = asRecord(team.result);
        const players = Array.isArray(raw.players) ? raw.players : [];
        for (const value of players) {
          const player = asRecord(value);
          const teamName = player.team === "blue" ? "ally" : player.team === "red" ? "enemy" : null;
          const slot = Number(player.slot);
          if (!teamName || !Number.isInteger(slot)) continue;
          const target = draft.players.find((p) => p.team === teamName && p.slot === slot);
          if (!target) continue;

          if (teamName === "ally" && player.is_me === true) {
            target.is_me = true;
            target.player_name = "나";
            target.hero = editable.my_hero;
          }

          target.eliminations = player.elims == null ? "" : String(player.elims);
          target.assists = player.assists == null ? "" : String(player.assists);
          target.deaths = player.deaths == null ? "" : String(player.deaths);
          target.damage = player.damage == null ? "" : String(player.damage);
          target.healing = player.healing == null ? "" : String(player.healing);
          target.mitigation = player.mitigation == null ? "" : String(player.mitigation);
        }
      }

      const personal = results.find((item) => item.screen_type === "personal");
      if (personal) {
        const raw = asRecord(personal.result);
        const known = asRecord(raw.known_metrics);
        const hero = draft.hero_details[0];
        if (hero) {
          hero.play_time = raw.play_time == null ? "" : String(raw.play_time);
          hero.accuracy = known.weapon_accuracy == null ? "" : String(known.weapon_accuracy);
        }
      }
      saveReviewDraft(matchId, draft);

      await supabaseFetch(`/rest/v1/matches?id=eq.${matchId}`, {
        method: "PATCH",
        body: JSON.stringify({
          editable,
          played_at: editable.played_at,
          import_status: "needs_review",
          ocr_review: {
            generated_at: new Date().toISOString(),
            overall_confidence: null,
            message: `OCR 완료: ${results.length}개 이미지 분석`,
          },
        }),
      });
    } catch (error) {
      await supabaseFetch(`/rest/v1/matches?id=eq.${matchId}`, {
        method: "PATCH",
        body: JSON.stringify({
          import_status: "failed",
          ocr_review: {
            generated_at: new Date().toISOString(),
            overall_confidence: null,
            message: error instanceof Error ? error.message : "OCR 처리 실패",
          },
        }),
      });
      throw error;
    }

    return this.getMatchImport(matchId);
  }

  async setOcrState(
    matchId: string,
    status: "processing_ocr" | "needs_review" | "failed",
    ocr: { generated_at?: string | null; overall_confidence?: number | null; message?: string },
  ) {
    const current = await this.getMatchImport(matchId);
    await supabaseFetch(`/rest/v1/matches?id=eq.${matchId}`, {
      method: "PATCH",
      body: JSON.stringify({
        import_status: status,
        ocr_review: { ...current.ocr, ...ocr },
      }),
    });
    return this.getMatchImport(matchId);
  }

  async resetMatchReview(matchId: string) {
    await supabaseFetch(`/rest/v1/matches?id=eq.${matchId}`, {
      method: "PATCH",
      body: JSON.stringify({ import_status: "needs_review" }),
    });
    return this.getMatchImport(matchId);
  }

  async confirmMatch(input: ConfirmMatchInput) {
    await supabaseFetch(`/rest/v1/matches?id=eq.${input.match_id}`, {
      method: "PATCH",
      body: JSON.stringify({ import_status: "confirmed" }),
    });
    return { matchId: input.match_id, status: "confirmed" as const };
  }
}

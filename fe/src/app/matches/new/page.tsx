"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import MatchReviewEditor from "@/components/match-review-editor";
import {
  BACKEND_MODE,
  getMatchBackendAdapter,
  type EditableMatchFields,
  type MatchResult,
} from "@/lib/backend";
import {
  runRealOcrForMatch,
  type OcrProgressEvent,
} from "@/lib/ocr-integration";
import {
  loadReviewDraft,
  toConfirmHeroDetails,
  toConfirmPlayers,
} from "@/lib/review-draft";
import {
  ensureScreenshotFolderPermission,
  getSavedScreenshotFolder,
  getScreenshotAutoScanEnabled,
  pickAndSaveScreenshotFolder,
  queryScreenshotFolderPermission,
  supportsDirectoryPicker,
} from "@/lib/screenshot-folder";

type ScreenType = "summary" | "team" | "personal" | "replay" | "unknown";
type ReviewStatus = "unreviewed" | "ready_to_upload" | "uploading" | "pending_ocr" | "confirmed";

type UploadUiState = {
  phase: "idle" | "creating" | "uploading" | "completing" | "done" | "error";
  current: number;
  total: number;
  message: string;
  matchId?: string;
};

type OcrActivityLog = {
  id: string;
  time: string;
  level: "info" | "success" | "error";
  message: string;
};

type OcrActivityState = {
  running: boolean;
  current: number;
  total: number;
  percent: number;
  message: string;
  logs: OcrActivityLog[];
};

type ErrorDialogState = {
  title: string;
  summary: string;
  raw: string;
};

type Classification = {
  id: string;
  file: File;
  type: ScreenType;
  score: number;
  hash: string;
  excluded: boolean;
};

type DetectedMatch = {
  id: string;
  localMatchKey: string;
  startedAt: number;
  files: Classification[];
  reviewStatus: ReviewStatus;
  backendMatchId?: string;
  ocrEditable?: EditableMatchFields;
  ocrMessage?: string;
  ocrGeneratedAt?: string | null;
};

type FolderState = {
  lastFileName: string;
  lastModified: number;
  processedHashes: string[];
};

type ScanSummary = {
  totalInFolder: number;
  newFiles: number;
  skippedDuplicates: number;
  unclassifiedBeforeSummary: number;
  detectedMatches: number;
};

type ReadyManifest = {
  local_match_key: string;
  status: "ready_to_upload";
  started_at: string;
  images: Array<{
    client_file_id: string;
    type: ScreenType;
    filename: string;
    size: number;
    last_modified: number;
    sha256: string;
    order: number;
  }>;
};

const TAB_THRESHOLD = 0.18;
const REPLAY_THRESHOLD = 0.075;
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".bmp"];

function errorText(error: unknown) {
  if (error instanceof Error) {
    return error.stack || error.message || String(error);
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

const TYPE_META: Record<ScreenType, { label: string; short: string; description: string }> = {
  summary: { label: "요약", short: "S", description: "경기 시작점" },
  team: { label: "팀", short: "T", description: "10인 스코어보드" },
  personal: { label: "개인", short: "P", description: "영웅 상세 통계" },
  replay: { label: "리플레이", short: "R", description: "리플레이 타임라인" },
  unknown: { label: "미분류", short: "?", description: "직접 확인 필요" },
};

function stateKey(folderName: string) {
  return `ow-insight-folder-state:${folderName}`;
}

function readyManifestKey(localMatchKey: string) {
  return `ow-insight-ready-match:${localMatchKey}`;
}

function loadFolderState(folderName: string): FolderState | null {
  try {
    const raw = localStorage.getItem(stateKey(folderName));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FolderState>;
    return {
      lastFileName: parsed.lastFileName ?? "",
      lastModified: Number(parsed.lastModified ?? 0),
      processedHashes: Array.isArray(parsed.processedHashes) ? parsed.processedHashes.slice(-500) : [],
    };
  } catch {
    return null;
  }
}

function saveFolderState(folderName: string, value: FolderState) {
  localStorage.setItem(
    stateKey(folderName),
    JSON.stringify({ ...value, processedHashes: value.processedHashes.slice(-500) }),
  );
}

function isImageFile(file: File) {
  const lower = file.name.toLowerCase();
  return file.type.startsWith("image/") || IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isAfterCursor(file: File, cursor: FolderState) {
  if (file.lastModified > cursor.lastModified) return true;
  if (file.lastModified < cursor.lastModified) return false;
  return file.name.localeCompare(cursor.lastFileName) > 0;
}

function formatDate(ms: number) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function matchIdFrom(ms: number, index: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `match_${String(index + 1).padStart(3, "0")}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function sha256(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

async function loadReference(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`기준 이미지 로드 실패: ${path}`);
  return createImageBitmap(await response.blob());
}

function regionScore(
  reference: ImageBitmap,
  candidate: ImageBitmap,
  x: number,
  y: number,
  w: number,
  h: number,
  outW: number,
  outH: number,
) {
  const makePixels = (image: ImageBitmap) => {
    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("이미지 비교용 Canvas를 만들 수 없습니다.");
    const sx = Math.floor(image.width * x);
    const sy = Math.floor(image.height * y);
    const sw = Math.max(4, Math.floor(image.width * w));
    const sh = Math.max(4, Math.floor(image.height * h));
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, outW, outH);
    return ctx.getImageData(0, 0, outW, outH).data;
  };

  const a = makePixels(reference);
  const b = makePixels(candidate);
  let sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    sum += Math.abs(a[i] - b[i]);
    sum += Math.abs(a[i + 1] - b[i + 1]);
    sum += Math.abs(a[i + 2] - b[i + 2]);
  }
  return sum / (outW * outH * 3 * 255);
}

async function classifyFile(
  file: File,
  hash: string,
  refs: { summary: ImageBitmap; team: ImageBitmap; personal: ImageBitmap; replay: ImageBitmap },
): Promise<Classification> {
  const candidate = await createImageBitmap(file);
  try {
    const scores = [
      { type: "summary" as const, score: regionScore(refs.summary, candidate, 0, 0, 0.18, 0.1, 64, 32) },
      { type: "team" as const, score: regionScore(refs.team, candidate, 0, 0, 0.18, 0.1, 64, 32) },
      { type: "personal" as const, score: regionScore(refs.personal, candidate, 0, 0, 0.18, 0.1, 64, 32) },
    ].sort((a, b) => a.score - b.score);

    if (scores[0].score <= TAB_THRESHOLD) {
      return {
        id: `${hash.slice(0, 12)}-${file.lastModified}`,
        file,
        type: scores[0].type,
        score: scores[0].score,
        hash,
        excluded: false,
      };
    }

    const replayScore = regionScore(refs.replay, candidate, 0.57, 0.8, 0.43, 0.2, 96, 32);
    if (replayScore <= REPLAY_THRESHOLD) {
      return {
        id: `${hash.slice(0, 12)}-${file.lastModified}`,
        file,
        type: "replay",
        score: replayScore,
        hash,
        excluded: false,
      };
    }

    return {
      id: `${hash.slice(0, 12)}-${file.lastModified}`,
      file,
      type: "unknown",
      score: scores[0].score,
      hash,
      excluded: false,
    };
  } finally {
    candidate.close();
  }
}

export default function NewMatchPage() {
  const [folderName, setFolderName] = useState("");
  const [lastProcessed, setLastProcessed] = useState("");
  const [matches, setMatches] = useState<DetectedMatch[]>([]);
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(null);
  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [message, setMessage] = useState("아직 스크린샷 폴더를 읽지 않았습니다.");
  const [reviewingMatchId, setReviewingMatchId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [reviewNotice, setReviewNotice] = useState("");
  const [uploadState, setUploadState] = useState<UploadUiState>({
    phase: "idle",
    current: 0,
    total: 0,
    message: "",
  });
  const [bulkReviewState, setBulkReviewState] = useState({ running: false, current: 0, total: 0 });
  const [ocrActivity, setOcrActivity] = useState<OcrActivityState>({
    running: false,
    current: 0,
    total: 0,
    percent: 0,
    message: "",
    logs: [],
  });
  const [errorDialog, setErrorDialog] = useState<ErrorDialogState | null>(null);
  const autoScanStartedRef = useRef(false);

  function openErrorDialog(title: string, summary: string, raw: unknown) {
    setErrorDialog({
      title,
      summary,
      raw: errorText(raw),
    });
  }

  function handleOcrProgress(event: OcrProgressEvent) {
    const log: OcrActivityLog = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      time: new Date().toLocaleTimeString("ko-KR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }),
      level: event.level,
      message: event.message,
    };

    setOcrActivity((current) => ({
      running: event.stage !== "completed",
      current: event.current,
      total: event.total,
      percent: event.percent,
      message: event.message,
      logs: [...current.logs, log].slice(-40),
    }));

    if (event.level === "error" && event.error) {
      setErrorDialog((current) =>
        current ?? {
          title: "OCR 처리 오류",
          summary: event.filename
            ? `${event.filename} 처리 중 오류가 발생했습니다.`
            : "OCR 처리 중 오류가 발생했습니다.",
          raw: event.error,
        },
      );
    }
  }

  function resetOcrActivity(message = "OCR 작업을 준비하고 있습니다.") {
    setOcrActivity({
      running: true,
      current: 0,
      total: 0,
      percent: 0,
      message,
      logs: [],
    });
  }

  useEffect(() => {
    let mounted = true;

    getSavedScreenshotFolder()
      .then(async (handle) => {
        if (!mounted || !handle) {
          if (mounted) setMessage("설정에서 스크린샷 폴더를 지정하면 이후에는 폴더를 다시 고를 필요가 없습니다.");
          return;
        }

        setFolderName(handle.name);
        const previous = loadFolderState(handle.name);
        setLastProcessed(previous?.lastFileName ?? "");

        const permission = await queryScreenshotFolderPermission(handle);
        if (!mounted) return;

        if (
          getScreenshotAutoScanEnabled() &&
          permission === "granted" &&
          !autoScanStartedRef.current
        ) {
          autoScanStartedRef.current = true;
          void autoClassify("auto");
          return;
        }

        setMessage(
          permission === "granted"
            ? `고정 폴더 '${handle.name}'가 연결되어 있습니다. 자동 분류하기를 누르면 새 파일만 확인합니다.`
            : `고정 폴더 '${handle.name}'가 저장되어 있습니다. 자동 분류하기를 누르면 브라우저 권한만 확인합니다.`,
        );
      })
      .catch(() => {
        if (mounted) setMessage("저장된 폴더 설정을 읽지 못했습니다. 설정에서 폴더를 다시 지정해 주세요.");
      });

    return () => {
      mounted = false;
    };
  }, []);

  const counts = useMemo(() => {
    const all = matches.flatMap((match) => match.files).filter((item) => !item.excluded);
    return {
      summary: all.filter((item) => item.type === "summary").length,
      team: all.filter((item) => item.type === "team").length,
      personal: all.filter((item) => item.type === "personal").length,
      replay: all.filter((item) => item.type === "replay").length,
      unknown: all.filter((item) => item.type === "unknown").length,
    };
  }, [matches]);

  const reviewingMatch = useMemo(
    () => matches.find((match) => match.id === reviewingMatchId) ?? null,
    [matches, reviewingMatchId],
  );

  async function autoClassify(source: "manual" | "auto" = "manual") {
    if (!supportsDirectoryPicker()) {
      setStatus("error");
      setMessage("현재 브라우저는 폴더 자동 읽기를 지원하지 않습니다. Windows의 Chrome 또는 Edge에서 localhost로 실행해 주세요.");
      return;
    }

    try {
      let handle = await getSavedScreenshotFolder();

      if (!handle) {
        if (source === "auto") {
          setStatus("idle");
          setMessage("설정에서 스크린샷 폴더를 먼저 지정해 주세요.");
          return;
        }
        handle = await pickAndSaveScreenshotFolder();
      } else {
        const allowed = await ensureScreenshotFolderPermission(handle, source === "manual");
        if (!allowed) {
          setStatus("idle");
          setFolderName(handle.name);
          setMessage(
            source === "auto"
              ? `고정 폴더 '${handle.name}'의 읽기 권한을 다시 확인해야 합니다. 자동 분류하기를 한 번 눌러 주세요.`
              : `고정 폴더 '${handle.name}'의 읽기 권한이 필요합니다. 브라우저 권한 요청을 허용해 주세요.`,
          );
          return;
        }
      }

      setStatus("scanning");
      setFolderName(handle.name);
      setMessage(`고정 폴더 '${handle.name}'에서 새 스크린샷을 찾고 있습니다...`);

      const files: File[] = [];
      for await (const entry of handle.values()) {
        if (entry.kind !== "file" || !entry.getFile) continue;
        const file = await entry.getFile();
        if (isImageFile(file)) files.push(file);
      }
      files.sort((a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name));

      const previous = loadFolderState(handle.name);
      if (!previous && files.length > 0) {
        const importExisting = window.confirm(
          `처음 연결한 폴더입니다.\n\n기존 이미지 ${files.length}장도 지금 분류할까요?\n\n확인 = 기존 이미지부터 분류\n취소 = 현재 파일은 건너뛰고 다음에 새로 찍는 사진부터 처리`,
        );
        if (!importExisting) {
          const newest = files[files.length - 1];
          saveFolderState(handle.name, {
            lastFileName: newest.name,
            lastModified: newest.lastModified,
            processedHashes: [],
          });
          setMatches([]);
          setScanSummary({
            totalInFolder: files.length,
            newFiles: 0,
            skippedDuplicates: 0,
            unclassifiedBeforeSummary: 0,
            detectedMatches: 0,
          });
          setLastProcessed(newest.name);
          setStatus("done");
          setMessage("기준점을 저장했습니다. 다음 촬영분부터 자동 분류합니다.");
          return;
        }
      }

      const candidates = previous ? files.filter((file) => isAfterCursor(file, previous)) : files;
      if (candidates.length === 0) {
        setMatches([]);
        setScanSummary({
          totalInFolder: files.length,
          newFiles: 0,
          skippedDuplicates: 0,
          unclassifiedBeforeSummary: 0,
          detectedMatches: 0,
        });
        setLastProcessed(previous?.lastFileName ?? "");
        setStatus("done");
        setMessage("새로 촬영된 이미지가 없습니다.");
        return;
      }

      setMessage(`새 이미지 ${candidates.length}장을 비교하고 있습니다...`);
      const refs = {
        summary: await loadReference("/references/summary.jpg"),
        team: await loadReference("/references/team.jpg"),
        personal: await loadReference("/references/personal.jpg"),
        replay: await loadReference("/references/replay.png"),
      };

      const knownHashes = new Set(previous?.processedHashes ?? []);
      const nextHashes = [...knownHashes];
      const classified: Classification[] = [];
      let skippedDuplicates = 0;

      try {
        for (let index = 0; index < candidates.length; index += 1) {
          const file = candidates[index];
          setMessage(`자동 분류 중 ${index + 1} / ${candidates.length} · ${file.name}`);
          const hash = await sha256(file);
          if (knownHashes.has(hash)) {
            skippedDuplicates += 1;
            continue;
          }
          knownHashes.add(hash);
          nextHashes.push(hash);
          classified.push(await classifyFile(file, hash, refs));
        }
      } finally {
        refs.summary.close();
        refs.team.close();
        refs.personal.close();
        refs.replay.close();
      }

      const grouped: DetectedMatch[] = [];
      let current: DetectedMatch | null = null;
      let beforeSummary = 0;

      for (const item of classified) {
        if (item.type === "summary") {
          current = {
            id: matchIdFrom(item.file.lastModified, grouped.length),
            localMatchKey: `summary:${item.hash}`,
            startedAt: item.file.lastModified,
            files: [item],
            reviewStatus: "unreviewed",
          };
          grouped.push(current);
          continue;
        }
        if (current) current.files.push(item);
        else beforeSummary += 1;
      }

      const newest = candidates[candidates.length - 1];
      saveFolderState(handle.name, {
        lastFileName: newest.name,
        lastModified: newest.lastModified,
        processedHashes: nextHashes,
      });

      setMatches(grouped);
      setScanSummary({
        totalInFolder: files.length,
        newFiles: classified.length,
        skippedDuplicates,
        unclassifiedBeforeSummary: beforeSummary,
        detectedMatches: grouped.length,
      });
      setLastProcessed(newest.name);
      setStatus("done");
      setMessage(
        grouped.length > 0
          ? `새 이미지 ${classified.length}장을 경기 ${grouped.length}건으로 분류했습니다.`
          : "새 이미지는 찾았지만 '요약' 화면이 없어 경기로 묶지 못했습니다.",
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("idle");
        setMessage("폴더 선택을 취소했습니다.");
        return;
      }
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "자동 분류 중 오류가 발생했습니다.");
    }
  }

  function resetCurrentFolder() {
    if (!folderName) return;
    const ok = window.confirm(`'${folderName}'의 마지막 처리 기록을 초기화할까요?\n다음 자동 분류에서 기존 이미지도 다시 가져올 수 있습니다.`);
    if (!ok) return;
    localStorage.removeItem(stateKey(folderName));
    setLastProcessed("");
    setMatches([]);
    setScanSummary(null);
    setMessage("처리 기록을 초기화했습니다. 다시 자동 분류하기를 눌러 주세요.");
    setStatus("idle");
  }

  function selectReviewMatch(match: DetectedMatch) {
    setReviewingMatchId(match.id);
    setSelectedFileId(match.files.find((file) => !file.excluded)?.id ?? match.files[0]?.id ?? null);
    setReviewNotice("");
    setUploadState({ phase: "idle", current: 0, total: 0, message: "" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openReview(match: DetectedMatch) {
    selectReviewMatch(match);
  }

  function openBatchReview() {
    const first = matches.find((match) => match.reviewStatus !== "pending_ocr") ?? matches[0];
    if (first) selectReviewMatch(first);
  }

  function moveReviewMatch(direction: -1 | 1) {
    if (!reviewingMatchId) return;
    const index = matches.findIndex((match) => match.id === reviewingMatchId);
    const next = matches[index + direction];
    if (next) selectReviewMatch(next);
  }

  function selectReviewMatchById(matchId: string) {
    const target = matches.find((match) => match.id === matchId);
    if (target) selectReviewMatch(target);
  }

  function closeReview() {
    setReviewingMatchId(null);
    setSelectedFileId(null);
    setReviewNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function patchMatch(matchId: string, updater: (match: DetectedMatch) => DetectedMatch) {
    setMatches((current) => current.map((match) => (match.id === matchId ? updater(match) : match)));
  }

  function changeFileType(matchId: string, fileId: string, type: ScreenType) {
    patchMatch(matchId, (match) => ({
      ...match,
      reviewStatus: "unreviewed",
      files: match.files.map((file) => (file.id === fileId ? { ...file, type } : file)),
    }));
    setReviewNotice("");
  }

  function toggleExcluded(matchId: string, fileId: string) {
    patchMatch(matchId, (match) => ({
      ...match,
      reviewStatus: "unreviewed",
      files: match.files.map((file) => (file.id === fileId ? { ...file, excluded: !file.excluded } : file)),
    }));
    setReviewNotice("");
  }

  function moveFile(matchId: string, fileId: string, direction: -1 | 1) {
    patchMatch(matchId, (match) => {
      const index = match.files.findIndex((file) => file.id === fileId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= match.files.length) return match;
      const files = [...match.files];
      [files[index], files[nextIndex]] = [files[nextIndex], files[index]];
      return { ...match, files, reviewStatus: "unreviewed" };
    });
    setReviewNotice("");
  }

  async function addManualFiles(matchId: string, event: ChangeEvent<HTMLInputElement>) {
    const selected = (Array.from(event.target.files ?? []) as File[]).filter(isImageFile);
    event.target.value = "";
    if (selected.length === 0) return;

    const additions: Classification[] = [];
    for (const file of selected) {
      const hash = await sha256(file);
      additions.push({
        id: `${hash.slice(0, 12)}-${file.lastModified}-${Date.now()}`,
        file,
        type: "unknown",
        score: 1,
        hash,
        excluded: false,
      });
    }

    patchMatch(matchId, (match) => ({
      ...match,
      reviewStatus: "unreviewed",
      files: [...match.files, ...additions],
    }));
    if (!selectedFileId && additions[0]) setSelectedFileId(additions[0].id);
    setReviewNotice(`${additions.length}장을 추가했습니다. 화면 종류를 직접 지정해 주세요.`);
  }

  async function markReady(match: DetectedMatch, skipValidation = false): Promise<boolean> {
    const validation = validateMatch(match);
    if (!skipValidation && !validation.valid) {
      setReviewNotice(validation.messages.join(" · "));
      return false;
    }

    const activeFiles = match.files.filter((file) => !file.excluded);
    const manifest: ReadyManifest = {
      local_match_key: match.localMatchKey,
      status: "ready_to_upload",
      started_at: new Date(match.startedAt).toISOString(),
      images: activeFiles.map((file, index) => ({
        client_file_id: `sha256:${file.hash}`,
        type: file.type,
        filename: file.file.name,
        size: file.file.size,
        last_modified: file.file.lastModified,
        sha256: file.hash,
        order: index + 1,
      })),
    };

    localStorage.setItem(readyManifestKey(match.localMatchKey), JSON.stringify(manifest));
    patchMatch(match.id, (current) => ({ ...current, reviewStatus: "uploading" }));
    setReviewNotice("");
    setUploadState({
      phase: "creating",
      current: 0,
      total: activeFiles.length,
      message: "Match Draft를 만들고 있습니다...",
    });

    try {
      const adapter = getMatchBackendAdapter();
      const draft = await adapter.createMatchDraft({
        contract_version: "0.1",
        local_match_key: match.localMatchKey,
        source: "local_folder_import",
        detected_at: new Date(match.startedAt).toISOString(),
        files: activeFiles.map((file) => ({
          client_file_id: `sha256:${file.hash}`,
          screen_type: file.type,
          original_name: file.file.name,
          mime_type: file.file.type || "application/octet-stream",
          size_bytes: file.file.size,
          last_modified_ms: file.file.lastModified,
          sha256: file.hash,
          classification_score: Number.isFinite(file.score) ? file.score : null,
        })),
      });

      const uploadedFiles: Array<{ upload_id: string; sha256: string }> = [];

      for (let index = 0; index < activeFiles.length; index += 1) {
        const item = activeFiles[index];
        const clientFileId = `sha256:${item.hash}`;
        const target = draft.uploads.find((upload) => upload.client_file_id === clientFileId);
        if (!target) throw new Error(`업로드 대상이 없습니다: ${item.file.name}`);

        setUploadState({
          phase: "uploading",
          current: index,
          total: activeFiles.length,
          message: `${index + 1} / ${activeFiles.length} · ${item.file.name}`,
          matchId: draft.match_id,
        });

        await adapter.uploadMatchFile(target, item.file);
        uploadedFiles.push({ upload_id: target.upload_id, sha256: item.hash });

        setUploadState({
          phase: "uploading",
          current: index + 1,
          total: activeFiles.length,
          message: `${index + 1} / ${activeFiles.length} 업로드 완료`,
          matchId: draft.match_id,
        });
      }

      setUploadState({
        phase: "completing",
        current: activeFiles.length,
        total: activeFiles.length,
        message: "업로드 완료 상태를 저장하고 있습니다...",
        matchId: draft.match_id,
      });

      const completed = await adapter.completeMatchUpload({
        contract_version: "0.1",
        match_id: draft.match_id,
        uploaded_files: uploadedFiles,
      });

      setUploadState({
        phase: "completing",
        current: activeFiles.length,
        total: activeFiles.length,
        message: "업로드 완료 · 실제 OCR 서버로 이미지를 보내고 있습니다...",
        matchId: completed.matchId,
      });

      resetOcrActivity("실제 OCR 서버 연결을 준비하고 있습니다.");
      const ocrView = await runRealOcrForMatch(
        adapter,
        completed.matchId,
        activeFiles.map((item) => ({
          screen_type: item.type,
          file: item.file,
        })),
        { onProgress: handleOcrProgress },
      );

      patchMatch(match.id, (current) => ({
        ...current,
        reviewStatus: "pending_ocr",
        backendMatchId: completed.matchId,
        ocrEditable: ocrView.editable,
        ocrMessage: ocrView.ocr.message,
        ocrGeneratedAt: ocrView.ocr.generated_at,
      }));
      setUploadState({
        phase: ocrView.status === "failed" ? "error" : "done",
        current: activeFiles.length,
        total: activeFiles.length,
        message: ocrView.ocr.message,
        matchId: completed.matchId,
      });
      setReviewNotice(
        ocrView.status === "failed"
          ? "업로드는 끝났지만 OCR 처리에 실패했습니다. OCR 서버를 확인해 주세요."
          : `실제 OCR 연결 완료 · match_id ${completed.matchId}`,
      );
      return ocrView.status !== "failed";
    } catch (error) {
      patchMatch(match.id, (current) => ({ ...current, reviewStatus: "ready_to_upload" }));
      setOcrActivity((current) => ({ ...current, running: false }));
      setUploadState({
        phase: "error",
        current: 0,
        total: activeFiles.length,
        message: error instanceof Error ? error.message : "업로드 중 오류가 발생했습니다.",
      });
      setReviewNotice("업로드 또는 OCR 처리에 실패했습니다. 다시 시도할 수 있습니다.");
      openErrorDialog(
        "경기 등록 처리 오류",
        "업로드 또는 OCR 처리 중 오류가 발생했습니다.",
        error,
      );
      return false;
    }
  }

  async function completeReviewAndNext(match: DetectedMatch) {
    if (match.reviewStatus === "confirmed") {
      const currentIndex = matches.findIndex((item) => item.id === match.id);
      const next = matches[currentIndex + 1];
      if (next) {
        selectReviewMatch(next);
      } else {
        setMessage("이번에 발견된 모든 경기 등록이 끝났습니다.");
        closeReview();
      }
      return;
    }

    if (match.reviewStatus !== "pending_ocr") {
      const completed = await markReady(match);
      if (!completed) return;
      setReviewNotice("OCR이 완료되었습니다. 아래 OCR 결과를 확인하고 수정한 뒤 최종 저장해 주세요.");
      return;
    }

    setReviewNotice("아래 OCR 결과를 검수한 뒤 'OCR 검수 완료'를 눌러 주세요.");
  }

  function updateOcrEditable(matchId: string, patch: Partial<EditableMatchFields>) {
    patchMatch(matchId, (current) => ({
      ...current,
      ocrEditable: {
        ...(current.ocrEditable ?? {
          played_at: new Date(current.startedAt).toISOString(),
          map_name: "",
          game_mode: "",
          result: "unknown" as MatchResult,
          my_hero: "",
          season: "",
          patch_label: "",
          side: "unknown",
          control_submap: "",
          round_sequence: "",
          match_duration: "",
          notes: "",
        }),
        ...patch,
      },
    }));
  }

  async function confirmOcrReview(match: DetectedMatch) {
    if (!match.backendMatchId) {
      setReviewNotice("저장된 match_id가 없어 OCR 검수를 완료할 수 없습니다.");
      return;
    }

    setUploadState({
      phase: "completing",
      current: 1,
      total: 1,
      message: "검수한 OCR 값을 저장하고 있습니다...",
      matchId: match.backendMatchId,
    });

    try {
      const adapter = getMatchBackendAdapter();
      const current = await adapter.getMatchImport(match.backendMatchId);
      const reviewedMatch = match.ocrEditable ?? current.editable;
      if (match.ocrEditable) {
        await adapter.updateMatchImport(match.backendMatchId, match.ocrEditable);
      }

      const reviewDraft = loadReviewDraft(match.backendMatchId, reviewedMatch.my_hero);
      await adapter.confirmMatch({
        contract_version: "0.1",
        match_id: match.backendMatchId,
        match: reviewedMatch,
        players: toConfirmPlayers(reviewDraft),
        my_hero_details: toConfirmHeroDetails(reviewDraft),
        manual_fields: {},
      });

      patchMatch(match.id, (item) => ({
        ...item,
        reviewStatus: "confirmed",
        ocrEditable: reviewedMatch,
      }));
      setUploadState({
        phase: "done",
        current: 1,
        total: 1,
        message: "OCR 검수값 저장 완료",
        matchId: match.backendMatchId,
      });

      const currentIndex = matches.findIndex((item) => item.id === match.id);
      const next = matches[currentIndex + 1];
      if (next) {
        setReviewNotice("OCR 검수값을 저장했습니다. 다음 경기로 이동합니다.");
        selectReviewMatch(next);
      } else {
        setMessage("이번에 발견된 모든 경기의 분류 · OCR · 검수가 끝났습니다.");
        closeReview();
      }
    } catch (error) {
      setUploadState({
        phase: "error",
        current: 0,
        total: 1,
        message: error instanceof Error ? error.message : "OCR 검수값 저장에 실패했습니다.",
        matchId: match.backendMatchId,
      });
      setReviewNotice("OCR 검수값 저장에 실패했습니다. 값을 확인하고 다시 시도해 주세요.");
      openErrorDialog(
        "OCR 검수 저장 오류",
        "검수한 OCR 데이터를 저장하는 중 오류가 발생했습니다.",
        error,
      );
    }
  }

  async function rerunOcr(match: DetectedMatch) {
    if (!match.backendMatchId) {
      setReviewNotice("저장된 match_id가 없어 OCR을 다시 실행할 수 없습니다.");
      return;
    }

    const activeFiles = match.files.filter((file) => !file.excluded);
    setReviewNotice("");
    setUploadState({
      phase: "completing",
      current: activeFiles.length,
      total: activeFiles.length,
      message: "OCR을 다시 실행하고 있습니다...",
      matchId: match.backendMatchId,
    });
    resetOcrActivity("OCR 재실행을 준비하고 있습니다.");

    try {
      const ocrView = await runRealOcrForMatch(
        getMatchBackendAdapter(),
        match.backendMatchId,
        activeFiles.map((item) => ({
          screen_type: item.type,
          file: item.file,
        })),
        { onProgress: handleOcrProgress },
      );

      patchMatch(match.id, (current) => ({
        ...current,
        reviewStatus: "pending_ocr",
        ocrEditable: ocrView.editable,
        ocrMessage: ocrView.ocr.message,
        ocrGeneratedAt: ocrView.ocr.generated_at,
      }));
      setUploadState({
        phase: ocrView.status === "failed" ? "error" : "done",
        current: activeFiles.length,
        total: activeFiles.length,
        message: ocrView.ocr.message,
        matchId: match.backendMatchId,
      });
      setReviewNotice(
        ocrView.status === "failed"
          ? "OCR 재실행에 실패했습니다. OCR 서버 상태를 확인해 주세요."
          : "OCR 재실행이 완료되었습니다.",
      );
    } catch (error) {
      setOcrActivity((current) => ({ ...current, running: false }));
      setUploadState({
        phase: "error",
        current: activeFiles.length,
        total: activeFiles.length,
        message: error instanceof Error ? error.message : "OCR 재실행 중 오류가 발생했습니다.",
        matchId: match.backendMatchId,
      });
      setReviewNotice("OCR 재실행에 실패했습니다.");
      openErrorDialog(
        "OCR 재실행 오류",
        "OCR을 다시 실행하는 중 오류가 발생했습니다.",
        error,
      );
    }
  }


  async function approveAllWithoutReview() {
    const targets = matches.filter(
      (item) => item.reviewStatus !== "pending_ocr" && item.reviewStatus !== "confirmed",
    );
    if (targets.length === 0) {
      setMessage("이번에 발견된 경기는 이미 모두 OCR 단계까지 처리되었습니다.");
      return;
    }

    const ok = window.confirm(
      `자동 분류 결과를 그대로 사용해 남은 ${targets.length}개 경기를 한 번에 OCR까지 실행할까요?\n\nOCR 결과는 이후 각 경기에서 직접 검수합니다.`,
    );
    if (!ok) return;

    setBulkReviewState({ running: true, current: 0, total: targets.length });
    let succeeded = 0;

    for (let index = 0; index < targets.length; index += 1) {
      setBulkReviewState({ running: true, current: index + 1, total: targets.length });
      const completed = await markReady(targets[index], true);
      if (completed) succeeded += 1;
    }

    setBulkReviewState({ running: false, current: targets.length, total: targets.length });

    if (succeeded === targets.length) {
      setMessage(`${succeeded}개 경기의 OCR 실행이 끝났습니다. OCR 결과를 순서대로 검수해 주세요.`);
      const first = targets[0];
      if (first) selectReviewMatch(first);
    } else {
      setReviewNotice(`${targets.length}개 중 ${succeeded}개 완료. 실패한 경기는 다시 시도해 주세요.`);
    }
  }

  if (reviewingMatch) {
    const reviewIndex = matches.findIndex((match) => match.id === reviewingMatch.id);
    const reviewedCount = matches.filter(
      (match) => match.reviewStatus === "pending_ocr" || match.reviewStatus === "confirmed",
    ).length;

    return (
      <ReviewScreen
        match={reviewingMatch}
        queue={matches}
        currentIndex={reviewIndex}
        reviewedCount={reviewedCount}
        selectedFileId={selectedFileId}
        notice={reviewNotice}
        onSelectFile={setSelectedFileId}
        onBack={closeReview}
        onSelectMatch={selectReviewMatchById}
        onPrevious={() => moveReviewMatch(-1)}
        onNext={() => moveReviewMatch(1)}
        onChangeType={(fileId, type) => changeFileType(reviewingMatch.id, fileId, type)}
        onToggleExcluded={(fileId) => toggleExcluded(reviewingMatch.id, fileId)}
        onMove={(fileId, direction) => moveFile(reviewingMatch.id, fileId, direction)}
        onAddFiles={(event) => addManualFiles(reviewingMatch.id, event)}
        onReady={() => markReady(reviewingMatch)}
        onReadyAndNext={() => completeReviewAndNext(reviewingMatch)}
        onRerunOcr={() => rerunOcr(reviewingMatch)}
        onConfirmOcr={() => confirmOcrReview(reviewingMatch)}
        onUpdateOcrField={(patch) => updateOcrEditable(reviewingMatch.id, patch)}
        onApproveAll={() => approveAllWithoutReview()}
        bulkReviewState={bulkReviewState}
        uploadState={uploadState}
        ocrActivity={ocrActivity}
        errorDialog={errorDialog}
        onCloseError={() => setErrorDialog(null)}
      />
    );
  }

  return (
    <main className="min-h-screen px-4 py-7 md:px-6 lg:px-8">
      {errorDialog && <ErrorDialogModal dialog={errorDialog} onClose={() => setErrorDialog(null)} />}
      <div className="mx-auto max-w-[1320px]">
        <header className="flex flex-col gap-4 border-b border-[var(--line)] pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">Import</p>
            <h1 className="m-0 text-[28px] font-semibold tracking-[-0.03em] text-white md:text-[32px]">경기 등록</h1>
            <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">지정한 스크린샷 폴더에서 새 이미지만 찾아 경기 단위로 묶습니다.</p>
          </div>
          <button type="button" disabled={status === "scanning"} onClick={() => void autoClassify("manual")}
            className="app-orange-button w-fit rounded-md px-4 py-2.5 text-[12px] font-semibold disabled:cursor-wait disabled:opacity-60">
            {status === "scanning" ? "분류 중..." : "새 경기 찾기"}
          </button>
        </header>

        <section className="grid border-b border-[var(--line)] md:grid-cols-[1fr_auto]">
          <div className="py-4 md:pr-6">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px]">
              <span className="text-[var(--muted)]">폴더 <strong className="ml-1 font-medium text-white">{folderName || "미연결"}</strong></span>
              <span className="text-[var(--muted)]">마지막 처리 <strong className="ml-1 font-medium text-white">{lastProcessed || "없음"}</strong></span>
              {folderName && <button type="button" onClick={resetCurrentFolder} className="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-[var(--muted)] hover:text-white">처리 기록 초기화</button>}
            </div>
            <p className={`mb-0 mt-3 text-[12px] leading-5 ${status === "error" ? "text-[var(--danger)]" : status === "done" ? "text-[#9fcaae]" : "text-[var(--muted)]"}`}>{message}</p>
          </div>
          <div className="flex items-center border-t border-[var(--line)] py-4 md:border-l md:border-t-0 md:pl-6">
            <span className="text-[11px] text-[var(--muted)]">기준</span>
            <span className="ml-2 text-[11px] font-medium text-white">요약 화면 = 새 경기 시작</span>
          </div>
        </section>

        {scanSummary && (
          <section className="grid grid-cols-2 border-b border-[var(--line)] md:grid-cols-4">
            <InlineMetric label="새 이미지" value={`${scanSummary.newFiles}장`} />
            <InlineMetric label="발견 경기" value={`${scanSummary.detectedMatches}건`} accent />
            <InlineMetric label="중복 제외" value={`${scanSummary.skippedDuplicates}장`} />
            <InlineMetric label="요약 이전" value={`${scanSummary.unclassifiedBeforeSummary}장`} />
          </section>
        )}

        <div className="grid gap-8 pt-8 xl:grid-cols-[1fr_280px]">
          <section>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="m-0 text-[14px] font-semibold text-white">발견된 경기</h2>
                <p className="mt-1 text-[11px] text-[var(--muted)]">분류 결과를 확인한 뒤 OCR 검수로 이어집니다.</p>
              </div>
              {matches.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="mr-1 text-[11px] text-[var(--muted)]">{matches.length}건</span>
                  <button type="button" onClick={openBatchReview} className="cursor-pointer rounded-md border border-[var(--line)] bg-[#151619] px-3 py-2 text-[11px] font-medium text-white hover:bg-[#1a1b1f]">전체 검수</button>
                  <button type="button" disabled={bulkReviewState.running} onClick={() => void approveAllWithoutReview()} className="cursor-pointer rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[11px] text-[var(--muted)] hover:text-white disabled:opacity-50">
                    {bulkReviewState.running ? `${bulkReviewState.current}/${bulkReviewState.total} 처리 중` : "일괄 진행"}
                  </button>
                </div>
              )}
            </div>

            {matches.length > 0 ? (
              <div className="border-y border-[var(--line)]">
                {matches.map((match, index) => {
                  const validation = validateMatch(match);
                  const active = match.files.filter((file) => !file.excluded);
                  const summary = active.filter((file) => file.type === "summary").length;
                  const team = active.filter((file) => file.type === "team").length;
                  const personal = active.filter((file) => file.type === "personal").length;
                  const replay = active.filter((file) => file.type === "replay").length;
                  const unknown = active.filter((file) => file.type === "unknown").length;
                  return (
                    <article key={match.id} className="grid gap-4 border-b border-[var(--line-soft)] px-1 py-4 last:border-b-0 hover:bg-[#101114] sm:grid-cols-[56px_160px_1fr_auto] sm:items-center sm:px-2">
                      <span className="text-[11px] text-[var(--muted)]">#{String(index + 1).padStart(2, "0")}</span>
                      <div><p className="m-0 text-[12px] font-medium text-white">{formatDate(match.startedAt)}</p><p className="mt-1 truncate text-[10px] text-[var(--muted)]">{match.localMatchKey.slice(0, 22)}</p></div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[var(--muted)]">
                        <span>요약 <strong className="font-medium text-[#c8cad0]">{summary}</strong></span>
                        <span>팀 <strong className="font-medium text-[#c8cad0]">{team}</strong></span>
                        <span>개인 <strong className="font-medium text-[#c8cad0]">{personal}</strong></span>
                        <span>리플레이 <strong className="font-medium text-[#c8cad0]">{replay}</strong></span>
                        {unknown > 0 && <span className="text-[var(--warning)]">미분류 {unknown}</span>}
                        <span className={validation.valid ? "text-[#8fb89d]" : "text-[var(--warning)]"}>{validation.valid ? "검수 가능" : "확인 필요"}</span>
                      </div>
                      <button type="button" onClick={() => openReview(match)} className="cursor-pointer rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[11px] font-medium text-[#d5d6d9] hover:bg-[#17181b] hover:text-white">{match.reviewStatus === "unreviewed" ? "검수" : "다시 보기"}</button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="border-y border-dashed border-[#34363c] py-16 text-center">
                <p className="m-0 text-[13px] font-medium text-white">새로 분류된 경기가 없습니다</p>
                <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">위의 ‘새 경기 찾기’를 누르면 마지막 처리 이후의 스크린샷만 확인합니다.</p>
              </div>
            )}
          </section>

          <aside className="space-y-7">
            <section>
              <h2 className="m-0 text-[13px] font-semibold text-white">이번 분류</h2>
              <dl className="mt-3 border-t border-[var(--line)]">
                <CompactStatusRow label="요약" value={`${counts.summary}장`} />
                <CompactStatusRow label="팀" value={`${counts.team}장`} />
                <CompactStatusRow label="개인" value={`${counts.personal}장`} />
                <CompactStatusRow label="리플레이" value={`${counts.replay}장`} />
                <CompactStatusRow label="미분류" value={`${counts.unknown}장`} warning={counts.unknown > 0} />
              </dl>
            </section>
            <section>
              <h2 className="m-0 text-[13px] font-semibold text-white">분류 기준</h2>
              <div className="mt-3 border-t border-[var(--line)] text-[11px] leading-5 text-[var(--muted)]">
                <RuleRow number="01" title="요약" text="새 경기 시작" />
                <RuleRow number="02" title="팀" text="10인 스코어보드" />
                <RuleRow number="03" title="개인" text="영웅 상세 통계" />
                <RuleRow number="04" title="리플레이" text="타임라인 화면" />
              </div>
            </section>
            <section className="border-t border-[var(--line)] pt-4">
              <p className="m-0 text-[11px] leading-5 text-[var(--muted)]">분류 검수 → OCR 실행 → OCR 값 확인 → 최종 저장</p>
              <p className="mb-0 mt-2 text-[10px] text-[#666a73]">OCR: localhost:8001 · Backend: {BACKEND_MODE}</p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function ReviewScreen({
  match,
  queue,
  currentIndex,
  reviewedCount,
  selectedFileId,
  notice,
  onSelectFile,
  onBack,
  onSelectMatch,
  onPrevious,
  onNext,
  onChangeType,
  onToggleExcluded,
  onMove,
  onAddFiles,
  onReady,
  onReadyAndNext,
  onRerunOcr,
  onConfirmOcr,
  onUpdateOcrField,
  onApproveAll,
  bulkReviewState,
  uploadState,
  ocrActivity,
  errorDialog,
  onCloseError,
}: {
  match: DetectedMatch;
  queue: DetectedMatch[];
  currentIndex: number;
  reviewedCount: number;
  selectedFileId: string | null;
  notice: string;
  onSelectFile: (id: string) => void;
  onBack: () => void;
  onSelectMatch: (matchId: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onChangeType: (fileId: string, type: ScreenType) => void;
  onToggleExcluded: (fileId: string) => void;
  onMove: (fileId: string, direction: -1 | 1) => void;
  onAddFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onReady: () => void;
  onReadyAndNext: () => void;
  onRerunOcr: () => void;
  onConfirmOcr: () => void;
  onUpdateOcrField: (patch: Partial<EditableMatchFields>) => void;
  onApproveAll: () => void;
  bulkReviewState: { running: boolean; current: number; total: number };
  uploadState: UploadUiState;
  ocrActivity: OcrActivityState;
  errorDialog: ErrorDialogState | null;
  onCloseError: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const validation = validateMatch(match);
  const activeFiles = match.files.filter((file) => !file.excluded);
  const selected = match.files.find((file) => file.id === selectedFileId) ?? activeFiles[0] ?? match.files[0] ?? null;
  const perType = useMemo(
    () => ({
      summary: activeFiles.filter((item) => item.type === "summary").length,
      team: activeFiles.filter((item) => item.type === "team").length,
      personal: activeFiles.filter((item) => item.type === "personal").length,
      replay: activeFiles.filter((item) => item.type === "replay").length,
      unknown: activeFiles.filter((item) => item.type === "unknown").length,
    }),
    [activeFiles],
  );

  return (
    <main className="min-h-screen px-4 py-7 md:px-6 lg:px-8">
      {errorDialog && <ErrorDialogModal dialog={errorDialog} onClose={onCloseError} />}
      <div className="mx-auto max-w-[1320px]">

        <section className="mb-7 border-y border-[var(--line)] py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-sm bg-[#17181b] px-2 py-1 text-[9px] font-medium text-[#c7c9ce]">BATCH REVIEW</span>
                <span className="text-xs font-bold text-white">{currentIndex + 1} / {queue.length}</span>
                <span className="text-[10px] text-[var(--muted)]">완료 {reviewedCount}건</span>
              </div>
              <div className="mt-3 h-1 w-full max-w-[360px] overflow-hidden rounded-sm bg-[#1b1d21]">
                <div
                  className="h-full bg-[var(--orange)] transition-all"
                  style={{ width: `${queue.length > 0 ? Math.round(((currentIndex + 1) / queue.length) * 100) : 0}%` }}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={bulkReviewState.running}
                onClick={onApproveAll}
                className="cursor-pointer rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[10px] font-medium text-[#b7d5c1] hover:bg-[rgba(121,227,156,0.10)] disabled:cursor-wait disabled:opacity-50"
              >
                {bulkReviewState.running
                  ? `전체 처리 중 ${bulkReviewState.current}/${bulkReviewState.total}`
                  : "분류 검수 건너뛰고 전체 OCR"}
              </button>
              <button
                type="button"
                disabled={currentIndex <= 0 || bulkReviewState.running}
                onClick={onPrevious}
                className="cursor-pointer rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[10px] font-medium text-[#d5d6d9] disabled:cursor-not-allowed disabled:opacity-30"
              >
                ← 이전 경기
              </button>
              <button
                type="button"
                disabled={currentIndex >= queue.length - 1 || bulkReviewState.running}
                onClick={onNext}
                className="cursor-pointer rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[10px] font-medium text-[#d5d6d9] disabled:cursor-not-allowed disabled:opacity-30"
              >
                다음 경기 →
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
            {queue.map((item, index) => {
              const valid = validateMatch(item).valid;
              const done = item.reviewStatus === "pending_ocr" || item.reviewStatus === "confirmed";
              const active = item.id === match.id;

              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onSelectMatch(item.id)}
                  className={`min-w-[108px] cursor-pointer rounded-md border px-3 py-2 text-left transition ${
                    active
                      ? "border-[#3b3e45] bg-[#17181b]"
                      : done
                        ? "border-[#2d3530] bg-transparent"
                        : "border-[var(--line)] bg-transparent hover:bg-[#121316]"
                  }`}
                >
                  <span className={`block text-[9px] font-medium ${active ? "text-[var(--orange)]" : done ? "text-[#9fcaae]" : "text-[var(--muted)]"}`}>
                    경기 {index + 1}
                  </span>
                  <span className="mt-1 block text-[10px] font-medium text-white">
                    {item.reviewStatus === "confirmed"
                      ? "저장 완료"
                      : item.reviewStatus === "pending_ocr"
                        ? "OCR 검수"
                        : valid
                          ? "분류 검수"
                          : "확인 필요"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-6 flex flex-col gap-4 border-b border-[var(--line)] pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <button type="button" onClick={onBack} className="mb-3 cursor-pointer border-0 bg-transparent p-0 text-[11px] font-medium text-[var(--muted)] hover:text-white">← 전체 검수 종료</button>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">경기 검수</p>
            <h1 className="m-0 text-[28px] font-semibold tracking-[-0.03em]">{match.id}</h1>
            <p className="mt-2 text-xs text-[var(--muted)]">자동 분류가 틀린 이미지는 직접 바꾸고, 필요 없는 이미지는 제외한 뒤 업로드 준비 완료로 표시하세요.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TypePill type="summary" count={perType.summary} />
            <TypePill type="team" count={perType.team} />
            <TypePill type="personal" count={perType.personal} />
            <TypePill type="replay" count={perType.replay} />
            {perType.unknown > 0 && <TypePill type="unknown" count={perType.unknown} />}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="space-y-4">
            <div className="overflow-hidden rounded-md border border-[var(--line)] bg-[#050607]">
              <div className="flex min-h-[360px] items-center justify-center bg-black p-3 md:min-h-[520px]">
                {selected ? (
                  <FilePreview file={selected.file} className={`max-h-[620px] max-w-full object-contain ${selected.excluded ? "opacity-35 grayscale" : ""}`} />
                ) : (
                  <p className="text-sm text-[var(--muted)]">선택된 이미지가 없습니다.</p>
                )}
              </div>
              {selected && (
                <div className="flex flex-col gap-2 border-t border-[var(--line)] bg-transparent px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="m-0 truncate text-sm font-bold">{selected.file.name}</p>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">{formatDate(selected.file.lastModified)} · {formatBytes(selected.file.size)} · SHA {selected.hash.slice(0, 12)}…</p>
                  </div>
                  <span className={`w-fit rounded-sm px-2 py-1 text-[10px] font-medium ${typeClass(selected.type)}`}>{TYPE_META[selected.type].label}</span>
                </div>
              )}
            </div>

            <div className="border-t border-[var(--line)] pt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="m-0 text-sm font-bold">이미지 빠른 선택</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">썸네일을 클릭하면 크게 볼 수 있습니다.</p>
                </div>
                <span className="text-xs text-[var(--muted)]">{activeFiles.length}장 사용</span>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                {match.files.map((file, index) => (
                  <button
                    type="button"
                    key={file.id}
                    onClick={() => onSelectFile(file.id)}
                    className={`relative aspect-video cursor-pointer overflow-hidden rounded-sm border bg-black ${selected?.id === file.id ? "border-[var(--orange)]" : "border-[var(--line)]"} ${file.excluded ? "opacity-35" : ""}`}
                  >
                    <FilePreview file={file.file} className="h-full w-full object-cover" />
                    <span className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[9px] font-medium ${typeClass(file.type)}`}>{index + 1} · {TYPE_META[file.type].label}</span>
                    {file.excluded && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[10px] font-semibold text-white">제외됨</span>}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="border-t border-[var(--line)] pt-4">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="m-0 text-sm font-bold">이미지 분류 수정</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">순서와 화면 종류를 여기서 확정합니다.</p>
                </div>
                <div>
                  <input ref={fileInputRef} className="hidden" type="file" accept="image/*" multiple onChange={onAddFiles} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="cursor-pointer rounded-lg border border-[var(--line)] bg-[#0d1118] px-3 py-2 text-[11px] font-bold text-white hover:border-[#4b5668]">+ 이미지 추가</button>
                </div>
              </div>

              <div className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                {match.files.map((file, index) => (
                  <div key={file.id} className={`border-b border-[var(--line-soft)] py-3 ${file.excluded ? "border-[#2a303b] bg-[#0a0d12] opacity-55" : selected?.id === file.id ? "border-[rgba(249,158,26,0.55)] bg-transparent" : "border-[var(--line)] bg-[#0d1118]"}`}>
                    <button type="button" onClick={() => onSelectFile(file.id)} className="mb-2 flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left text-white">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-[#151619] text-[10px] font-semibold text-[var(--muted)]">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className={`m-0 truncate text-xs font-bold ${file.excluded ? "line-through text-[var(--muted)]" : "text-white"}`}>{file.file.name}</p>
                        <p className="mt-1 text-[9px] text-[var(--muted)]">score {file.score.toFixed(3)}</p>
                      </div>
                    </button>

                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <select
                        value={file.type}
                        disabled={file.excluded}
                        onChange={(event) => onChangeType(file.id, event.target.value as ScreenType)}
                        className="min-w-0 rounded-md border border-[var(--line)] bg-transparent px-2.5 py-2 text-xs font-bold text-white outline-none focus:border-[var(--orange)] disabled:opacity-50"
                      >
                        {(Object.keys(TYPE_META) as ScreenType[]).map((type) => (
                          <option key={type} value={type}>{TYPE_META[type].label} · {TYPE_META[type].description}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => onToggleExcluded(file.id)} className={`cursor-pointer rounded-lg border px-3 py-2 text-[10px] font-medium ${file.excluded ? "border-[rgba(121,227,156,0.25)] text-[#9fcaae]" : "border-[#503336] text-[#ff9b9b]"}`}>
                        {file.excluded ? "복원" : "제외"}
                      </button>
                    </div>

                    <div className="mt-2 flex gap-2">
                      <button type="button" disabled={index === 0} onClick={() => onMove(file.id, -1)} className="flex-1 cursor-pointer rounded-md border border-[var(--line)] px-2 py-1.5 text-[10px] text-[var(--muted)] enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-30">↑ 앞 순서</button>
                      <button type="button" disabled={index === match.files.length - 1} onClick={() => onMove(file.id, 1)} className="flex-1 cursor-pointer rounded-md border border-[var(--line)] px-2 py-1.5 text-[10px] text-[var(--muted)] enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-30">↓ 뒤 순서</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className={`border-t border-[var(--line)] pt-4 ${validation.valid ? "border-[var(--line)] bg-transparent" : "border-[var(--line)] bg-transparent"}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={`m-0 text-sm font-bold ${validation.valid ? "text-[#9fcaae]" : "text-[var(--orange)]"}`}>{validation.valid ? "검수 조건 충족" : "확인할 항목이 있습니다"}</p>
                  <div className="mt-3 space-y-2 text-xs text-[var(--muted)]">
                    <ValidationRow ok={perType.summary === 1} text={`요약 ${perType.summary}장 · 정확히 1장 필요`} />
                    <ValidationRow ok={perType.team === 1} text={`팀 ${perType.team}장 · 정확히 1장 필요`} />
                    <ValidationRow ok={perType.unknown === 0} text={`미분류 ${perType.unknown}장 · 0장이어야 완료 가능`} />
                    <ValidationRow ok text={`개인 ${perType.personal}장 · 여러 장 가능`} neutral />
                    <ValidationRow ok text={`리플레이 ${perType.replay}장 · 선택`} neutral />
                  </div>
                </div>
                <span className={`rounded-sm px-2 py-1 text-[9px] font-medium ${match.reviewStatus === "ready_to_upload" ? "bg-transparent text-[#9fcaae]" : "bg-[#171e2a] text-[var(--muted)]"}`}>
                  {match.reviewStatus === "confirmed"
                    ? "SAVED"
                    : match.reviewStatus === "pending_ocr"
                      ? "OCR REVIEW"
                      : match.reviewStatus === "uploading"
                        ? "UPLOADING"
                        : match.reviewStatus === "ready_to_upload"
                          ? "READY"
                          : "REVIEW"}
                </span>
              </div>

              {notice && <div className="mt-4 rounded-md border border-[var(--line)] bg-transparent px-3 py-2.5 text-xs leading-5 text-[#c8d0dc]">{notice}</div>}

              {uploadState.phase !== "idle" && (
                <div className="mt-4 rounded-md border border-[var(--line)] bg-transparent px-3 py-3">
                  <div className="mb-2 flex items-center justify-between gap-3 text-[10px] text-[var(--muted)]">
                    <span>{uploadState.message}</span>
                    <span>{uploadState.total > 0 ? `${uploadState.current}/${uploadState.total}` : ""}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#1b2230]">
                    <div
                      className="h-full bg-[var(--orange)] transition-all"
                      style={{ width: `${uploadState.total > 0 ? Math.round((uploadState.current / uploadState.total) * 100) : 10}%` }}
                    />
                  </div>
                  {uploadState.matchId && <p className="mb-0 mt-2 break-all text-[9px] text-[var(--muted)]">match_id · {uploadState.matchId}</p>}
                </div>
              )}

              {ocrActivity.logs.length > 0 && (
                <OcrActivityPanel state={ocrActivity} />
              )}

              {match.reviewStatus !== "pending_ocr" && match.reviewStatus !== "confirmed" && (
                <button
                  type="button"
                  disabled={
                    bulkReviewState.running ||
                    !validation.valid ||
                    uploadState.phase === "creating" ||
                    uploadState.phase === "uploading" ||
                    uploadState.phase === "completing"
                  }
                  onClick={onReadyAndNext}
                  className="mt-4 w-full rounded-md bg-[var(--orange)] px-4 py-2.5 text-[12px] font-semibold text-[#17120d] transition enabled:cursor-pointer enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {uploadState.phase === "creating" || uploadState.phase === "uploading" || uploadState.phase === "completing"
                    ? "업로드 · OCR 실행 중..."
                    : "분류 검수 완료 · OCR 실행"}
                </button>
              )}
              {match.reviewStatus !== "pending_ocr" && match.reviewStatus !== "confirmed" && validation.valid && (
                <button
                  type="button"
                  onClick={onReady}
                  disabled={
                    uploadState.phase === "creating" ||
                    uploadState.phase === "uploading" ||
                    uploadState.phase === "completing"
                  }
                  className="mt-2 w-full cursor-pointer rounded-md border border-[var(--line)] bg-[#0d1118] px-5 py-3 text-[10px] font-medium text-[var(--muted)] hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                >
                  이 경기만 저장하고 계속 보기
                </button>
              )}
              <p className="mb-0 mt-3 text-[10px] leading-4 text-[var(--muted)]">현재 백엔드 모드: <strong className="text-white">{BACKEND_MODE}</strong>. 실제 Supabase 연결 전까지 연결규격 v0.1과 동일한 Mock Adapter로 업로드 흐름을 검증합니다.</p>
            </section>
          </aside>
        </div>

        {match.backendMatchId && (match.reviewStatus === "pending_ocr" || match.reviewStatus === "confirmed") && (
          <section className="mt-5 space-y-4 border-t border-[var(--line)] pt-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="m-0 text-sm font-bold text-[#aeb4bf]">OCR 결과 검수</p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">
                  이미지 분류와 OCR 검수를 이 화면에서 이어서 끝냅니다. 수정한 값이 최종 저장값이 됩니다.
                </p>
              </div>
              <span className="rounded-full bg-transparent px-2.5 py-1 text-[9px] font-medium text-[#aeb4bf]">
                {match.reviewStatus === "confirmed" ? "SAVED" : "OCR REVIEW"}
              </span>
            </div>

            {match.ocrEditable && (
              <div className="grid gap-3 md:grid-cols-4">
                <label>
                  <span className="mb-2 block text-[10px] font-medium text-[var(--muted)]">결과</span>
                  <select
                    className="field-input"
                    value={match.ocrEditable.result}
                    disabled={match.reviewStatus === "confirmed"}
                    onChange={(event) => onUpdateOcrField({ result: event.target.value as MatchResult })}
                  >
                    <option value="unknown">미확인</option>
                    <option value="win">승리</option>
                    <option value="loss">패배</option>
                    <option value="draw">무승부</option>
                  </select>
                </label>
                <label>
                  <span className="mb-2 block text-[10px] font-medium text-[var(--muted)]">게임 모드</span>
                  <input
                    className="field-input"
                    value={match.ocrEditable.game_mode}
                    disabled={match.reviewStatus === "confirmed"}
                    onChange={(event) => onUpdateOcrField({ game_mode: event.target.value })}
                    placeholder="게임 모드"
                  />
                </label>
                <label>
                  <span className="mb-2 block text-[10px] font-medium text-[var(--muted)]">경기 시간</span>
                  <input
                    className="field-input"
                    value={match.ocrEditable.match_duration}
                    disabled={match.reviewStatus === "confirmed"}
                    onChange={(event) => onUpdateOcrField({ match_duration: event.target.value })}
                    placeholder="예: 14:32"
                  />
                </label>
                <label>
                  <span className="mb-2 block text-[10px] font-medium text-[var(--muted)]">맵</span>
                  <input
                    className="field-input"
                    value={match.ocrEditable.map_name}
                    disabled={match.reviewStatus === "confirmed"}
                    onChange={(event) => onUpdateOcrField({ map_name: event.target.value })}
                    placeholder="맵 이름"
                  />
                </label>
              </div>
            )}

            {match.ocrMessage && (
              <div className="rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[10px] text-[var(--muted)]">
                {match.ocrMessage}
              </div>
            )}

            {match.reviewStatus === "pending_ocr" && (
              <MatchReviewEditor
                key={`${match.backendMatchId}:${match.ocrGeneratedAt ?? ""}`}
                matchId={match.backendMatchId}
                defaultHero={match.ocrEditable?.my_hero ?? ""}
              />
            )}

            {match.reviewStatus === "confirmed" ? (
              <div className="border-y border-[#2f4236] bg-transparent px-0 py-3 text-[11px] font-medium text-[#9fcaae]">
                OCR 검수값이 최종 저장되었습니다.
              </div>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={onRerunOcr}
                  disabled={uploadState.phase === "completing"}
                  className="cursor-pointer rounded-md border border-[var(--line)] bg-transparent px-4 py-2.5 text-[11px] font-medium text-[#c7c9ce] hover:bg-[rgba(102,169,255,0.13)] disabled:opacity-35"
                >
                  {uploadState.phase === "completing" ? "OCR 실행 중..." : "OCR 다시 실행"}
                </button>
                <button
                  type="button"
                  onClick={onConfirmOcr}
                  disabled={uploadState.phase === "completing"}
                  className="flex-1 cursor-pointer rounded-md bg-[var(--orange)] px-4 py-2.5 text-[12px] font-semibold text-[#17120d] hover:brightness-110 disabled:opacity-35"
                >
                  {uploadState.phase === "completing"
                    ? "저장 중..."
                    : currentIndex < queue.length - 1
                      ? "OCR 검수 완료 · 다음 경기 →"
                      : "OCR 검수 완료 · 전체 등록 끝"}
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function InlineMetric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="border-r border-[var(--line)] px-3 py-4 first:pl-0 last:border-r-0 md:px-5"><p className="m-0 text-[10px] text-[var(--muted)]">{label}</p><p className={`mb-0 mt-1 text-[18px] font-semibold ${accent ? "text-[var(--orange-2)]" : "text-white"}`}>{value}</p></div>;
}

function CompactStatusRow({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return <div className="flex items-center justify-between border-b border-[var(--line-soft)] py-2.5 text-[11px]"><dt className="text-[var(--muted)]">{label}</dt><dd className={`m-0 font-medium ${warning ? "text-[var(--warning)]" : "text-[#d5d6d9]"}`}>{value}</dd></div>;
}

function RuleRow({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="grid grid-cols-[28px_48px_1fr] border-b border-[var(--line-soft)] py-2.5"><span className="text-[#666a73]">{number}</span><strong className="font-medium text-[#d5d6d9]">{title}</strong><span>{text}</span></div>;
}

function OcrActivityPanel({ state }: { state: OcrActivityState }) {
  return (
    <div className="mt-4 overflow-hidden rounded-md border border-[var(--line)] bg-[#090b0e]">
      <div className="border-b border-[var(--line)] px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="m-0 text-[11px] font-semibold text-white">OCR 작업 현황</p>
            <p className="mb-0 mt-1 text-[9px] text-[var(--muted)]">{state.message || "대기 중"}</p>
          </div>
          <div className="text-right">
            <p className="m-0 text-sm font-semibold text-white">{state.percent}%</p>
            <p className="mb-0 mt-1 text-[9px] text-[var(--muted)]">
              {state.total > 0 ? `${state.current}/${state.total} 단계` : "준비 중"}
            </p>
          </div>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#1b2230]">
          <div
            className={`h-full transition-all ${state.running ? "bg-[var(--orange)]" : "bg-[#76bf8d]"}`}
            style={{ width: `${state.percent}%` }}
          />
        </div>
      </div>

      <div className="max-h-[190px] overflow-y-auto px-3 py-2 font-mono text-[9px] leading-5">
        {state.logs.map((log) => (
          <div key={log.id} className="grid grid-cols-[62px_1fr] gap-2 border-b border-[#15181d] py-1 last:border-b-0">
            <span className="text-[#596273]">{log.time}</span>
            <span
              className={
                log.level === "error"
                  ? "text-[#ff9b9b]"
                  : log.level === "success"
                    ? "text-[#9fcaae]"
                    : "text-[#b8c0cc]"
              }
            >
              {log.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorDialogModal({
  dialog,
  onClose,
}: {
  dialog: ErrorDialogState;
  onClose: () => void;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyRaw() {
    try {
      await navigator.clipboard.writeText(dialog.raw);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = dialog.raw;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={dialog.title}
        className="w-full max-w-[680px] overflow-hidden rounded-lg border border-[#583438] bg-[#101216] shadow-2xl"
      >
        <div className="border-b border-[#382528] px-5 py-4">
          <p className="m-0 text-[11px] font-medium uppercase tracking-[0.12em] text-[#ff8d8d]">ERROR</p>
          <h2 className="mb-0 mt-1 text-lg font-semibold text-white">{dialog.title}</h2>
          <p className="mb-0 mt-2 text-xs leading-5 text-[#c9b6b8]">{dialog.summary}</p>
        </div>

        {showRaw && (
          <div className="max-h-[360px] overflow-auto border-b border-[#382528] bg-[#08090b] p-4">
            <pre className="m-0 whitespace-pre-wrap break-words font-mono text-[10px] leading-5 text-[#e3e5e8]">
              {dialog.raw || "오류 원문이 없습니다."}
            </pre>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 px-5 py-4">
          <button
            type="button"
            onClick={() => setShowRaw((value) => !value)}
            className="cursor-pointer rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[10px] font-medium text-white hover:bg-[#17191e]"
          >
            {showRaw ? "오류 원문 닫기" : "오류 메시지 원문 보기"}
          </button>
          <button
            type="button"
            onClick={() => void copyRaw()}
            className="cursor-pointer rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[10px] font-medium text-white hover:bg-[#17191e]"
          >
            {copied ? "복사됨" : "오류 메시지 복사"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md bg-[#d75f5f] px-4 py-2 text-[10px] font-semibold text-white hover:brightness-110"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

function validateMatch(match: DetectedMatch) {
  const active = match.files.filter((file) => !file.excluded);
  const summaryCount = active.filter((file) => file.type === "summary").length;
  const teamCount = active.filter((file) => file.type === "team").length;
  const unknownCount = active.filter((file) => file.type === "unknown").length;
  const messages: string[] = [];
  if (summaryCount !== 1) messages.push(`요약 화면이 ${summaryCount}장입니다. 1장으로 맞춰 주세요.`);
  if (teamCount !== 1) messages.push(`팀 화면이 ${teamCount}장입니다. 1장으로 맞춰 주세요.`);
  if (unknownCount > 0) messages.push(`미분류 이미지 ${unknownCount}장의 종류를 정해 주세요.`);
  return { valid: messages.length === 0, messages };
}

function FilePreview({ file, className }: { file: File; className?: string }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!src) return <div className="h-full w-full animate-pulse bg-[#111620]" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={file.name} className={className} />;
}

function typeClass(type: ScreenType) {
  if (type === "summary") return "bg-transparent text-[var(--orange)]";
  if (type === "team") return "bg-transparent text-[#8fc1ff]";
  if (type === "personal") return "bg-transparent text-[#9fcaae]";
  if (type === "replay") return "bg-[rgba(198,145,255,0.13)] text-[#d0a9ff]";
  return "bg-[rgba(255,113,113,0.12)] text-[#ff9b9b]";
}

function TypePill({ type, count }: { type: ScreenType; count: number }) {
  return <span className={`rounded-sm px-2 py-1 text-[9px] font-medium ${typeClass(type)}`}>{TYPE_META[type].label} {count}</span>;
}

function MetricCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-md border p-4 ${accent ? "border-[rgba(249,158,26,0.35)] bg-[rgba(249,158,26,0.08)]" : "border-[var(--line)] bg-transparent"}`}>
      <p className="m-0 text-[11px] text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${accent ? "text-[var(--orange)]" : "text-white"}`}>{value}</p>
    </div>
  );
}

function GuideRow({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 font-semibold text-[var(--orange)]">{number}</span>
      <p className="m-0"><strong className="text-white">{title}</strong> · {text}</p>
    </div>
  );
}

function StatusRow({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className={`m-0 font-bold ${warning ? "text-[#ff9b9b]" : "text-white"}`}>{value}</dd>
    </div>
  );
}

function ValidationRow({ ok, text, neutral = false }: { ok: boolean; text: string; neutral?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-[1px] font-semibold ${neutral ? "text-[#9bbcff]" : ok ? "text-[#9fcaae]" : "text-[var(--orange)]"}`}>{neutral ? "•" : ok ? "✓" : "!"}</span>
      <span>{text}</span>
    </div>
  );
}

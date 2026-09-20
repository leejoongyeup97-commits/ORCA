"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { BACKEND_MODE, getMatchBackendAdapter } from "@/lib/backend";
import {
  ensureScreenshotFolderPermission,
  getSavedScreenshotFolder,
  getScreenshotAutoScanEnabled,
  pickAndSaveScreenshotFolder,
  queryScreenshotFolderPermission,
  supportsDirectoryPicker,
} from "@/lib/screenshot-folder";

type ScreenType = "summary" | "team" | "personal" | "replay" | "unknown";
type ReviewStatus = "unreviewed" | "ready_to_upload" | "uploading" | "pending_ocr";

type UploadUiState = {
  phase: "idle" | "creating" | "uploading" | "completing" | "done" | "error";
  current: number;
  total: number;
  message: string;
  matchId?: string;
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
  const autoScanStartedRef = useRef(false);

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

  async function markReady(match: DetectedMatch): Promise<boolean> {
    const validation = validateMatch(match);
    if (!validation.valid) {
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

      patchMatch(match.id, (current) => ({ ...current, reviewStatus: "pending_ocr" }));
      setUploadState({
        phase: "done",
        current: activeFiles.length,
        total: activeFiles.length,
        message: "업로드 완료 · OCR 대기 상태로 전환했습니다.",
        matchId: completed.matchId,
      });
      setReviewNotice(`Mock 백엔드 연결 완료 · match_id ${completed.matchId}`);
      return true;
    } catch (error) {
      patchMatch(match.id, (current) => ({ ...current, reviewStatus: "ready_to_upload" }));
      setUploadState({
        phase: "error",
        current: 0,
        total: activeFiles.length,
        message: error instanceof Error ? error.message : "업로드 중 오류가 발생했습니다.",
      });
      setReviewNotice("업로드에 실패했습니다. 다시 시도할 수 있습니다.");
      return false;
    }
  }

  async function completeReviewAndNext(match: DetectedMatch) {
    const currentIndex = matches.findIndex((item) => item.id === match.id);

    if (match.reviewStatus !== "pending_ocr") {
      const completed = await markReady(match);
      if (!completed) return;
    }

    const next = matches[currentIndex + 1];
    if (next) {
      selectReviewMatch(next);
      return;
    }

    setReviewNotice("이번에 발견된 모든 경기 검수가 끝났습니다.");
  }

  if (reviewingMatch) {
    const reviewIndex = matches.findIndex((match) => match.id === reviewingMatch.id);
    const reviewedCount = matches.filter((match) => match.reviewStatus === "pending_ocr").length;

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
        uploadState={uploadState}
      />
    );
  }

  return (
    <main className="min-h-screen px-5 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1240px]">

        <section className="mb-7">
          <p className="mb-2 text-sm font-semibold text-[var(--orange)]">경기 등록</p>
          <h1 className="m-0 text-3xl font-bold tracking-[-0.03em] md:text-4xl">스크린샷 폴더에서 경기를 자동으로 찾습니다</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
            설정에서 오버워치 스크린샷 폴더를 한 번 지정해두면 됩니다. 이후에는 같은 폴더에서 새 파일만 찾아 요약 화면을 기준으로 경기별로 묶습니다.
          </p>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.45fr_0.75fr]">
          <section className="space-y-5">
            <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 md:p-6">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[var(--orange-soft)] px-2.5 py-1 text-[10px] font-black text-[var(--orange)]">LOCAL AUTO IMPORT</span>
                    {folderName && <span className="text-xs text-[var(--muted)]">고정 폴더 · {folderName}</span>}
                  </div>
                  <h2 className="m-0 text-xl font-bold">새 경기 자동 분류</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">요약 → 팀 → 개인 상세 → 리플레이 순서가 섞여 있어도 화면 모양으로 구분합니다.</p>
                </div>
                <button
                  type="button"
                  disabled={status === "scanning"}
                  onClick={() => void autoClassify("manual")}
                  className="min-w-[180px] rounded-xl bg-[var(--orange)] px-6 py-3.5 text-sm font-black text-black transition enabled:cursor-pointer enabled:hover:brightness-110 disabled:cursor-wait disabled:opacity-60"
                >
                  {status === "scanning" ? "분류 중..." : "자동 분류하기"}
                </button>
              </div>

              <div className={`mt-5 rounded-xl border px-4 py-3.5 text-sm ${status === "error" ? "border-[#6b3131] bg-[#281515] text-[#ff9b9b]" : status === "done" ? "border-[rgba(121,227,156,0.25)] bg-[rgba(121,227,156,0.06)] text-[#bceacb]" : "border-[#303847] bg-[#0d1118] text-[var(--muted)]"}`}>
                {message}
              </div>

              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[var(--muted)]">
                <span>마지막 처리: <strong className="text-white">{lastProcessed || "없음"}</strong></span>
                <span>기준: <strong className="text-white">요약 화면 = 새 경기 시작</strong></span>
                {folderName && (
                  <button type="button" onClick={resetCurrentFolder} className="cursor-pointer border-0 bg-transparent p-0 text-xs text-[#9bbcff] hover:text-white">처리 기록 초기화</button>
                )}
              </div>
            </section>

            {scanSummary && (
              <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricCard label="새 이미지" value={`${scanSummary.newFiles}장`} />
                <MetricCard label="발견 경기" value={`${scanSummary.detectedMatches}건`} accent />
                <MetricCard label="중복 제외" value={`${scanSummary.skippedDuplicates}장`} />
                <MetricCard label="요약 이전" value={`${scanSummary.unclassifiedBeforeSummary}장`} />
              </section>
            )}

            {matches.length > 0 ? (
              <section className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="m-0 text-sm font-bold">이번에 발견된 경기</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">이제 경기마다 뒤로 갈 필요 없이 전체 검수에서 순서대로 확인할 수 있습니다.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--muted)]">{matches.length}건</span>
                    <button
                      type="button"
                      onClick={openBatchReview}
                      className="cursor-pointer rounded-xl bg-[var(--orange)] px-4 py-2.5 text-xs font-black text-black hover:brightness-110"
                    >
                      전체 검수 시작
                    </button>
                  </div>
                </div>

                {matches.map((match, matchIndex) => {
                  const active = match.files.filter((item) => !item.excluded);
                  const perType = {
                    summary: active.filter((item) => item.type === "summary").length,
                    team: active.filter((item) => item.type === "team").length,
                    personal: active.filter((item) => item.type === "personal").length,
                    replay: active.filter((item) => item.type === "replay").length,
                    unknown: active.filter((item) => item.type === "unknown").length,
                  };
                  const validation = validateMatch(match);
                  return (
                    <article key={match.id} className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
                      <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--orange-soft)] text-xs font-black text-[var(--orange)]">{matchIndex + 1}</span>
                            <h3 className="m-0 text-sm font-bold">{match.id}</h3>
                            {match.reviewStatus === "ready_to_upload" && (
                              <span className="rounded-full bg-[rgba(121,227,156,0.12)] px-2 py-1 text-[9px] font-black text-[#8ee9aa]">업로드 준비</span>
                            )}
                            {match.reviewStatus === "uploading" && (
                              <span className="rounded-full bg-[rgba(249,158,26,0.14)] px-2 py-1 text-[9px] font-black text-[var(--orange)]">업로드 중</span>
                            )}
                            {match.reviewStatus === "pending_ocr" && (
                              <span className="rounded-full bg-[rgba(102,169,255,0.14)] px-2 py-1 text-[9px] font-black text-[#8fc1ff]">OCR 대기</span>
                            )}
                          </div>
                          <p className="ml-9 mt-1 text-xs text-[var(--muted)]">시작 {formatDate(match.startedAt)} · 이미지 {active.length}장</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <TypePill type="summary" count={perType.summary} />
                          <TypePill type="team" count={perType.team} />
                          <TypePill type="personal" count={perType.personal} />
                          <TypePill type="replay" count={perType.replay} />
                          {perType.unknown > 0 && <TypePill type="unknown" count={perType.unknown} />}
                        </div>
                      </div>

                      <div className="divide-y divide-[var(--line)]">
                        {match.files.map((item, fileIndex) => (
                          <div key={item.id} className={`grid gap-2 px-5 py-3 text-xs sm:grid-cols-[90px_1fr_auto] sm:items-center ${item.excluded ? "opacity-45" : ""}`}>
                            <span className={`w-fit rounded-md px-2 py-1 font-black ${typeClass(item.type)}`}>{TYPE_META[item.type].label}</span>
                            <div className="min-w-0">
                              <p className={`m-0 truncate font-semibold ${item.excluded ? "line-through text-[var(--muted)]" : "text-white"}`}>{item.file.name}</p>
                              <p className="mt-1 text-[10px] text-[var(--muted)]">{formatDate(item.file.lastModified)} · {formatBytes(item.file.size)} · #{fileIndex + 1}</p>
                            </div>
                            <span className="text-[10px] text-[var(--muted)]">score {item.score.toFixed(3)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-col gap-3 border-t border-[var(--line)] bg-[#0d1118] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                        <span className={`text-xs ${validation.valid ? "text-[#8ee9aa]" : "text-[var(--muted)]"}`}>
                          {match.reviewStatus === "pending_ocr"
                            ? "Mock 업로드 완료 · OCR 대기"
                            : match.reviewStatus === "uploading"
                              ? "업로드 진행 중"
                              : match.reviewStatus === "ready_to_upload"
                                ? "업로드 준비 완료"
                                : validation.valid
                                  ? "필수 구성 확인됨 · 검수 가능"
                                  : validation.messages[0]}
                        </span>
                        <button
                          type="button"
                          onClick={() => openReview(match)}
                          className="cursor-pointer rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-xs font-bold text-white transition hover:border-[#4b5668] hover:bg-[#19202d]"
                        >
                          {match.reviewStatus === "unreviewed" ? "검수하기" : "다시 검수"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </section>
            ) : (
              <section className="rounded-2xl border border-dashed border-[#364052] bg-[#0d1118] px-6 py-12 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[#364052] bg-[var(--panel)] text-xl">⌕</div>
                <p className="m-0 text-sm font-bold">아직 분류된 경기가 없습니다</p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">설정에서 고정한 스크린샷 폴더의 새 이미지를 확인하면 여기에 경기별로 나타납니다.</p>
              </section>
            )}
          </section>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
              <p className="mb-4 text-sm font-bold">자동 분류 규칙</p>
              <div className="space-y-4 text-sm leading-6 text-[var(--muted)]">
                <GuideRow number="01" title="요약" text="새 경기의 시작점으로 사용합니다." />
                <GuideRow number="02" title="팀" text="10인 스코어보드 화면으로 분류합니다." />
                <GuideRow number="03" title="개인" text="플레이 영웅 상세 화면은 여러 장 허용합니다." />
                <GuideRow number="04" title="리플레이" text="하단 리플레이 UI를 기준으로 별도 분류합니다." />
              </div>
            </section>

            <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
              <p className="mb-4 text-sm font-bold">이번 분류 결과</p>
              <dl className="m-0 space-y-3 text-sm">
                <StatusRow label="요약" value={`${counts.summary}장`} />
                <StatusRow label="팀" value={`${counts.team}장`} />
                <StatusRow label="개인" value={`${counts.personal}장`} />
                <StatusRow label="리플레이" value={`${counts.replay}장`} />
                <StatusRow label="미분류" value={`${counts.unknown}장`} warning={counts.unknown > 0} />
              </dl>
            </section>

            <section className="rounded-2xl border border-[rgba(121,227,156,0.24)] bg-[rgba(121,227,156,0.05)] p-5">
              <p className="m-0 text-sm font-bold text-[#8ee9aa]">고정 폴더 연결 흐름</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">검수 완료 후 Mock Draft 생성 → 파일 업로드 → pending_ocr까지 진행합니다. 이후 경기 목록의 상세 화면에서 Mock OCR, 값 수정, 확정, 삭제까지 테스트할 수 있습니다.</p>
            </section>

            <section className="rounded-2xl border border-[rgba(102,169,255,0.28)] bg-[rgba(102,169,255,0.06)] p-5">
              <p className="m-0 text-sm font-bold text-[#9bc6ff]">현재 단계</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Supabase와 OCR은 아직 실제 연결하지 않습니다. 현재는 Mock Adapter로 연동 계약을 먼저 검증하고, 백엔드 완성 후 Adapter 구현만 교체합니다.</p>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function ReviewScreen({
  match,
  selectedFileId,
  notice,
  onSelectFile,
  onBack,
  onChangeType,
  onToggleExcluded,
  onMove,
  onAddFiles,
  onReady,
  uploadState,
}: {
  match: DetectedMatch;
  selectedFileId: string | null;
  notice: string;
  onSelectFile: (id: string) => void;
  onBack: () => void;
  onChangeType: (fileId: string, type: ScreenType) => void;
  onToggleExcluded: (fileId: string) => void;
  onMove: (fileId: string, direction: -1 | 1) => void;
  onAddFiles: (event: ChangeEvent<HTMLInputElement>) => void;
  onReady: () => void;
  uploadState: UploadUiState;
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
    <main className="min-h-screen px-5 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1320px]">

        <section className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <button type="button" onClick={onBack} className="mb-3 cursor-pointer border-0 bg-transparent p-0 text-xs font-bold text-[#9bbcff] hover:text-white">← 분류 결과로</button>
            <p className="mb-2 text-sm font-semibold text-[var(--orange)]">경기 검수</p>
            <h1 className="m-0 text-3xl font-bold tracking-[-0.03em]">{match.id}</h1>
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
            <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[#05070a]">
              <div className="flex min-h-[360px] items-center justify-center bg-black p-3 md:min-h-[520px]">
                {selected ? (
                  <FilePreview file={selected.file} className={`max-h-[620px] max-w-full object-contain ${selected.excluded ? "opacity-35 grayscale" : ""}`} />
                ) : (
                  <p className="text-sm text-[var(--muted)]">선택된 이미지가 없습니다.</p>
                )}
              </div>
              {selected && (
                <div className="flex flex-col gap-2 border-t border-[var(--line)] bg-[var(--panel)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="m-0 truncate text-sm font-bold">{selected.file.name}</p>
                    <p className="mt-1 text-[10px] text-[var(--muted)]">{formatDate(selected.file.lastModified)} · {formatBytes(selected.file.size)} · SHA {selected.hash.slice(0, 12)}…</p>
                  </div>
                  <span className={`w-fit rounded-md px-2.5 py-1 text-xs font-black ${typeClass(selected.type)}`}>{TYPE_META[selected.type].label}</span>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
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
                    className={`relative aspect-video cursor-pointer overflow-hidden rounded-lg border bg-black ${selected?.id === file.id ? "border-[var(--orange)]" : "border-[var(--line)]"} ${file.excluded ? "opacity-35" : ""}`}
                  >
                    <FilePreview file={file.file} className="h-full w-full object-cover" />
                    <span className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[9px] font-black ${typeClass(file.type)}`}>{index + 1} · {TYPE_META[file.type].label}</span>
                    {file.excluded && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[10px] font-black text-white">제외됨</span>}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
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
                  <div key={file.id} className={`rounded-xl border p-3 ${file.excluded ? "border-[#2a303b] bg-[#0a0d12] opacity-55" : selected?.id === file.id ? "border-[rgba(249,158,26,0.55)] bg-[rgba(249,158,26,0.05)]" : "border-[var(--line)] bg-[#0d1118]"}`}>
                    <button type="button" onClick={() => onSelectFile(file.id)} className="mb-2 flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left text-white">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#171e2a] text-[10px] font-black text-[var(--muted)]">{index + 1}</span>
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
                        className="min-w-0 rounded-lg border border-[#303847] bg-[#0a0d12] px-2.5 py-2 text-xs font-bold text-white outline-none focus:border-[var(--orange)] disabled:opacity-50"
                      >
                        {(Object.keys(TYPE_META) as ScreenType[]).map((type) => (
                          <option key={type} value={type}>{TYPE_META[type].label} · {TYPE_META[type].description}</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => onToggleExcluded(file.id)} className={`cursor-pointer rounded-lg border px-3 py-2 text-[10px] font-bold ${file.excluded ? "border-[rgba(121,227,156,0.25)] text-[#8ee9aa]" : "border-[#503336] text-[#ff9b9b]"}`}>
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

            <section className={`rounded-2xl border p-5 ${validation.valid ? "border-[rgba(121,227,156,0.28)] bg-[rgba(121,227,156,0.05)]" : "border-[rgba(249,158,26,0.28)] bg-[rgba(249,158,26,0.05)]"}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={`m-0 text-sm font-bold ${validation.valid ? "text-[#8ee9aa]" : "text-[var(--orange)]"}`}>{validation.valid ? "검수 조건 충족" : "확인할 항목이 있습니다"}</p>
                  <div className="mt-3 space-y-2 text-xs text-[var(--muted)]">
                    <ValidationRow ok={perType.summary === 1} text={`요약 ${perType.summary}장 · 정확히 1장 필요`} />
                    <ValidationRow ok={perType.team === 1} text={`팀 ${perType.team}장 · 정확히 1장 필요`} />
                    <ValidationRow ok={perType.unknown === 0} text={`미분류 ${perType.unknown}장 · 0장이어야 완료 가능`} />
                    <ValidationRow ok text={`개인 ${perType.personal}장 · 여러 장 가능`} neutral />
                    <ValidationRow ok text={`리플레이 ${perType.replay}장 · 선택`} neutral />
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${match.reviewStatus === "ready_to_upload" ? "bg-[rgba(121,227,156,0.12)] text-[#8ee9aa]" : "bg-[#171e2a] text-[var(--muted)]"}`}>
                  {match.reviewStatus === "pending_ocr" ? "PENDING OCR" : match.reviewStatus === "uploading" ? "UPLOADING" : match.reviewStatus === "ready_to_upload" ? "READY" : "REVIEW"}
                </span>
              </div>

              {notice && <div className="mt-4 rounded-lg border border-[#303847] bg-[#0a0d12] px-3 py-2.5 text-xs leading-5 text-[#c8d0dc]">{notice}</div>}

              {uploadState.phase !== "idle" && (
                <div className="mt-4 rounded-lg border border-[#303847] bg-[#0a0d12] px-3 py-3">
                  <div className="mb-2 flex items-center justify-between gap-3 text-[10px] text-[var(--muted)]">
                    <span>{uploadState.message}</span>
                    <span>{uploadState.total > 0 ? `${uploadState.current}/${uploadState.total}` : ""}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[#1b2230]">
                    <div
                      className="h-full rounded-full bg-[var(--orange)] transition-all"
                      style={{ width: `${uploadState.total > 0 ? Math.round((uploadState.current / uploadState.total) * 100) : 10}%` }}
                    />
                  </div>
                  {uploadState.matchId && <p className="mb-0 mt-2 break-all text-[9px] text-[var(--muted)]">match_id · {uploadState.matchId}</p>}
                </div>
              )}

              <button
                type="button"
                disabled={!validation.valid || uploadState.phase === "creating" || uploadState.phase === "uploading" || uploadState.phase === "completing"}
                onClick={onReady}
                className="mt-4 w-full rounded-xl bg-[var(--orange)] px-5 py-3.5 text-sm font-black text-black transition enabled:cursor-pointer enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {match.reviewStatus === "pending_ocr"
                  ? "Mock 업로드 완료"
                  : uploadState.phase === "creating" || uploadState.phase === "uploading" || uploadState.phase === "completing"
                    ? "업로드 중..."
                    : "검수 완료 · Mock 업로드"}
              </button>
              <p className="mb-0 mt-3 text-[10px] leading-4 text-[var(--muted)]">현재 백엔드 모드: <strong className="text-white">{BACKEND_MODE}</strong>. 실제 Supabase 연결 전까지 연결규격 v0.1과 동일한 Mock Adapter로 업로드 흐름을 검증합니다.</p>
            </section>
          </aside>
        </div>
      </div>
    </main>
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
  if (type === "summary") return "bg-[rgba(249,158,26,0.14)] text-[var(--orange)]";
  if (type === "team") return "bg-[rgba(102,169,255,0.14)] text-[#8fc1ff]";
  if (type === "personal") return "bg-[rgba(121,227,156,0.12)] text-[#8ee9aa]";
  if (type === "replay") return "bg-[rgba(198,145,255,0.13)] text-[#d0a9ff]";
  return "bg-[rgba(255,113,113,0.12)] text-[#ff9b9b]";
}

function TypePill({ type, count }: { type: ScreenType; count: number }) {
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${typeClass(type)}`}>{TYPE_META[type].label} {count}</span>;
}

function MetricCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${accent ? "border-[rgba(249,158,26,0.35)] bg-[rgba(249,158,26,0.08)]" : "border-[var(--line)] bg-[var(--panel)]"}`}>
      <p className="m-0 text-[11px] text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-xl font-black ${accent ? "text-[var(--orange)]" : "text-white"}`}>{value}</p>
    </div>
  );
}

function GuideRow({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 font-black text-[var(--orange)]">{number}</span>
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
      <span className={`mt-[1px] font-black ${neutral ? "text-[#9bbcff]" : ok ? "text-[#8ee9aa]" : "text-[var(--orange)]"}`}>{neutral ? "•" : ok ? "✓" : "!"}</span>
      <span>{text}</span>
    </div>
  );
}

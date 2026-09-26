"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import MatchReviewEditor from "@/components/match-review-editor";
import RoundDetailsEditor from "@/components/round-details-editor";
import MatchWorkflow from "@/components/match-workflow";
import OcrProgressPanel from "@/components/ocr-progress-panel";
import {
  removeReviewDraft,
  toConfirmHeroDetails,
  toConfirmPlayers,
  type MatchReviewDraft,
} from "@/lib/review-draft";
import { getStoredOcrBundle, type StoredOcrBundle } from "@/lib/ocr-integration";
import { normalizeSideForGameMode } from "@/lib/match-rules";
import { buildReviewChecks } from "@/lib/match-review-readiness";
import { rerunMatchOcrFromSavedFolder } from "@/lib/match-ocr-rerun";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  getMatchBackendAdapter,
  type EditableMatchFields,
  type MatchImportStatus,
  type MapSubmapOption,
  type MatchImportView,
  type MatchResult,
  type OcrExecutionProgress,
  type MatchSide,
  type RoundDetail,
} from "@/lib/backend";

const STATUS_META: Record<MatchImportStatus, { label: string; className: string }> = {
  awaiting_upload: { label: "업로드 대기", className: "bg-[rgba(249,158,26,0.12)] text-[var(--orange)]" },
  pending_ocr: { label: "OCR 대기", className: "bg-[rgba(102,169,255,0.14)] text-[#8fc1ff]" },
  processing_ocr: { label: "OCR 처리 중", className: "bg-[rgba(198,145,255,0.13)] text-[#d0a9ff]" },
  needs_review: { label: "검수 필요", className: "bg-[rgba(255,184,92,0.14)] text-[#ffc779]" },
  confirmed: { label: "확정 완료", className: "bg-[rgba(121,227,156,0.12)] text-[#8ee9aa]" },
  failed: { label: "오류", className: "bg-[rgba(255,113,113,0.12)] text-[#ff9b9b]" },
};

const RESULT_LABELS: Record<MatchResult, string> = {
  win: "승리",
  loss: "패배",
  draw: "무승부",
  unknown: "미확인",
};

function toLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDateTime(value: string, fallback: string) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function referenceGameMode(value: string): "control" | "flashpoint" | null {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("control") || normalized.includes("쟁탈")) return "control";
  if (normalized.includes("flashpoint") || normalized.includes("플래시포인트")) return "flashpoint";
  return null;
}

export default function MatchDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawId = params?.id;
  const matchId = Array.isArray(rawId) ? rawId[0] : rawId;

  const [match, setMatch] = useState<MatchImportView | null>(null);
  const [form, setForm] = useState<EditableMatchFields | null>(null);
  const [playedAtLocal, setPlayedAtLocal] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "ocr" | "confirm" | "delete" | "review" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [reviewDraft, setReviewDraft] = useState<MatchReviewDraft | null>(null);
  const [ocrBundle, setOcrBundle] = useState<StoredOcrBundle | null>(null);
  const [ocrProgress, setOcrProgress] = useState<OcrExecutionProgress | null>(null);
  const [roundDetails, setRoundDetails] = useState<RoundDetail[]>([]);
  const [submapOptions, setSubmapOptions] = useState<MapSubmapOption[]>([]);
  const [submapLoading, setSubmapLoading] = useState(false);
  const [pendingDeleteUntil, setPendingDeleteUntil] = useState<number | null>(null);
  const deleteTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!matchId) return;
    let mounted = true;
    getMatchBackendAdapter()
      .getMatchImport(matchId)
      .then((item) => {
        if (!mounted) return;
        setMatch(item);
        setForm(item.editable);
        setPlayedAtLocal(toLocalDateTime(item.editable.played_at));
      })
      .catch(() => {
        if (mounted) setError("경기를 찾지 못했습니다.");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;
    setOcrBundle(getStoredOcrBundle(matchId));
  }, [matchId, match?.ocr.generated_at]);

  useEffect(() => {
    if (!matchId) return;
    let mounted = true;
    getMatchBackendAdapter()
      .getRoundDetails(matchId)
      .then((rounds) => {
        if (mounted) setRoundDetails(rounds);
      })
      .catch(() => {
        if (mounted) setRoundDetails([]);
      });
    return () => {
      mounted = false;
    };
  }, [matchId]);

  useEffect(() => {
    const mode = referenceGameMode(form?.game_mode ?? "");
    const mapName = form?.map_name.trim() ?? "";
    if (!mode || !mapName) {
      setSubmapOptions([]);
      setSubmapLoading(false);
      return;
    }

    let mounted = true;
    setSubmapLoading(true);
    getMatchBackendAdapter()
      .listMapSubmaps(mapName, mode)
      .then((items) => {
        if (mounted) setSubmapOptions(items);
      })
      .catch(() => {
        if (mounted) setSubmapOptions([]);
      })
      .finally(() => {
        if (mounted) setSubmapLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [form?.game_mode, form?.map_name]);

  useEffect(() => {
    return () => {
      if (deleteTimerRef.current !== null) {
        window.clearTimeout(deleteTimerRef.current);
      }
    };
  }, []);

  const counts = useMemo(() => {
    if (!match) return { summary: 0, team: 0, personal: 0, replay: 0, unknown: 0 };
    return {
      summary: match.files.filter((file) => file.screen_type === "summary").length,
      team: match.files.filter((file) => file.screen_type === "team").length,
      personal: match.files.filter((file) => file.screen_type === "personal").length,
      replay: match.files.filter((file) => file.screen_type === "replay").length,
      unknown: match.files.filter((file) => file.screen_type === "unknown").length,
    };
  }, [match]);

  async function saveFields(event?: FormEvent) {
    event?.preventDefault();
    if (!match || !form) return null;
    setBusy("save");
    setNotice("");
    const patch: EditableMatchFields = {
      ...form,
      side: normalizeSideForGameMode(form.game_mode, form.side),
      played_at: fromLocalDateTime(playedAtLocal, match.editable.played_at),
    };
    try {
      const updated = await getMatchBackendAdapter().updateMatchImport(match.match_id, patch);
      setMatch(updated);
      setForm(updated.editable);
      setPlayedAtLocal(toLocalDateTime(updated.editable.played_at));
      setNotice("수정 내용을 저장했습니다.");
      return updated;
    } catch {
      setNotice("저장에 실패했습니다.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function confirmMatch() {
    if (!match || !form) return;
    setBusy("confirm");
    setNotice("");
    try {
      const saved = await getMatchBackendAdapter().updateMatchImport(match.match_id, {
        ...form,
        side: normalizeSideForGameMode(form.game_mode, form.side),
        played_at: fromLocalDateTime(playedAtLocal, match.editable.played_at),
      });
      await getMatchBackendAdapter().confirmMatch({
        contract_version: "0.1",
        match_id: match.match_id,
        match: saved.editable,
        players: reviewDraft ? toConfirmPlayers(reviewDraft) : [],
        my_hero_details: reviewDraft ? toConfirmHeroDetails(reviewDraft) : [],
        manual_fields: {
          control_submap: saved.editable.control_submap,
          round_sequence: saved.editable.round_sequence,
          notes: saved.editable.notes,
          round_details: roundDetails.filter((round) => round.submap.trim()),
        },
      });
      const confirmed = await getMatchBackendAdapter().getMatchImport(match.match_id);
      setMatch(confirmed);
      setForm(confirmed.editable);
      setNotice("경기 검수를 확정했습니다.");
    } catch {
      setNotice("경기 확정에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function reopenReview() {
    if (!match) return;
    setBusy("review");
    try {
      const updated = await getMatchBackendAdapter().resetMatchReview(match.match_id);
      setMatch(updated);
      setForm(updated.editable);
      setNotice("다시 검수할 수 있도록 상태를 변경했습니다.");
    } catch {
      setNotice("상태 변경에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  async function executeOcrRerun(onlyFilenames?: string[]) {
    if (!match) return;

    setBusy("ocr");
    setNotice("");
    setOcrProgress(null);

    try {
      const updated = await rerunMatchOcrFromSavedFolder(
        getMatchBackendAdapter(),
        match,
        {
          onlyFilenames,
          mergeWithExisting: Boolean(onlyFilenames?.length),
          onProgress: setOcrProgress,
        },
      );

      setMatch(updated);
      setForm(updated.editable);
      setPlayedAtLocal(toLocalDateTime(updated.editable.played_at));
      setOcrBundle(getStoredOcrBundle(match.match_id));
      setNotice(
        onlyFilenames?.length
          ? `선택한 파일 OCR을 다시 실행했습니다: ${onlyFilenames[0]}`
          : "실제 OCR을 다시 실행했습니다.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "OCR 재실행에 실패했습니다.";
      setOcrProgress((previous) => ({
        stage: "file_error",
        current: previous?.current ?? 0,
        total: previous?.total ?? Math.max(1, onlyFilenames?.length ?? match.files.length),
        percent: previous?.percent ?? 0,
        success_count: previous?.success_count ?? 0,
        error_count: Math.max(1, previous?.error_count ?? 0),
        message,
        filename: previous?.filename ?? onlyFilenames?.[0],
        screen_type: previous?.screen_type,
      }));
      setNotice(message);
    } finally {
      setBusy(null);
    }
  }

  async function rerunOcr() {
    await executeOcrRerun();
  }

  async function retryOcrFile(filename: string) {
    await executeOcrRerun([filename]);
  }

  async function performDelete() {
    if (!match) return;
    setPendingDeleteUntil(null);
    setBusy("delete");
    try {
      await getMatchBackendAdapter().deleteMatchImport(match.match_id);
      removeReviewDraft(match.match_id);
      router.push("/matches");
      router.refresh();
    } catch {
      setNotice("삭제에 실패했습니다.");
      setBusy(null);
    }
  }

  function requestDelete() {
    if (!match || pendingDeleteUntil !== null) return;
    const ok = window.confirm("이 경기를 삭제할까요? 5초 동안 실행 취소할 수 있습니다.");
    if (!ok) return;

    const until = Date.now() + 5000;
    setPendingDeleteUntil(until);
    setNotice("5초 후 경기를 삭제합니다. 취소하려면 ‘삭제 취소’를 누르세요.");
    deleteTimerRef.current = window.setTimeout(() => {
      deleteTimerRef.current = null;
      void performDelete();
    }, 5000);
  }

  function undoDelete() {
    if (deleteTimerRef.current !== null) {
      window.clearTimeout(deleteTimerRef.current);
      deleteTimerRef.current = null;
    }
    setPendingDeleteUntil(null);
    setNotice("삭제를 취소했습니다.");
  }

  if (loading) {
    return <main className="min-h-screen px-5 py-16 text-center text-sm text-[var(--muted)]">경기 정보를 불러오는 중...</main>;
  }

  if (error || !match || !form) {
    return (
      <main className="min-h-screen px-5 py-16">
        <div className="mx-auto max-w-xl rounded-md border border-[var(--line)] bg-transparent p-8 text-center">
          <p className="m-0 text-sm font-bold text-white">{error || "경기를 찾지 못했습니다."}</p>
          <Link href="/matches" className="mt-4 inline-block text-xs font-bold text-[#aeb4bf] no-underline hover:text-white">← 경기 목록으로</Link>
        </div>
      </main>
    );
  }

  const statusMeta = STATUS_META[match.status];
  const canConfirm = match.status === "needs_review";
  const isConfirmed = match.status === "confirmed";
  const canRerunOcr = ["pending_ocr", "needs_review", "failed"].includes(match.status);
  const reviewChecks = buildReviewChecks(match, reviewDraft, roundDetails);
  const reviewReadyCount = reviewChecks.filter((check) => check.ok).length;
  const reviewReady = reviewChecks.length > 0 && reviewReadyCount === reviewChecks.length;

  return (
    <main className="min-h-screen px-4 py-7 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1320px]">
        <section className="mb-6 border-b border-[var(--line)] pb-6">
          <Link href="/matches" className="mb-3 inline-block text-xs font-bold text-[#aeb4bf] no-underline hover:text-white">← 경기 목록으로</Link>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="m-0 text-sm font-semibold text-[var(--orange)]">경기 상세</p>
                <span className={`rounded-md px-2 py-1 text-[11px] font-semibold ${statusMeta.className}`}>
                  {match.status === "needs_review" && reviewReady ? "확정 가능" : statusMeta.label}
                </span>
              </div>
              <h1 className="m-0 break-all text-2xl font-bold tracking-[-0.03em] md:text-3xl">{match.match_id}</h1>
              <p className="mt-2 text-xs text-[var(--muted)]">등록 {formatDate(match.detected_at)} · 이미지 {match.files.length}장</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {canRerunOcr && (
                <button type="button" disabled={busy !== null} onClick={rerunOcr} className="cursor-pointer rounded-md border border-[rgba(102,169,255,0.35)] bg-[rgba(102,169,255,0.08)] px-4 py-2.5 text-xs font-bold text-[#aeb4bf] disabled:opacity-40">
                  {busy === "ocr" ? "OCR 실행 중..." : "OCR 다시 실행"}
                </button>
              )}
              {canConfirm && (
                <button type="button" disabled={busy !== null} onClick={confirmMatch} className="app-orange-button cursor-pointer">
                  {busy === "confirm" ? "확정 중..." : reviewReady ? "검수 확정" : `검수 확정 · ${reviewReadyCount}/${reviewChecks.length}`}
                </button>
              )}
              {isConfirmed && (
                <button type="button" disabled={busy !== null} onClick={reopenReview} className="cursor-pointer rounded-md border border-[var(--line)] bg-transparent px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">
                  다시 검수
                </button>
              )}
              {pendingDeleteUntil !== null ? (
                <button type="button" onClick={undoDelete} className="app-danger-button cursor-pointer">
                  삭제 취소
                </button>
              ) : (
                <button type="button" disabled={busy !== null} onClick={requestDelete} className="app-danger-button cursor-pointer">
                  {busy === "delete" ? "삭제 중..." : "삭제"}
                </button>
              )}
            </div>
          </div>
        </section>

        <MatchWorkflow status={match.status} />

        {notice && (
          <div className="mb-5 rounded-md border border-[#303847] bg-transparent px-4 py-3 text-xs leading-5 text-[#c8d0dc]">{notice}</div>
        )}

        {ocrProgress && (
          <OcrProgressPanel progress={ocrProgress} running={busy === "ocr"} />
        )}

        <section className="mb-7 grid grid-cols-2 border-b border-[var(--line)] md:grid-cols-5">
          <CountCard label="요약" value={counts.summary} />
          <CountCard label="팀" value={counts.team} />
          <CountCard label="개인" value={counts.personal} />
          <CountCard label="리플레이" value={counts.replay} />
          <CountCard label="미분류" value={counts.unknown} warning={counts.unknown > 0} />
        </section>

        <div className="grid gap-8 xl:grid-cols-[1fr_300px]">
          <section className="space-y-8">
            <form onSubmit={saveFields} className="border-t border-[var(--line)] pt-4">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="m-0 text-sm font-bold">경기 정보 수정</p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">OCR 결과가 들어오면 이 값을 검수하고 수정합니다.</p>
                </div>
                <button type="submit" disabled={busy !== null} className="cursor-pointer rounded-lg border border-[var(--line)] bg-transparent px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40">
                  {busy === "save" ? "저장 중..." : "수정 저장"}
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="플레이 시간" changed={playedAtLocal !== toLocalDateTime(match.editable.played_at)}>
                  <input value={playedAtLocal} onChange={(e) => setPlayedAtLocal(e.target.value)} type="datetime-local" className="field-input" />
                </Field>
                <Field label="맵" changed={form.map_name !== match.editable.map_name}>
                  <input value={form.map_name} onChange={(e) => setForm({ ...form, map_name: e.target.value })} placeholder="예: 왕의 길" className="field-input" />
                </Field>
                <Field label="게임 모드" changed={form.game_mode !== match.editable.game_mode}>
                  <input
                    value={form.game_mode}
                    onChange={(e) => {
                      const gameMode = e.target.value;
                      setForm({
                        ...form,
                        game_mode: gameMode,
                        side: normalizeSideForGameMode(gameMode, form.side),
                      });
                    }}
                    placeholder="예: 경쟁전 · 호위"
                    className="field-input"
                  />
                </Field>
                <Field label="결과" changed={form.result !== match.editable.result}>
                  <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value as MatchResult })} className="field-input">
                    {(Object.keys(RESULT_LABELS) as MatchResult[]).map((result) => <option key={result} value={result}>{RESULT_LABELS[result]}</option>)}
                  </select>
                </Field>
                <Field label="시즌 · 자동 판별">
                  <input value={form.season} readOnly placeholder="DB에서 경기 시간 기준 자동 판별" className="field-input cursor-default text-[var(--muted)]" />
                </Field>
                <Field label="패치 · 자동 판별">
                  <input value={form.patch_label} readOnly placeholder="DB에서 경기 시간 기준 자동 판별" className="field-input cursor-default text-[var(--muted)]" />
                </Field>
                <Field label="공격 / 수비" changed={form.side !== match.editable.side}>
                  <select
                    value={normalizeSideForGameMode(form.game_mode, form.side)}
                    disabled={normalizeSideForGameMode(form.game_mode, form.side) === "neutral"}
                    onChange={(e) => setForm({ ...form, side: e.target.value as MatchSide })}
                    className="field-input disabled:cursor-not-allowed disabled:opacity-65"
                  >
                    <option value="unknown">미확인</option>
                    <option value="attack">선공</option>
                    <option value="defense">선수비</option>
                    <option value="neutral">해당 없음</option>
                  </select>
                </Field>
                <Field label="쟁탈 세부 맵" changed={form.control_submap !== match.editable.control_submap}>
                  <input value={form.control_submap} onChange={(e) => setForm({ ...form, control_submap: e.target.value })} placeholder="예: 부산 · 시내" className="field-input" />
                </Field>
                <Field label="세트 진행 순서" changed={form.round_sequence !== match.editable.round_sequence}>
                  <input value={form.round_sequence} onChange={(e) => setForm({ ...form, round_sequence: e.target.value })} placeholder="예: 승 → 패 → 승" className="field-input" />
                </Field>
                <Field label="경기 시간" changed={form.match_duration !== match.editable.match_duration}>
                  <input value={form.match_duration} onChange={(e) => setForm({ ...form, match_duration: e.target.value })} placeholder="예: 14:32" className="field-input" />
                </Field>
                <Field label="메모" wide changed={form.notes !== match.editable.notes}>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="특이사항이나 수동 메모" rows={4} className="field-input resize-y" />
                </Field>
              </div>
            </form>

            <RoundDetailsEditor
              rounds={roundDetails}
              submaps={submapOptions}
              loading={submapLoading}
              enabled={referenceGameMode(form.game_mode) !== null}
              onChange={setRoundDetails}
            />

            <MatchReviewEditor
              key={match.ocr.generated_at ?? match.match_id}
              matchId={match.match_id}
              defaultHero={match.editable.my_hero}
              onChange={setReviewDraft}
            />

            {ocrBundle && (
              <section className="overflow-hidden border-t border-[var(--line)]">
                <div className="border-b border-[var(--line)] px-5 py-4">
                  <p className="m-0 text-sm font-bold">실제 OCR 처리 결과</p>
                  <p className="mt-1 text-[11px] text-[var(--muted)]">
                    Python OCR 서버가 처리한 파일별 성공/실패 상태입니다.
                  </p>
                </div>
                <div className="divide-y divide-[var(--line)]">
                  {ocrBundle.files.map((file, index) => (
                    <div key={`${file.filename}-${index}`} className="grid gap-2 px-5 py-3 text-xs sm:grid-cols-[80px_1fr_auto_auto] sm:items-center">
                      <span className="w-fit rounded-md bg-[#171e2a] px-2 py-1 text-[11px] font-semibold text-white">{file.screen_type}</span>
                      <div className="min-w-0">
                        <p className="m-0 truncate font-bold text-white">{file.filename}</p>
                        {!file.ok && file.error && <p className="mt-1 truncate text-[11px] text-[#ff9b9b]">{file.error}</p>}
                      </div>
                      <span className={`text-[11px] font-semibold ${file.ok ? "text-[#8ee9aa]" : "text-[#ff9b9b]"}`}>
                        {file.ok ? "OCR 성공" : "OCR 실패"}
                      </span>
                      {!file.ok && (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void retryOcrFile(file.filename)}
                          className="app-secondary-button cursor-pointer"
                        >
                          이 파일만 재시도
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="overflow-hidden border-t border-[var(--line)]">
              <div className="border-b border-[var(--line)] px-5 py-4">
                <p className="m-0 text-sm font-bold">스크린샷 메타데이터</p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">현재는 원본 이미지를 영구 저장하지 않고, 등록 시 OCR 서버에 전달한 뒤 파일 메타데이터를 유지합니다.</p>
              </div>
              <div className="divide-y divide-[var(--line)]">
                {match.files.map((file, index) => (
                  <div key={file.client_file_id} className="grid gap-2 px-5 py-3 text-xs sm:grid-cols-[42px_90px_1fr_auto] sm:items-center">
                    <span className="text-[11px] font-semibold text-[var(--muted)]">#{index + 1}</span>
                    <span className="w-fit rounded-md bg-[#171e2a] px-2 py-1 text-[11px] font-semibold text-white">{file.screen_type}</span>
                    <div className="min-w-0">
                      <p className="m-0 truncate font-bold text-white">{file.original_name}</p>
                      <p className="mt-1 truncate text-[11px] text-[var(--muted)]">SHA {file.sha256.slice(0, 16)}…</p>
                    </div>
                    <span className="text-[11px] text-[var(--muted)]">{Math.max(1, Math.round(file.size_bytes / 1024))} KB</span>
                  </div>
                ))}
              </div>
            </section>
          </section>

          <aside className="space-y-8">
            <section className="border-t border-[var(--line)] pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="m-0 text-[15px] font-semibold text-white">확정 준비</p>
                <span className={`text-[12px] font-semibold ${reviewReady ? "text-[#9fcaae]" : "text-[var(--muted)]"}`}>
                  {reviewReadyCount} / {reviewChecks.length}
                </span>
              </div>
              <div className="mt-3 border-t border-[var(--line-soft)]">
                {reviewChecks.map((check) => (
                  <div key={check.key} className="flex items-center justify-between gap-3 border-b border-[var(--line-soft)] py-2.5 text-[12px]">
                    <span className="text-[#c7c9ce]">{check.label}</span>
                    <span className={check.ok ? "font-semibold text-[#9fcaae]" : "font-medium text-[var(--warning)]"}>
                      {check.ok ? "완료" : "확인 필요"}
                    </span>
                  </div>
                ))}
              </div>
              {!reviewReady && (
                <p className="mt-3 text-[11px] leading-5 text-[var(--muted)]">
                  기존 기능을 막지는 않습니다. 다만 위 항목을 모두 확인한 뒤 확정하는 것을 권장합니다.
                </p>
              )}
            </section>

            <section className="border-t border-[var(--line)] pt-4">
              <p className="m-0 text-sm font-bold text-[#aeb4bf]">OCR 결과</p>
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                {match.ocr.message || "아직 OCR 결과가 없습니다."}
              </p>
              <dl className="mt-4 space-y-2 text-xs">
                <InfoRow label="생성 시간" value={match.ocr.generated_at ? formatDate(match.ocr.generated_at) : "-"} />
                <InfoRow label="신뢰도" value={match.ocr.overall_confidence === null ? "-" : `${Math.round(match.ocr.overall_confidence * 100)}%`} />
              </dl>
            </section>

            <section className="border-t border-[var(--line)] pt-4">
              <p className="m-0 text-sm font-bold">현재 값 요약</p>
              <dl className="mt-4 space-y-3 text-xs">
                <InfoRow label="맵" value={form.map_name || "미확인"} />
                <InfoRow label="모드" value={form.game_mode || "미확인"} />
                <InfoRow label="결과" value={RESULT_LABELS[form.result]} />
                <InfoRow label="시즌" value={form.season || "미확인"} />
                <InfoRow label="패치" value={form.patch_label || "미확인"} />
                <InfoRow label="공수" value={form.side === "attack" ? "선공" : form.side === "defense" ? "선수비" : form.side === "neutral" ? "해당 없음" : "미확인"} />
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
  wide = false,
  changed = false,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
  changed?: boolean;
}) {
  return (
    <label className={wide ? "md:col-span-2" : ""}>
      <span className="mb-2 flex items-center gap-2 text-[12px] font-medium text-[var(--muted)]">
        {label}
        {changed && <span className="text-[11px] font-medium text-[var(--orange-2)]">수정됨</span>}
      </span>
      {children}
    </label>
  );
}

function CountCard({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-transparent p-4">
      <p className="m-0 text-[11px] text-[var(--muted)]">{label}</p>
      <p className={`mb-0 mt-1 text-xl font-semibold ${warning ? "text-[#ff9b9b]" : "text-white"}`}>{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="m-0 text-right font-bold text-white">{value}</dd>
    </div>
  );
}



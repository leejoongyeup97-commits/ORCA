"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import MatchReviewEditor from "@/components/match-review-editor";
import { removeReviewDraft, type MatchReviewDraft } from "@/lib/review-draft";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  getMatchBackendAdapter,
  type EditableMatchFields,
  type MatchImportStatus,
  type MatchImportView,
  type MatchResult,
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

  async function runOcr() {
    if (!match) return;
    setBusy("ocr");
    setNotice("Mock OCR을 실행하고 있습니다...");
    try {
      const updated = await getMatchBackendAdapter().runMockOcr(match.match_id);
      setMatch(updated);
      setForm(updated.editable);
      setPlayedAtLocal(toLocalDateTime(updated.editable.played_at));
      setNotice("Mock OCR 결과를 만들었습니다. 실제 이미지 인식값이 아니라 검수 화면 테스트용 빈 결과입니다.");
    } catch {
      setNotice("Mock OCR 처리에 실패했습니다.");
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
        played_at: fromLocalDateTime(playedAtLocal, match.editable.played_at),
      });
      await getMatchBackendAdapter().confirmMatch({
        contract_version: "0.1",
        match_id: match.match_id,
        match: saved.editable,
        players: reviewDraft?.players ?? [],
        my_hero_details: reviewDraft?.hero_details ?? [],
        manual_fields: {},
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

  async function deleteMatch() {
    if (!match) return;
    const ok = window.confirm("이 경기를 삭제할까요? Mock 데이터에서 완전히 제거됩니다.");
    if (!ok) return;
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

  if (loading) {
    return <main className="min-h-screen px-5 py-16 text-center text-sm text-[var(--muted)]">경기 정보를 불러오는 중...</main>;
  }

  if (error || !match || !form) {
    return (
      <main className="min-h-screen px-5 py-16">
        <div className="mx-auto max-w-xl rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-8 text-center">
          <p className="m-0 text-sm font-bold text-white">{error || "경기를 찾지 못했습니다."}</p>
          <Link href="/matches" className="mt-4 inline-block text-xs font-bold text-[#9bbcff] no-underline hover:text-white">← 경기 목록으로</Link>
        </div>
      </main>
    );
  }

  const statusMeta = STATUS_META[match.status];
  const canRunOcr = match.status === "pending_ocr" || match.status === "failed";
  const canConfirm = match.status === "needs_review";
  const isConfirmed = match.status === "confirmed";

  return (
    <main className="min-h-screen px-5 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1240px]">
        <section className="mb-6">
          <Link href="/matches" className="mb-3 inline-block text-xs font-bold text-[#9bbcff] no-underline hover:text-white">← 경기 목록으로</Link>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="m-0 text-sm font-semibold text-[var(--orange)]">경기 상세</p>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${statusMeta.className}`}>{statusMeta.label}</span>
              </div>
              <h1 className="m-0 break-all text-2xl font-bold tracking-[-0.03em] md:text-3xl">{match.match_id}</h1>
              <p className="mt-2 text-xs text-[var(--muted)]">등록 {formatDate(match.detected_at)} · 이미지 {match.files.length}장</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {canRunOcr && (
                <button type="button" disabled={busy !== null} onClick={runOcr} className="cursor-pointer rounded-xl bg-[#66a9ff] px-4 py-2.5 text-xs font-black text-black disabled:opacity-40">
                  {busy === "ocr" ? "OCR 처리 중..." : "Mock OCR 실행"}
                </button>
              )}
              {canConfirm && (
                <button type="button" disabled={busy !== null} onClick={confirmMatch} className="cursor-pointer rounded-xl bg-[var(--orange)] px-4 py-2.5 text-xs font-black text-black disabled:opacity-40">
                  {busy === "confirm" ? "확정 중..." : "검수 확정"}
                </button>
              )}
              {isConfirmed && (
                <button type="button" disabled={busy !== null} onClick={reopenReview} className="cursor-pointer rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">
                  다시 검수
                </button>
              )}
              <button type="button" disabled={busy !== null} onClick={deleteMatch} className="cursor-pointer rounded-xl border border-[#543237] bg-[#241216] px-4 py-2.5 text-xs font-bold text-[#ff9b9b] disabled:opacity-40">
                {busy === "delete" ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </section>

        {notice && (
          <div className="mb-5 rounded-xl border border-[#303847] bg-[#0d1118] px-4 py-3 text-xs leading-5 text-[#c8d0dc]">{notice}</div>
        )}

        <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <CountCard label="요약" value={counts.summary} />
          <CountCard label="팀" value={counts.team} />
          <CountCard label="개인" value={counts.personal} />
          <CountCard label="리플레이" value={counts.replay} />
          <CountCard label="미분류" value={counts.unknown} warning={counts.unknown > 0} />
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-5">
            <form onSubmit={saveFields} className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 md:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <p className="m-0 text-sm font-bold">경기 정보 수정</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">OCR 결과가 들어오면 이 값을 검수하고 수정합니다.</p>
                </div>
                <button type="submit" disabled={busy !== null} className="cursor-pointer rounded-lg border border-[var(--line)] bg-[#0d1118] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-40">
                  {busy === "save" ? "저장 중..." : "수정 저장"}
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="플레이 시간">
                  <input value={playedAtLocal} onChange={(e) => setPlayedAtLocal(e.target.value)} type="datetime-local" className="field-input" />
                </Field>
                <Field label="맵">
                  <input value={form.map_name} onChange={(e) => setForm({ ...form, map_name: e.target.value })} placeholder="예: 왕의 길" className="field-input" />
                </Field>
                <Field label="게임 모드">
                  <input value={form.game_mode} onChange={(e) => setForm({ ...form, game_mode: e.target.value })} placeholder="예: 경쟁전 · 호위" className="field-input" />
                </Field>
                <Field label="결과">
                  <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value as MatchResult })} className="field-input">
                    {(Object.keys(RESULT_LABELS) as MatchResult[]).map((result) => <option key={result} value={result}>{RESULT_LABELS[result]}</option>)}
                  </select>
                </Field>
                <Field label="내 주 영웅">
                  <input value={form.my_hero} onChange={(e) => setForm({ ...form, my_hero: e.target.value })} placeholder="예: 리퍼" className="field-input" />
                </Field>
                <Field label="메모" wide>
                  <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="특이사항이나 수동 메모" rows={4} className="field-input resize-y" />
                </Field>
              </div>
            </form>

            <MatchReviewEditor
              matchId={match.match_id}
              defaultHero={match.editable.my_hero}
              onChange={setReviewDraft}
            />

            <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
              <div className="border-b border-[var(--line)] px-5 py-4">
                <p className="m-0 text-sm font-bold">스크린샷 메타데이터</p>
                <p className="mt-1 text-[10px] text-[var(--muted)]">Mock 단계에서는 원본 이미지 자체는 저장하지 않고 파일 정보만 유지합니다.</p>
              </div>
              <div className="divide-y divide-[var(--line)]">
                {match.files.map((file, index) => (
                  <div key={file.client_file_id} className="grid gap-2 px-5 py-3 text-xs sm:grid-cols-[42px_90px_1fr_auto] sm:items-center">
                    <span className="text-[10px] font-black text-[var(--muted)]">#{index + 1}</span>
                    <span className="w-fit rounded-md bg-[#171e2a] px-2 py-1 text-[10px] font-black text-white">{file.screen_type}</span>
                    <div className="min-w-0">
                      <p className="m-0 truncate font-bold text-white">{file.original_name}</p>
                      <p className="mt-1 truncate text-[9px] text-[var(--muted)]">SHA {file.sha256.slice(0, 16)}…</p>
                    </div>
                    <span className="text-[10px] text-[var(--muted)]">{Math.max(1, Math.round(file.size_bytes / 1024))} KB</span>
                  </div>
                ))}
              </div>
            </section>
          </section>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
              <p className="m-0 text-sm font-bold">OCR / 검수 흐름</p>
              <div className="mt-4 space-y-3">
                <Step active={match.status === "pending_ocr"} done={!["awaiting_upload", "pending_ocr"].includes(match.status)} number="1" title="OCR 대기" />
                <Step active={match.status === "processing_ocr"} done={["needs_review", "confirmed"].includes(match.status)} number="2" title="OCR 처리" />
                <Step active={match.status === "needs_review"} done={match.status === "confirmed"} number="3" title="사용자 검수" />
                <Step active={match.status === "confirmed"} done={match.status === "confirmed"} number="4" title="확정 완료" />
              </div>
            </section>

            <section className="rounded-2xl border border-[rgba(102,169,255,0.25)] bg-[rgba(102,169,255,0.06)] p-5">
              <p className="m-0 text-sm font-bold text-[#9bc6ff]">OCR 결과</p>
              <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                {match.ocr.message || "아직 OCR 결과가 없습니다."}
              </p>
              <dl className="mt-4 space-y-2 text-xs">
                <InfoRow label="생성 시간" value={match.ocr.generated_at ? formatDate(match.ocr.generated_at) : "-"} />
                <InfoRow label="신뢰도" value={match.ocr.overall_confidence === null ? "-" : `${Math.round(match.ocr.overall_confidence * 100)}%`} />
              </dl>
            </section>

            <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
              <p className="m-0 text-sm font-bold">현재 값 요약</p>
              <dl className="mt-4 space-y-3 text-xs">
                <InfoRow label="맵" value={form.map_name || "미확인"} />
                <InfoRow label="모드" value={form.game_mode || "미확인"} />
                <InfoRow label="결과" value={RESULT_LABELS[form.result]} />
                <InfoRow label="영웅" value={form.my_hero || "미확인"} />
              </dl>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={wide ? "md:col-span-2" : ""}>
      <span className="mb-2 block text-[11px] font-bold text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

function CountCard({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <p className="m-0 text-[10px] text-[var(--muted)]">{label}</p>
      <p className={`mb-0 mt-1 text-xl font-black ${warning ? "text-[#ff9b9b]" : "text-white"}`}>{value}</p>
    </div>
  );
}

function Step({ number, title, active, done }: { number: string; title: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-3 ${active ? "border-[rgba(249,158,26,0.4)] bg-[var(--orange-soft)]" : "border-[var(--line)] bg-[#0d1118]"}`}>
      <span className={`flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-black ${done ? "bg-[rgba(121,227,156,0.13)] text-[#8ee9aa]" : active ? "bg-[var(--orange)] text-black" : "bg-[#171e2a] text-[var(--muted)]"}`}>
        {done ? "✓" : number}
      </span>
      <span className={`text-xs font-bold ${active ? "text-white" : "text-[var(--muted)]"}`}>{title}</span>
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

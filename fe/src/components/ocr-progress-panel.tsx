import type { OcrExecutionProgress } from "@/lib/backend";

export default function OcrProgressPanel({
  progress,
  running,
}: {
  progress: OcrExecutionProgress;
  running: boolean;
}) {
  const activeNumber =
    progress.stage === "file_start"
      ? Math.min(progress.total, progress.current + 1)
      : Math.min(progress.total, progress.current);
  const remaining = Math.max(
    0,
    progress.total - progress.success_count - progress.error_count,
  );
  const failed = progress.stage === "file_error";
  const complete = progress.stage === "completed";

  return (
    <section className="mb-7 border-y border-[var(--line)] py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="m-0 text-[15px] font-semibold text-white">
              {running ? "OCR 다시 실행 중" : failed ? "OCR 재실행 중단" : "OCR 재실행 결과"}
            </h2>
            {running && <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--orange)]" />}
          </div>
          <p className="mt-1 text-[12px] leading-5 text-[var(--muted)]">{progress.message}</p>
        </div>
        <div className="text-right">
          <p className="m-0 text-[15px] font-semibold text-white">{activeNumber} / {progress.total}</p>
          <p className="mt-1 text-[12px] text-[var(--muted)]">{progress.percent}%</p>
        </div>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#1b1d21]">
        <div
          className="h-full bg-[var(--orange)] transition-[width] duration-300"
          style={{ width: `${progress.percent}%` }}
        />
      </div>

      {(progress.filename || progress.screen_type) && (
        <div className="mt-4 grid gap-1 text-[12px] sm:grid-cols-[120px_1fr]">
          <span className="text-[var(--muted)]">현재 처리</span>
          <span className="min-w-0 truncate text-[#d7d9dd]">
            {progress.screen_type ? `${progress.screen_type} · ` : ""}
            {progress.filename || "-"}
          </span>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-[var(--line-soft)] pt-3 text-[12px]">
        <span className="text-[var(--muted)]">
          성공 <strong className="ml-1 font-semibold text-[#9fcaae]">{progress.success_count}</strong>
        </span>
        <span className="text-[var(--muted)]">
          실패 <strong className={`ml-1 font-semibold ${progress.error_count > 0 ? "text-[#d98b91]" : "text-white"}`}>{progress.error_count}</strong>
        </span>
        <span className="text-[var(--muted)]">
          남음 <strong className="ml-1 font-semibold text-white">{remaining}</strong>
        </span>
        {complete && <span className="font-medium text-[#9fcaae]">완료</span>}
      </div>
    </section>
  );
}

import type { MatchImportStatus } from "@/lib/backend";

const STEPS = [
  { key: "upload", label: "등록" },
  { key: "ocr", label: "OCR" },
  { key: "review", label: "검수" },
  { key: "confirm", label: "확정" },
] as const;

function stepState(status: MatchImportStatus, index: number) {
  const activeIndex =
    status === "awaiting_upload"
      ? 0
      : status === "pending_ocr" || status === "processing_ocr" || status === "failed"
        ? 1
        : status === "needs_review"
          ? 2
          : 3;

  return {
    active: index === activeIndex,
    done: index < activeIndex || status === "confirmed",
  };
}

export default function MatchWorkflow({ status }: { status: MatchImportStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-y border-[var(--line)] py-3">
      {STEPS.map((step, index) => {
        const state = stepState(status, index);
        return (
          <div key={step.key} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold ${
                state.done
                  ? "border-[#34513d] text-[#9fcaae]"
                  : state.active
                    ? "border-[var(--orange)] text-[var(--orange-2)]"
                    : "border-[var(--line)] text-[#666a73]"
              }`}
            >
              {state.done ? "✓" : index + 1}
            </span>
            <span className={`text-[12px] font-medium ${state.active ? "text-white" : "text-[var(--muted)]"}`}>
              {step.label}
            </span>
            {index < STEPS.length - 1 && <span className="mx-1 h-px w-5 bg-[var(--line)]" />}
          </div>
        );
      })}
    </div>
  );
}

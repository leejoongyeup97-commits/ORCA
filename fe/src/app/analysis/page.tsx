export default function AnalysisPage() {
  return (
    <main className="min-h-screen px-5 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1240px]">
        <p className="mb-2 text-sm font-semibold text-[var(--orange)]">분석</p>
        <h1 className="m-0 text-3xl font-bold tracking-[-0.03em] md:text-4xl">승패 요인 분석</h1>
        <div className="mt-6 rounded-2xl border border-dashed border-[#364052] bg-[#0d1118] px-6 py-16 text-center">
          <p className="m-0 text-sm font-bold">분석 화면은 다음 단계에서 연결합니다</p>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">확정된 경기 데이터가 쌓이면 승률, 영웅, 맵, 조합별 분석을 표시합니다.</p>
        </div>
      </div>
    </main>
  );
}

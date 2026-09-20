export default function HypothesesPage() {
  return (
    <main className="min-h-screen px-5 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1240px]">
        <p className="mb-2 text-sm font-semibold text-[var(--orange)]">가설</p>
        <h1 className="m-0 text-3xl font-bold tracking-[-0.03em] md:text-4xl">가설 관리</h1>
        <div className="mt-6 rounded-2xl border border-dashed border-[#364052] bg-[#0d1118] px-6 py-16 text-center">
          <p className="m-0 text-sm font-bold">가설 기능은 분석 데이터 연결 후 활성화합니다</p>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">예: 특정 영웅 조합, 시간대, 맵이 승률에 영향을 주는지 검증합니다.</p>
        </div>
      </div>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <main className="min-h-screen px-5 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[1240px]">
        <p className="mb-2 text-sm font-semibold text-[var(--orange)]">설정</p>
        <h1 className="m-0 text-3xl font-bold tracking-[-0.03em] md:text-4xl">설정</h1>
        <div className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
          <p className="m-0 text-sm font-bold">현재 개발 모드</p>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Mock backend를 사용하고 있습니다. 실제 Supabase 연결은 백엔드 연동 단계에서 추가합니다.</p>
        </div>
      </div>
    </main>
  );
}

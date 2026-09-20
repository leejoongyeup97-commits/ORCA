"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { BACKEND_MODE } from "@/lib/backend";

type ExportPayload = {
  exported_at: string;
  app: "overwatch-insight";
  version: "0.7";
  storage: Record<string, string>;
};

function collectAppStorage() {
  const storage: Record<string, string> = {};
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key || !key.startsWith("ow-insight-")) continue;
    const value = localStorage.getItem(key);
    if (value !== null) storage[key] = value;
  }
  return storage;
}

export default function SettingsPage() {
  const [storageCount, setStorageCount] = useState(0);
  const [notice, setNotice] = useState("");

  function refreshCount() {
    setStorageCount(Object.keys(collectAppStorage()).length);
  }

  useEffect(() => {
    refreshCount();
  }, []);

  function exportData() {
    const payload: ExportPayload = {
      exported_at: new Date().toISOString(),
      app: "overwatch-insight",
      version: "0.7",
      storage: collectAppStorage(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `overwatch-insight-backup-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Mock 데이터를 JSON 백업 파일로 내보냈습니다.");
  }

  async function importData(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text()) as Partial<ExportPayload>;
      if (parsed.app !== "overwatch-insight" || !parsed.storage || typeof parsed.storage !== "object") {
        throw new Error("INVALID_BACKUP");
      }

      const ok = window.confirm("현재 Mock 데이터에 백업 내용을 덮어쓸까요?");
      if (!ok) return;

      for (const [key, value] of Object.entries(parsed.storage)) {
        if (key.startsWith("ow-insight-") && typeof value === "string") {
          localStorage.setItem(key, value);
        }
      }
      refreshCount();
      setNotice("백업 데이터를 가져왔습니다. 화면을 새로고침하면 반영됩니다.");
    } catch {
      setNotice("올바른 Overwatch Insight 백업 파일이 아닙니다.");
    }
  }

  function resetData() {
    const ok = window.confirm("모든 Overwatch Insight Mock 데이터를 초기화할까요? 경기, 가설, 폴더 처리 기록이 모두 삭제됩니다.");
    if (!ok) return;

    const keys = Object.keys(collectAppStorage());
    for (const key of keys) localStorage.removeItem(key);
    refreshCount();
    setNotice("Mock 데이터를 모두 초기화했습니다.");
  }

  return (
    <main className="min-h-screen px-5 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-[980px]">
        <section className="mb-7">
          <p className="mb-2 text-sm font-semibold text-[var(--orange)]">설정</p>
          <h1 className="m-0 text-3xl font-bold tracking-[-0.03em] md:text-4xl">개발 환경 및 데이터</h1>
          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
            실제 백엔드 연결 전까지 브라우저에 저장되는 Mock 데이터를 관리합니다.
          </p>
        </section>

        {notice && (
          <div className="mb-5 rounded-xl border border-[#303847] bg-[#0d1118] px-4 py-3 text-xs text-[#c8d0dc]">{notice}</div>
        )}

        <div className="grid gap-5 md:grid-cols-2">
          <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
            <p className="m-0 text-sm font-bold">연결 상태</p>
            <dl className="mt-4 space-y-3 text-xs">
              <Row label="Frontend" value="v0.7" />
              <Row label="Backend mode" value={BACKEND_MODE} />
              <Row label="Contract" value="v0.1" />
              <Row label="저장 위치" value="브라우저 localStorage" />
              <Row label="Mock 저장 항목" value={String(storageCount)} />
            </dl>
            <div className="mt-4 rounded-xl border border-[rgba(102,169,255,0.25)] bg-[rgba(102,169,255,0.06)] p-4">
              <p className="m-0 text-[10px] leading-5 text-[var(--muted)]">
                실제 Supabase 연결 후에는 경기 원본과 상태가 서버에 저장되고, 이 Mock 저장소는 개발용으로만 남깁니다.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
            <p className="m-0 text-sm font-bold">Mock 데이터 백업</p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              브라우저를 바꾸거나 테스트 데이터를 보관할 때 JSON 파일로 내보내고 다시 가져올 수 있습니다.
            </p>

            <div className="mt-5 space-y-2">
              <button type="button" onClick={exportData} className="w-full cursor-pointer rounded-xl bg-[var(--orange)] px-4 py-3 text-xs font-black text-black">
                JSON 백업 내보내기
              </button>
              <label className="block cursor-pointer rounded-xl border border-[var(--line)] bg-[#0d1118] px-4 py-3 text-center text-xs font-bold text-white hover:border-[#4b5668]">
                JSON 백업 가져오기
                <input type="file" accept=".json,application/json" onChange={importData} className="hidden" />
              </label>
            </div>
          </section>
        </div>

        <section className="mt-5 rounded-2xl border border-[#503336] bg-[#1b1013] p-5">
          <p className="m-0 text-sm font-bold text-[#ff9b9b]">개발 데이터 초기화</p>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            경기 목록, 가설, 폴더 처리 기록, 업로드 대기 manifest를 브라우저에서 모두 삭제합니다.
          </p>
          <button type="button" onClick={resetData} className="mt-4 cursor-pointer rounded-xl border border-[#6a3a40] bg-[#281419] px-4 py-3 text-xs font-bold text-[#ff9b9b]">
            모든 Mock 데이터 초기화
          </button>
        </section>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="m-0 font-bold text-white">{value}</dd>
    </div>
  );
}

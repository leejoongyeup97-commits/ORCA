"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { BACKEND_MODE } from "@/lib/backend";
import { getSupabaseConfig } from "@/lib/auth";
import {
  forgetScreenshotFolder,
  getSavedScreenshotFolder,
  getScreenshotAutoScanEnabled,
  pickAndSaveScreenshotFolder,
  queryScreenshotFolderPermission,
  setScreenshotAutoScanEnabled,
  supportsDirectoryPicker,
  type DirectoryPermissionState,
} from "@/lib/screenshot-folder";

type ExportPayload = {
  exported_at: string;
  app: "overwatch-insight";
  version: "0.12";
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
  const [folderName, setFolderName] = useState("");
  const [folderPermission, setFolderPermission] = useState<DirectoryPermissionState | "none">("none");
  const [autoScanFolder, setAutoScanFolder] = useState(false);
  const [folderBusy, setFolderBusy] = useState(false);
  const supabaseConfig = getSupabaseConfig();

  function refreshCount() {
    setStorageCount(Object.keys(collectAppStorage()).length);
  }

  useEffect(() => {
    refreshCount();
    setAutoScanFolder(getScreenshotAutoScanEnabled());

    getSavedScreenshotFolder()
      .then(async (handle) => {
        if (!handle) return;
        setFolderName(handle.name);
        setFolderPermission(await queryScreenshotFolderPermission(handle));
      })
      .catch(() => {
        setFolderName("");
        setFolderPermission("none");
      });
  }, []);

  async function chooseScreenshotFolder() {
    if (!supportsDirectoryPicker()) {
      setNotice("현재 브라우저는 폴더 고정을 지원하지 않습니다. Windows Chrome 또는 Edge에서 localhost로 실행해 주세요.");
      return;
    }

    setFolderBusy(true);
    setNotice("");

    try {
      const handle = await pickAndSaveScreenshotFolder();
      setFolderName(handle.name);
      setFolderPermission(await queryScreenshotFolderPermission(handle));
      setNotice(`스크린샷 폴더 '${handle.name}'를 저장했습니다. 이제 경기 등록에서 폴더를 다시 고를 필요가 없습니다.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setNotice("폴더 지정을 취소했습니다.");
      } else {
        setNotice(error instanceof Error ? error.message : "스크린샷 폴더 지정에 실패했습니다.");
      }
    } finally {
      setFolderBusy(false);
    }
  }

  async function clearScreenshotFolder() {
    if (!folderName) return;
    const ok = window.confirm(`저장된 스크린샷 폴더 '${folderName}' 연결을 해제할까요?`);
    if (!ok) return;

    await forgetScreenshotFolder();
    setFolderName("");
    setFolderPermission("none");
    setNotice("스크린샷 폴더 연결을 해제했습니다.");
  }

  function changeAutoScan(enabled: boolean) {
    setAutoScanFolder(enabled);
    setScreenshotAutoScanEnabled(enabled);
    setNotice(
      enabled
        ? "경기 등록 화면 진입 시 권한이 유지되어 있으면 자동으로 새 스크린샷을 확인합니다."
        : "자동 확인을 끄고 경기 등록 화면의 버튼으로만 스캔합니다.",
    );
  }

  function exportData() {
    const payload: ExportPayload = {
      exported_at: new Date().toISOString(),
      app: "overwatch-insight",
      version: "0.12",
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
    <main className="min-h-screen px-4 py-7 text-[var(--text)] md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1120px]">
        <section className="mb-8 border-b border-[var(--line)] pb-6">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">설정</p>
          <h1 className="m-0 text-[28px] font-semibold tracking-[-0.03em] text-white md:text-[32px]">개발 환경 및 데이터</h1>
          <p className="mt-2 text-[13px] leading-6 text-[var(--muted)]">
            실제 백엔드 연결 전까지 브라우저에 저장되는 Mock 데이터를 관리합니다.
          </p>
        </section>

        {notice && (
          <div className="mb-6 border-y border-[var(--line)] py-3 text-[11px] text-[#c5cfda]">{notice}</div>
        )}

        <section className="mb-8 border-t border-[var(--line)] pt-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="m-0 text-sm font-medium text-white">스크린샷 폴더</p>
              <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
                한 번 지정하면 브라우저가 폴더 권한을 기억합니다. 경기 등록 때마다 폴더를 다시 선택하지 않아도 됩니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={folderBusy}
                onClick={chooseScreenshotFolder}
                className="app-orange-button cursor-pointer rounded-md px-3 py-2 text-[11px] font-medium disabled:cursor-wait disabled:opacity-50"
              >
                {folderBusy ? "폴더 연결 중..." : folderName ? "폴더 변경" : "폴더 지정"}
              </button>
              {folderName && (
                <button
                  type="button"
                  onClick={clearScreenshotFolder}
                  className="cursor-pointer rounded-md border border-[var(--line)] bg-transparent px-3 py-2 text-[11px] font-medium text-white hover:bg-[#151619]"
                >
                  연결 해제
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 border-y border-[var(--line)] sm:grid-cols-3">
            <FolderStatus label="저장된 폴더" value={folderName || "없음"} />
            <FolderStatus
              label="권한"
              value={
                folderPermission === "granted"
                  ? "허용됨"
                  : folderPermission === "prompt"
                    ? "다시 확인 필요"
                    : folderPermission === "denied"
                      ? "거부됨"
                      : "미연결"
              }
            />
            <FolderStatus label="브라우저" value={supportsDirectoryPicker() ? "지원" : "미지원"} />
          </div>

          <label className="mt-5 flex cursor-pointer items-start gap-3 border-b border-[var(--line)] py-4">
            <input
              type="checkbox"
              checked={autoScanFolder}
              onChange={(event) => changeAutoScan(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--orange)]"
            />
            <span>
              <span className="block text-xs font-medium text-white">경기 등록 화면에서 자동으로 새 파일 확인</span>
              <span className="mt-1 block text-[10px] leading-5 text-[var(--muted)]">
                폴더 읽기 권한이 유지된 경우에만 자동 실행합니다. 브라우저가 권한 재확인을 요구하면 버튼 한 번만 누르면 됩니다.
              </span>
            </span>
          </label>

          <p className="mb-0 mt-3 text-[9px] leading-4 text-[var(--muted)]">
            브라우저 보안상 Windows 전체 경로 문자열은 표시하지 않고, 선택한 폴더 자체의 접근 권한을 안전하게 저장합니다.
          </p>
        </section>

        <div className="grid gap-10 md:grid-cols-2">
          <section className="border-t border-[var(--line)] pt-4">
            <p className="m-0 text-sm font-medium">연결 상태</p>
            <dl className="mt-4 space-y-3 text-xs">
              <Row label="Frontend" value="v0.12" />
              <Row label="Backend mode" value={BACKEND_MODE} />
              <Row label="Auth" value={supabaseConfig.configured ? "Supabase 준비됨" : "Mock / 미설정"} />
              <Row label="Contract" value="v0.1" />
              <Row label="저장 위치" value="브라우저 localStorage" />
              <Row label="Mock 저장 항목" value={String(storageCount)} />
            </dl>
            <div className="mt-4 border-t border-[var(--line-soft)] pt-4">
              <p className="m-0 text-[10px] leading-5 text-[var(--muted)]">
                실제 Supabase 연결 후에는 경기 원본과 상태가 서버에 저장되고, 이 Mock 저장소는 개발용으로만 남깁니다.
              </p>
            </div>
          </section>

          <section className="border-t border-[var(--line)] pt-4">
            <p className="m-0 text-sm font-medium">Mock 데이터 백업</p>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              브라우저를 바꾸거나 테스트 데이터를 보관할 때 JSON 파일로 내보내고 다시 가져올 수 있습니다.
            </p>

            <div className="mt-5 space-y-2">
              <button type="button" onClick={exportData} className="w-full cursor-pointer rounded-md border border-[var(--line)] bg-[#151619] px-4 py-2.5 text-[11px] font-medium text-white hover:bg-[#1a1b1f]">
                JSON 백업 내보내기
              </button>
              <label className="block cursor-pointer rounded-md border border-[var(--line)] bg-transparent px-4 py-2.5 text-center text-[11px] font-medium text-white hover:bg-[#151619]">
                JSON 백업 가져오기
                <input type="file" accept=".json,application/json" onChange={importData} className="hidden" />
              </label>
            </div>
          </section>
        </div>

        <section className="mt-10 border-t border-[var(--line)] pt-4">
          <p className="m-0 text-sm font-medium text-[#c5cfda]">개발 데이터 초기화</p>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            경기 목록, 가설, 폴더 처리 기록, 업로드 대기 manifest를 브라우저에서 모두 삭제합니다.
          </p>
          <button type="button" onClick={resetData} className="mt-4 cursor-pointer rounded-md border border-[#4b2f33] bg-transparent px-3 py-2 text-[11px] font-medium text-[#d98b91] hover:bg-[#1c1214]">
            모든 Mock 데이터 초기화
          </button>
        </section>
      </div>
    </main>
  );
}

function FolderStatus({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-[var(--line)] px-4 py-3 first:pl-0 last:border-r-0">
      <p className="m-0 text-[9px] font-medium text-[var(--muted)]">{label}</p>
      <p className="mb-0 mt-1 truncate text-xs font-medium text-white">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="m-0 font-medium text-white">{value}</dd>
    </div>
  );
}

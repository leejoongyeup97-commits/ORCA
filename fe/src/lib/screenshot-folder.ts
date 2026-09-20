export type DirectoryEntryLike = {
  kind: "file" | "directory";
  name: string;
  getFile?: () => Promise<File>;
};

export type DirectoryPermissionMode = "read" | "readwrite";
export type DirectoryPermissionState = "granted" | "denied" | "prompt";

export type DirectoryHandleLike = {
  kind?: "directory";
  name: string;
  values: () => AsyncIterableIterator<DirectoryEntryLike>;
  queryPermission?: (options?: { mode?: DirectoryPermissionMode }) => Promise<DirectoryPermissionState>;
  requestPermission?: (options?: { mode?: DirectoryPermissionMode }) => Promise<DirectoryPermissionState>;
};

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<DirectoryHandleLike>;
  }
}

const DB_NAME = "orca-local-settings";
const STORE_NAME = "handles";
const DB_VERSION = 1;
const SCREENSHOT_FOLDER_KEY = "screenshot-folder";
const AUTO_SCAN_KEY = "ow-insight-auto-scan-screenshot-folder";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("폴더 설정 저장소를 열 수 없습니다."));
  });
}

export function supportsDirectoryPicker() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

export async function saveScreenshotFolder(handle: DirectoryHandleLike) {
  const db = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(handle, SCREENSHOT_FOLDER_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("스크린샷 폴더 설정을 저장하지 못했습니다."));
      tx.onabort = () => reject(tx.error ?? new Error("스크린샷 폴더 설정 저장이 취소되었습니다."));
    });
  } finally {
    db.close();
  }
}

export async function getSavedScreenshotFolder(): Promise<DirectoryHandleLike | null> {
  if (typeof indexedDB === "undefined") return null;

  const db = await openDatabase();

  try {
    return await new Promise<DirectoryHandleLike | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(SCREENSHOT_FOLDER_KEY);
      request.onsuccess = () => resolve((request.result as DirectoryHandleLike | undefined) ?? null);
      request.onerror = () => reject(request.error ?? new Error("저장된 스크린샷 폴더를 읽지 못했습니다."));
    });
  } finally {
    db.close();
  }
}

export async function pickAndSaveScreenshotFolder() {
  if (!window.showDirectoryPicker) {
    throw new Error("이 브라우저는 폴더 지정을 지원하지 않습니다. Windows Chrome 또는 Edge에서 localhost로 실행해 주세요.");
  }

  const handle = await window.showDirectoryPicker();
  await saveScreenshotFolder(handle);
  return handle;
}

export async function forgetScreenshotFolder() {
  if (typeof indexedDB === "undefined") return;

  const db = await openDatabase();

  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(SCREENSHOT_FOLDER_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("스크린샷 폴더 설정을 삭제하지 못했습니다."));
    });
  } finally {
    db.close();
  }
}

export async function queryScreenshotFolderPermission(handle: DirectoryHandleLike) {
  if (!handle.queryPermission) return "prompt" as DirectoryPermissionState;

  try {
    return await handle.queryPermission({ mode: "read" });
  } catch {
    return "prompt" as DirectoryPermissionState;
  }
}

export async function ensureScreenshotFolderPermission(
  handle: DirectoryHandleLike,
  requestIfNeeded = true,
) {
  const current = await queryScreenshotFolderPermission(handle);
  if (current === "granted") return true;
  if (!requestIfNeeded || !handle.requestPermission) return false;

  try {
    return (await handle.requestPermission({ mode: "read" })) === "granted";
  } catch {
    return false;
  }
}

export function getScreenshotAutoScanEnabled() {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(AUTO_SCAN_KEY) === "true";
}

export function setScreenshotAutoScanEnabled(enabled: boolean) {
  localStorage.setItem(AUTO_SCAN_KEY, String(enabled));
}

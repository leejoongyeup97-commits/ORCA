const NICKNAME_POOL_KEY = "ow-insight-my-nickname-pool";

function normalizeNickname(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function getMyNicknamePool(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(NICKNAME_POOL_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((value): value is string => typeof value === "string")
      .map(normalizeNickname)
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function setMyNicknamePool(values: string[]) {
  const seen = new Set<string>();
  const normalized = values
    .map(normalizeNickname)
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  localStorage.setItem(NICKNAME_POOL_KEY, JSON.stringify(normalized));
  return normalized;
}

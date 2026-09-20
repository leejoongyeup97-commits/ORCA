export type OrcaSession = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  user: {
    id: string;
    email?: string;
  };
};

const SESSION_KEY = "orca-auth-session:v1";

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
  const configured =
    url.startsWith("https://") &&
    Boolean(publishableKey) &&
    !url.includes("YOUR_PROJECT") &&
    !publishableKey.includes("YOUR_PUBLISHABLE_KEY");

  return { url: url.replace(/\/$/, ""), publishableKey, configured };
}

export function getStoredSession(): OrcaSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as OrcaSession) : null;
  } catch {
    return null;
  }
}

export async function signInWithPassword(email: string, password: string) {
  const config = getSupabaseConfig();
  if (!config.configured) {
    throw new Error("Supabase 환경변수가 아직 설정되지 않았습니다.");
  }

  const response = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: config.publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const data = (await response.json().catch(() => ({}))) as Partial<OrcaSession> & {
    msg?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token || !data.user) {
    throw new Error(data.error_description || data.msg || "로그인에 실패했습니다.");
  }

  const session = data as OrcaSession;
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export async function signOut() {
  const session = getStoredSession();
  const config = getSupabaseConfig();

  if (session?.access_token && config.configured) {
    try {
      await fetch(`${config.url}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${session.access_token}`,
        },
      });
    } catch {
      // Local session removal still proceeds when the remote logout request fails.
    }
  }

  if (typeof window !== "undefined") localStorage.removeItem(SESSION_KEY);
}

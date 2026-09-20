import type { MatchManagementAdapter } from "./contracts";
import { MockMatchBackendAdapter } from "./mock-adapter";
import { SupabaseMatchBackendAdapter } from "./supabase-adapter";

export * from "./contracts";

const requestedMode = process.env.NEXT_PUBLIC_BACKEND_MODE === "supabase" ? "supabase" : "mock";

let adapter: MatchManagementAdapter | null = null;

export function getMatchBackendAdapter(): MatchManagementAdapter {
  if (!adapter) {
    adapter = requestedMode === "supabase"
      ? new SupabaseMatchBackendAdapter()
      : new MockMatchBackendAdapter();
  }
  return adapter;
}

export const BACKEND_MODE = requestedMode;

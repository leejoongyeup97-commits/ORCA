import type { MatchManagementAdapter } from "./contracts";
import { MockMatchBackendAdapter } from "./mock-adapter";

export * from "./contracts";

let adapter: MatchManagementAdapter | null = null;

export function getMatchBackendAdapter(): MatchManagementAdapter {
  if (!adapter) adapter = new MockMatchBackendAdapter();
  return adapter;
}

export const BACKEND_MODE = "mock" as const;

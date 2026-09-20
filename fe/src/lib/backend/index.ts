import type { MatchBackendAdapter } from "./contracts";
import { MockMatchBackendAdapter } from "./mock-adapter";

export * from "./contracts";

let adapter: MatchBackendAdapter | null = null;

export function getMatchBackendAdapter(): MatchBackendAdapter {
  if (!adapter) adapter = new MockMatchBackendAdapter();
  return adapter;
}

export const BACKEND_MODE = "mock" as const;

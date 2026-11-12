import { useSyncExternalStore } from "react";

/** Selected AWS region, sent to the console API on every request (X-Emulator-Region). */
const KEY = "emulator-region";
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage unavailable (private window etc.) - fall back to the server default
  }
}

let current: string | null = read();

export function getRegion(): string | null {
  return current;
}

export function setRegion(region: string | null): void {
  current = region;
  try {
    if (region) localStorage.setItem(KEY, region);
    else localStorage.removeItem(KEY);
  } catch {
    /* not persisted - still applies for this tab */
  }
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRegion(): string | null {
  return useSyncExternalStore(subscribe, getRegion, getRegion);
}

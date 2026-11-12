import { useEffect, useState } from "react";
import { api, useApi } from "./api";

export interface CatalogService {
  id: string;
  fullName: string;
  serviceId: string;
  category: string;
  icon: string; // "icons/<service>.svg" - generated monogram tile (scripts/build_icons.py)
  protocol: string;
  operations: number;
  listOps: string[];
}

export interface InventoryEntry {
  count: number; // user-created items (above the emulator's built-in baseline)
  total: number;
  ops: Record<string, number | string>;
}

export interface Inventory {
  region: string;
  scanning: boolean;
  startedAt: number;
  finishedAt: number | null;
  services: Record<string, InventoryEntry>;
}

let cache: CatalogService[] | null = null;
let pending: Promise<CatalogService[]> | null = null;

export function loadCatalog(): Promise<CatalogService[]> {
  if (cache) return Promise.resolve(cache);
  pending ??= api.get<{ services: CatalogService[] }>("/catalog").then((d) => (cache = d.services));
  return pending;
}

export function useCatalog(): CatalogService[] | null {
  const [services, setServices] = useState<CatalogService[] | null>(cache);
  useEffect(() => {
    if (!services) loadCatalog().then(setServices).catch(() => setServices([]));
  }, [services]);
  return services;
}

export function iconUrl(icon: string | undefined): string {
  return icon ? `/${icon}` : "/logo.svg";
}

/** Inventory for the current region; polls while a scan is running. */
export function useInventory() {
  const [refresh, setRefresh] = useState(0);
  const inv = useApi<Inventory>(`/inventory${refresh ? `?refresh=true&n=${refresh}` : ""}`);
  const { reload, data } = inv;
  useEffect(() => {
    if (!data?.scanning) return;
    const t = window.setTimeout(reload, 1500);
    return () => window.clearTimeout(t);
  }, [data, reload]);
  return { ...inv, rescan: () => setRefresh((n) => n + 1) };
}

/** Case-insensitive match on id, full name, service id and category. */
export function matches(svc: CatalogService, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [svc.id, svc.fullName, svc.serviceId, svc.category].some((v) => v.toLowerCase().includes(q));
}

/** Services with user resources first (most resources first), then alphabetical. */
export function sortForDashboard(services: CatalogService[], inv: Record<string, InventoryEntry>): CatalogService[] {
  return [...services].sort((a, b) => {
    const ca = inv[a.id]?.count ?? 0;
    const cb = inv[b.id]?.count ?? 0;
    if (ca !== cb) return cb - ca;
    return a.fullName.localeCompare(b.fullName);
  });
}

export function groupByCategory(services: CatalogService[]): [string, CatalogService[]][] {
  const groups = new Map<string, CatalogService[]>();
  for (const s of services) groups.set(s.category, [...(groups.get(s.category) ?? []), s]);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** Destructive operations get a confirmation prompt in the runner. */
export function isDestructive(op: string): boolean {
  return /^(Delete|Terminate|Remove|Purge|Deregister|Destroy|Unregister)/.test(op);
}

/** Services holding user resources, most resources first (drives the sidebar). */
export function activeServices(services: CatalogService[], inv: Record<string, InventoryEntry>): CatalogService[] {
  return sortForDashboard(services, inv).filter((s) => (inv[s.id]?.count ?? 0) > 0);
}

/** "Amazon Simple Queue Service" -> "Simple Queue Service" (sidebar label). */
export function shortName(fullName: string): string {
  return fullName.replace(/^(Amazon|AWS)\s+/, "");
}

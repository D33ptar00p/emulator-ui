import { useCallback, useEffect, useState } from "react";
import { getRegion, useRegion } from "./region";

/** Header the backend requires on every state-changing request (CSRF guard). */
export const CSRF_HEADER = { "X-Emulator-UI": "1" };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { ...CSRF_HEADER };
  const region = getRegion();
  if (region) headers["X-Emulator-Region"] = region;
  const init: RequestInit = { method, headers };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`/api${path}`, init);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? "Error", data?.message ?? data?.detail?.[0]?.msg ?? res.statusText);
  }
  return data as T;
}

export const api = {
  get: <T,>(path: string) => request<T>("GET", path),
  post: <T,>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T,>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  del: <T,>(path: string) => request<T>("DELETE", path),
};

export function q(params: Record<string, string | number | boolean | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export interface Loadable<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/** GET a path (null = skip) and expose data/error/loading + a reload trigger. */
export function useApi<T>(path: string | null): Loadable<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  const region = useRegion(); // refetch when the region changes

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setLoading(true);
    api
      .get<T>(path)
      .then((d) => !cancelled && (setData(d), setError(null)))
      .catch((e: Error) => !cancelled && setError(e instanceof ApiError ? `${e.code}: ${e.message}` : e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, tick, region]);

  return { data, error, loading, reload };
}

export interface OpResult<T = Record<string, unknown>> {
  service: string;
  operation: string;
  region: string;
  durationMs: number;
  result: T;
}

/** Run any operation of any service through the generic runner (POST /api/services/{svc}/operations/{op}). */
export function runOp<T = Record<string, any>>(
  service: string,
  operation: string,
  params: Record<string, unknown> = {},
  paginate = false,
): Promise<OpResult<T>> {
  return api.post<OpResult<T>>(`/services/${encodeURIComponent(service)}/operations/${encodeURIComponent(operation)}`, {
    params,
    paginate,
  });
}

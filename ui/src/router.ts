import { useEffect, useState } from "react";

export interface Route {
  segments: string[];
  query: URLSearchParams;
}

/** "#/s3/my-bucket?prefix=a%2F" -> { segments: ["s3", "my-bucket"], query: prefix=a/ } */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "");
  const [path, qs = ""] = raw.split("?", 2);
  const segments = path.split("/").filter(Boolean).map(decodeURIComponent);
  return { segments, query: new URLSearchParams(qs) };
}

export function href(segments: string[], query?: Record<string, string | undefined>): string {
  const path = segments.map(encodeURIComponent).join("/");
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v) sp.set(k, v);
  const qs = sp.toString();
  return `#/${path}${qs ? `?${qs}` : ""}`;
}

export function navigate(segments: string[], query?: Record<string, string | undefined>): void {
  window.location.hash = href(segments, query);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

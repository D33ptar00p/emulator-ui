export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${i === 0 ? v : v.toFixed(1)} ${units[i]}`;
}

export function formatDate(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  const d = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
}

/** Last segment of an ARN (after ":" or "/"). */
export function arnName(arn: string | null | undefined): string {
  if (!arn) return "-";
  return arn.split(/[:/]/).pop() ?? arn;
}

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string };

export function parseJson(text: string): ParseResult {
  if (text.trim() === "") return { ok: true, value: null };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function pretty(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

/** Pick only the key attributes of a DynamoDB item, given {HASH: "pk", RANGE: "sk"}. */
export function itemKey(item: Record<string, unknown>, keys: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const attr of Object.values(keys)) out[attr] = item[attr];
  return out;
}

/** Union of attribute names across items, key attributes first. */
export function columnsFor(items: Record<string, unknown>[], keyAttrs: string[]): string[] {
  const seen = new Set<string>(keyAttrs);
  for (const item of items) for (const k of Object.keys(item)) seen.add(k);
  return [...seen];
}

export function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

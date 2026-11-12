import { ReactNode, useState } from "react";
import { ApiError } from "./api";
import { confirmDialog } from "./confirm";
import { parseJson, pretty } from "./lib/format";
import { href, useRoute } from "./router";
import { serviceById } from "./services";

export function Page({ title, crumbs, actions, children, icon }: {
  title: string;
  icon?: string;
  crumbs?: { label: string; href?: string }[];
  actions?: ReactNode;
  children: ReactNode;
}) {
  const svc = serviceById(useRoute().segments[0]);
  return (
    <div className="page">
      {crumbs && (
        <nav className="crumbs">
          {crumbs.map((c, i) => (
            <span key={i}>
              {c.href ? <a href={c.href}>{c.label}</a> : <span>{c.label}</span>}
              {i < crumbs.length - 1 && <span className="sep">/</span>}
            </span>
          ))}
        </nav>
      )}
      <header className="page-head">
        {(icon || svc) && <img className="svc-icon xl" src={icon ?? svc!.icon} alt="" />}
        <h1 title={title}>{title}</h1>
        <div className="actions">
          {actions}
          {svc && !icon && (
            <a className="btn secondary" href={href(["svc", svc.catalogId], { tab: "operations" })} title="Run any API operation">
              All operations
            </a>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}

export function Card({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-head">
          <h2>{title}</h2>
          <div className="actions">{actions}</div>
        </div>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  className?: string;
}

export function Table<T>({ columns, rows, onRowClick, empty = "Nothing here yet.", rowKey }: {
  columns: Column<T>[];
  rows: T[] | null;
  onRowClick?: (row: T) => void;
  empty?: string;
  rowKey?: (row: T, i: number) => string;
}) {
  if (!rows) return null;
  if (rows.length === 0) return <p className="empty">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey ? rowKey(row, i) : i} className={onRowClick ? "clickable" : undefined} onClick={() => onRowClick?.(row)}>
              {columns.map((c) => (
                <td key={c.key} className={c.className}>
                  {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Json({ value, maxHeight }: { value: unknown; maxHeight?: number }) {
  return <pre className="json" style={maxHeight ? { maxHeight } : undefined}>{pretty(value)}</pre>;
}

export function JsonEditor({ value, onChange, rows = 8, label }: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  label?: string;
}) {
  const parsed = parseJson(value);
  return (
    <label className="field">
      {label && <span>{label}</span>}
      <textarea className={`code ${parsed.ok ? "" : "invalid"}`} rows={rows} value={value} spellCheck={false}
        onChange={(e) => onChange(e.target.value)} />
      {!parsed.ok && <small className="error-text">Invalid JSON: {parsed.error}</small>}
    </label>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ErrorBox({ error }: { error: string | null | undefined }) {
  return error ? <div className="error-box">{error}</div> : null;
}

export function Loading({ show }: { show: boolean }) {
  return show ? <div className="loading">Loading…</div> : null;
}

export function Badge({ value }: { value: string | null | undefined }) {
  const v = (value ?? "").toUpperCase();
  const tone = ["ACTIVE", "SUCCEEDED", "ENABLED", "AVAILABLE", "SUCCESS", "200"].includes(v)
    ? "ok"
    : ["FAILED", "TIMED_OUT", "ABORTED", "DISABLED", "UNHANDLED"].includes(v)
      ? "bad"
      : ["RUNNING", "CREATING", "PENDING", "UPDATING", "PROCESSING"].includes(v)
        ? "warn"
        : "neutral";
  return <span className={`badge ${tone}`}>{value ?? "-"}</span>;
}

export function Tabs({ tabs, active, onChange }: { tabs: string[]; active: string; onChange: (t: string) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t} className={t === active ? "tab active" : "tab"} onClick={() => onChange(t)}>{t}</button>
      ))}
    </div>
  );
}

/** Button that runs an async action, shows busy state, and reports errors. */
export function ActionButton({ onClick, children, variant = "primary", confirm, disabled }: {
  onClick: () => Promise<unknown>;
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  confirm?: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="action-btn">
      <button
        className={`btn ${variant}`}
        disabled={busy || disabled}
        onClick={async (e) => {
          e.stopPropagation();
          if (
            confirm &&
            !(await confirmDialog({
              title: confirm,
              message: variant === "danger" ? "This can't be undone." : undefined,
              confirmLabel: typeof children === "string" ? children : "Confirm",
              danger: variant === "danger",
            }))
          )
            return;
          setBusy(true);
          setErr(null);
          try {
            await onClick();
          } catch (ex) {
            setErr(ex instanceof ApiError ? `${ex.code}: ${ex.message}` : (ex as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : children}
      </button>
      {err && <span className="error-text inline">{err}</span>}
    </span>
  );
}

export function Kv({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="kv">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v ?? "-"}</dd>
        </div>
      ))}
    </dl>
  );
}

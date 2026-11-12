import { useEffect, useMemo, useState } from "react";
import { ApiError, runOp, useApi, type OpResult } from "./api";
import { isDestructive } from "./catalog";
import { confirmDialog } from "./confirm";
import { Badge, Card, ErrorBox, Json, JsonEditor, Loading, Table } from "./components";
import { cell, parseJson, pretty } from "./lib/format";

export interface OperationSummary {
  name: string;
  group: "read" | "create" | "update" | "delete" | "other";
  destructive: boolean;
  required: string[];
  eventStream: boolean;
  deprecated: boolean;
}

interface OperationDetail {
  name: string;
  docs: string;
  required: string[];
  members: { name: string; type: string; required: boolean; enum: string[]; doc: string }[];
  skeleton: Record<string, unknown>;
  fullSkeleton: Record<string, unknown>;
  paginated: boolean;
  eventStream: boolean;
}

const GROUP_LABELS: Record<string, string> = {
  read: "Read",
  create: "Create",
  update: "Update",
  delete: "Delete",
  other: "Other",
};

/** First top-level array of objects in a response, for a table view. */
export function firstList(result: unknown): { key: string; rows: Record<string, unknown>[] } | null {
  if (!result || typeof result !== "object") return null;
  for (const [key, value] of Object.entries(result as Record<string, unknown>)) {
    if (Array.isArray(value) && value.length) {
      const rows = value.map((v) => (v && typeof v === "object" ? (v as Record<string, unknown>) : { value: v }));
      return { key, rows };
    }
  }
  return null;
}

export function ResultView({ result }: { result: OpResult | null }) {
  const list = useMemo(() => firstList(result?.result), [result]);
  if (!result) return null;
  const cols = list ? [...new Set(list.rows.slice(0, 50).flatMap((r) => Object.keys(r)))].slice(0, 8) : [];
  return (
    <div className="stack">
      <span className="muted">
        {result.service}.{result.operation} in {result.region} - {result.durationMs} ms
      </span>
      {list && (
        <>
          <strong>
            {list.key} ({list.rows.length})
          </strong>
          <Table<Record<string, unknown>>
            rows={list.rows}
            columns={cols.map((c) => ({ key: c, label: c, render: (r) => cell(r[c]) }))}
          />
        </>
      )}
      <Json value={result.result} />
    </div>
  );
}

/** Pick an operation, edit its JSON input (pre-filled from the API model) and run it. */
export function OperationRunner({
  service,
  operations,
  initialOp,
  initialParams,
}: {
  service: string;
  operations: OperationSummary[];
  initialOp?: string;
  initialParams?: Record<string, unknown>;
}) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(initialOp ?? null);

  useEffect(() => {
    if (initialOp) setSelected(initialOp);
  }, [initialOp]);

  const visible = operations.filter(
    (o) => (group === "all" || o.group === group) && o.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const counts = operations.reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.group]: (acc[o.group] ?? 0) + 1 }), {});

  return (
    <div className="runner">
      <Card title={`Operations (${operations.length})`}>
        <div className="stack">
          <input type="search" placeholder="Filter operations…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="chips">
            {["all", "read", "create", "update", "delete", "other"].map((g) => (
              <button key={g} className={`chip ${group === g ? "active" : ""}`} onClick={() => setGroup(g)}>
                {g === "all" ? "All" : GROUP_LABELS[g]} {g === "all" ? operations.length : counts[g] ?? 0}
              </button>
            ))}
          </div>
          <div className="op-list">
            {visible.map((o) => (
              <button key={o.name} className={`op-item ${selected === o.name ? "active" : ""} g-${o.group}`} onClick={() => setSelected(o.name)}>
                <span>{o.name}</span>
                {o.deprecated && <small className="muted">deprecated</small>}
              </button>
            ))}
            {!visible.length && <p className="empty">No matching operations.</p>}
          </div>
        </div>
      </Card>
      {selected ? (
        <OperationForm key={`${service}.${selected}`} service={service} op={selected} initialParams={selected === initialOp ? initialParams : undefined} />
      ) : (
        <Card title="Run an operation">
          <p className="empty">Pick an operation on the left. Its input is pre-filled from the AWS API model.</p>
        </Card>
      )}
    </div>
  );
}

function OperationForm({ service, op, initialParams }: { service: string; op: string; initialParams?: Record<string, unknown> }) {
  const detail = useApi<OperationDetail>(`/services/${encodeURIComponent(service)}/operations/${encodeURIComponent(op)}`);
  const [input, setInput] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [paginate, setPaginate] = useState(false);
  const [result, setResult] = useState<OpResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!detail.data) return;
    const base = showAll ? detail.data.fullSkeleton : detail.data.skeleton;
    setInput(pretty({ ...base, ...(initialParams ?? {}) }));
  }, [detail.data, showAll, initialParams]);

  const parsed = parseJson(input ?? "{}");
  const d = detail.data;

  const run = async () => {
    if (!parsed.ok) return;
    if (
      isDestructive(op) &&
      !(await confirmDialog({
        title: `Run ${op}?`,
        message: (
          <>
            This calls <span className="mono">{service}.{op}</span> on the emulator and may remove resources. It can't be undone.
          </>
        ),
        details: pretty(parsed.value ?? {}),
        confirmLabel: `Run ${op}`,
        danger: true,
      }))
    )
      return;
    setBusy(true);
    setError(null);
    try {
      setResult(await runOp(service, op, (parsed.value ?? {}) as Record<string, unknown>, paginate));
    } catch (e) {
      setResult(null);
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <Card
        title={
          <>
            {op} {isDestructive(op) && <Badge value="destructive" />}
          </>
        }
        actions={
          <a className="btn secondary small" target="_blank" rel="noreferrer"
            href={`https://docs.aws.amazon.com/search/doc-search.html?searchQuery=${encodeURIComponent(`${service} ${op}`)}`}>
            AWS docs
          </a>
        }
      >
        <Loading show={detail.loading && !d} />
        <ErrorBox error={detail.error} />
        {d && (
          <div className="stack">
            {d.docs && <p className="muted" style={{ margin: 0 }}>{d.docs}</p>}
            {d.eventStream ? (
              <div className="notice">This operation uses an event stream, which the console can't run.</div>
            ) : (
              <>
                <JsonEditor value={input ?? ""} onChange={setInput} rows={12} label={`Input${d.required.length ? ` (required: ${d.required.join(", ")})` : ""}`} />
                <div className="form-row" style={{ alignItems: "center" }}>
                  <label className="check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all fields</label>
                  {d.paginated && (
                    <label className="check"><input type="checkbox" checked={paginate} onChange={(e) => setPaginate(e.target.checked)} /> Fetch all pages</label>
                  )}
                  <span className="grow" />
                  <button className={`btn ${isDestructive(op) ? "danger" : ""}`} disabled={!parsed.ok || busy} onClick={run}>
                    {busy ? "Running…" : "Run"}
                  </button>
                </div>
                {d.members.length > 0 && (
                  <details>
                    <summary className="muted">Parameters ({d.members.length})</summary>
                    <Table rows={d.members} rowKey={(m) => m.name} columns={[
                      { key: "name", label: "Name", render: (m) => <span className="mono">{m.name}{m.required && " *"}</span> },
                      { key: "type", label: "Type", render: (m) => (m.enum.length ? `enum (${m.enum.slice(0, 4).join(", ")}${m.enum.length > 4 ? ", …" : ""})` : m.type) },
                      { key: "doc", label: "Description", className: "wrap" },
                    ]} />
                  </details>
                )}
              </>
            )}
          </div>
        )}
      </Card>
      <ErrorBox error={error} />
      {result && <Card title="Response"><ResultView result={result} /></Card>}
    </div>
  );
}

export function useOperations(service: string) {
  return useApi<{ operationsDetail: OperationSummary[]; listOps: string[]; fullName: string; icon: string; category: string; apiVersion: string }>(
    `/services/${encodeURIComponent(service)}`,
  );
}


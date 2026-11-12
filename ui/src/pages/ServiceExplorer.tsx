import { useEffect, useMemo, useState } from "react";
import { ApiError, runOp, type OpResult } from "../api";
import { curatedForCatalogId } from "../services";
import { iconUrl, useInventory } from "../catalog";
import { ActionButton, Card, ErrorBox, Json, Kv, Loading, Page, Table, Tabs } from "../components";
import { cell } from "../lib/format";
import { firstList, OperationRunner, useOperations, type OperationSummary } from "../OperationRunner";
import { href, navigate } from "../router";

/** Generic page for any of the emulator's services: browse resources + run any operation. */
export function ServiceExplorer({ service, query }: { service: string; query: URLSearchParams }) {
  const svc = useOperations(service);
  const inventory = useInventory();
  const tab = query.get("tab") ?? "resources";
  const [runFor, setRunFor] = useState<{ op: string; params: Record<string, unknown> } | null>(null);
  const curated = curatedForCatalogId(service);
  const d = svc.data;
  const inv = inventory.data?.services[service];
  const setTab = (t: string) => navigate(["svc", service], { tab: t === "resources" ? undefined : t });

  return (
    <Page
      title={d?.fullName ?? service}
      icon={d ? iconUrl(d.icon) : undefined}
      crumbs={[{ label: "All services", href: href(["services"]) }, { label: d?.fullName ?? service }]}
      actions={curated && <a className="btn secondary" href={href([curated.id])}>Open {curated.label} resources</a>}
    >
      <ErrorBox error={svc.error} />
      <Loading show={svc.loading && !d} />
      {d && (
        <>
          <Card>
            <Kv rows={[
              ["Service id", <span className="mono">{service}</span>],
              ["Category", d.category],
              ["API version", d.apiVersion],
              ["Operations", String(d.operationsDetail.length)],
              ["Your resources", inv ? String(inv.count) : inventory.data?.scanning ? "scanning…" : "-"],
            ]} />
          </Card>
          <Tabs
            tabs={["Resources", "Operations"]}
            active={tab === "operations" ? "Operations" : "Resources"}
            onChange={(t) => setTab(t.toLowerCase())}
          />
          {tab === "operations" ? (
            <OperationRunner service={service} operations={d.operationsDetail} initialOp={runFor?.op} initialParams={runFor?.params} />
          ) : (
            <Resources
              service={service}
              listOps={d.listOps}
              operations={d.operationsDetail}
              onAction={(op, params) => {
                setRunFor({ op, params });
                setTab("operations");
              }}
            />
          )}
        </>
      )}
    </Page>
  );
}

function Resources({ service, listOps, operations, onAction }: {
  service: string;
  listOps: string[];
  operations: OperationSummary[];
  onAction: (op: string, params: Record<string, unknown>) => void;
}) {
  if (!listOps.length) {
    return (
      <Card>
        <p className="empty">
          This service has no browse operation (List/Describe without required input). It's usually a runtime or data
          API. Use the Operations tab to call it.
        </p>
      </Card>
    );
  }
  return (
    <div className="stack">
      {listOps.map((op) => (
        <ResourceList key={op} service={service} op={op} operations={operations} onAction={onAction} />
      ))}
    </div>
  );
}

/** Operations whose required inputs can all be filled from a row (e.g. QueueUrl, FunctionName, *Arn). */
export function actionsForRow(row: Record<string, unknown>, listOp: string, operations: OperationSummary[]) {
  const noun = listOp.replace(/^(List|Describe|Get)/, "").replace(/(ies)$/, "y").replace(/s$/, "");
  const candidates = operations.filter(
    (o) => o.required.length > 0 && o.name !== listOp && o.name.includes(noun) && /^(Describe|Get|Delete|Update)/.test(o.name),
  );
  const out: { op: OperationSummary; params: Record<string, unknown> }[] = [];
  for (const o of candidates) {
    const params: Record<string, unknown> = {};
    for (const req of o.required) {
      const value = valueFor(row, req);
      if (value === undefined) break;
      params[req] = value;
    }
    if (Object.keys(params).length === o.required.length) out.push({ op: o, params });
  }
  return out.slice(0, 4);
}

function valueFor(row: Record<string, unknown>, member: string): unknown {
  if (member in row && typeof row[member] !== "object") return row[member];
  const lower = member.toLowerCase();
  const exact = Object.keys(row).find((k) => k.toLowerCase() === lower);
  if (exact && typeof row[exact] !== "object") return row[exact];
  for (const suffix of ["arn", "name", "id", "url"]) {
    if (lower.endsWith(suffix)) {
      const key = Object.keys(row).find((k) => k.toLowerCase().endsWith(suffix) && typeof row[k] === "string");
      if (key) return row[key];
    }
  }
  if (typeof row.value === "string") return row.value; // list of scalars, e.g. QueueUrls
  return undefined;
}

function ResourceList({ service, op, operations, onAction }: {
  service: string;
  op: string;
  operations: OperationSummary[];
  onAction: (op: string, params: Record<string, unknown>) => void;
}) {
  const [result, setResult] = useState<OpResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    runOp(service, op, {}, true)
      .then((r) => !cancelled && (setResult(r), setError(null)))
      .catch((e) => !cancelled && setError(e instanceof ApiError ? `${e.code}: ${e.message}` : (e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [service, op, tick]);

  const list = useMemo(() => firstList(result?.result), [result]);
  const cols = list ? [...new Set(list.rows.slice(0, 50).flatMap((r) => Object.keys(r)))].slice(0, 6) : [];

  return (
    <Card
      title={<span className="mono">{op}{list ? ` (${list.rows.length})` : ""}</span>}
      actions={<button className="btn secondary small" onClick={() => setTick((t) => t + 1)}>Refresh</button>}
    >
      <Loading show={loading && !result} />
      {error && <div className={error.includes("NotImplemented") ? "notice" : "error-box"}>{error.includes("NotImplemented") ? "Not implemented by the emulator yet (501)." : error}</div>}
      {!error && result && !list && (
        firstListIsEmpty(result.result) ? <p className="empty">No resources.</p> : <Json value={result.result} maxHeight={300} />
      )}
      {list && (
        <Table
          rows={list.rows}
          columns={[
            ...cols.map((c) => ({ key: c, label: c, render: (r: Record<string, unknown>) => cell(r[c]) })),
            {
              key: "__actions",
              label: "",
              render: (r: Record<string, unknown>) => (
                <span className="actions">
                  {actionsForRow(r, op, operations).map(({ op: action, params }) =>
                    action.destructive ? (
                      <ActionButton key={action.name} variant="danger" confirm={`Run ${action.name}?`}
                        onClick={async () => { await runOp(service, action.name, params); setTick((t) => t + 1); }}>
                        {action.name.replace(/^(\w+?)[A-Z].*/, "$1")}
                      </ActionButton>
                    ) : (
                      <button key={action.name} className="btn secondary small" title={action.name}
                        onClick={(e) => { e.stopPropagation(); onAction(action.name, params); }}>
                        {action.name}
                      </button>
                    ),
                  )}
                </span>
              ),
            },
          ]}
        />
      )}
      {result && <small className="muted">{result.durationMs} ms - region {result.region}</small>}
    </Card>
  );
}

function firstListIsEmpty(result: unknown): boolean {
  if (!result || typeof result !== "object") return true;
  return Object.values(result as Record<string, unknown>).some((v) => Array.isArray(v) && v.length === 0);
}


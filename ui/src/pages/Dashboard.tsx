import { useMemo, useState } from "react";
import type { Health } from "../App";
import {
  type CatalogService,
  groupByCategory,
  iconUrl,
  matches,
  sortForDashboard,
  useCatalog,
  useInventory,
} from "../catalog";
import { ErrorBox, Page } from "../components";
import { href } from "../router";
import { curatedForCatalogId } from "../services";

function serviceHref(s: CatalogService): string {
  const curated = curatedForCatalogId(s.id);
  return curated ? href([curated.id]) : href(["svc", s.id]);
}

function Tile({ s, count, scanning }: { s: CatalogService; count: number | undefined; scanning: boolean }) {
  return (
    <a className={`tile ${count ? "active-tile" : ""}`} href={serviceHref(s)} title={`${s.fullName} (${s.id})`}>
      <span className="tile-head">
        <img className="svc-icon lg" src={iconUrl(s.icon)} alt="" loading="lazy" />
        <span className="tile-name">{s.fullName}</span>
      </span>
      <span className="tile-meta">
        {count ? (
          <span className="count-pill">{count} resource{count === 1 ? "" : "s"}</span>
        ) : (
          <span className="muted">{scanning && count === undefined ? "scanning…" : "no resources"}</span>
        )}
      </span>
    </a>
  );
}

export function Dashboard({ health }: { health: Health | null }) {
  const catalog = useCatalog();
  const inventory = useInventory();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [onlyActive, setOnlyActive] = useState(false);
  const inv = inventory.data?.services ?? {};
  const scanning = Boolean(inventory.data?.scanning);

  const filtered = useMemo(
    () => (catalog ?? []).filter((s) => matches(s, query) && (!category || s.category === category)),
    [catalog, query, category],
  );
  const active = sortForDashboard(filtered, inv).filter((s) => (inv[s.id]?.count ?? 0) > 0);
  const rest = filtered.filter((s) => !(inv[s.id]?.count ?? 0));
  const categories = useMemo(() => groupByCategory(catalog ?? []).map(([c, list]) => [c, list.length] as const), [catalog]);
  const totalResources = Object.values(inv).reduce((n, e) => n + (e.count ?? 0), 0);

  return (
    <Page
      title="Dashboard"
      actions={
        <button className="btn secondary" onClick={inventory.rescan} disabled={scanning}>
          {scanning ? "Scanning…" : "Rescan resources"}
        </button>
      }
    >
      <div className="search-bar">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 0 1 6.32 12.9l5.39 5.4-1.41 1.4-5.4-5.38A8 8 0 1 1 10 2Zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z" /></svg>
        <input
          type="search"
          autoFocus
          placeholder={`Search ${catalog?.length ?? ""} services by name, id or category (e.g. "queue", "kms", "Databases")`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && <button className="btn secondary small" onClick={() => setQuery("")}>Clear</button>}
      </div>

      <div className="summary">
        <span><strong>{totalResources}</strong> resources in <strong>{active.length}</strong> active service{active.length === 1 ? "" : "s"}</span>
        <span className="muted">· {health?.region ?? ""}{health?.dedicated ? " (isolated emulator)" : ""}</span>
        {inventory.data?.finishedAt && !scanning && (
          <span className="muted">· scanned {new Date(inventory.data.finishedAt * 1000).toLocaleTimeString()}</span>
        )}
        {scanning && <span className="muted">· scanning {Object.keys(inv).length} services…</span>}
        <label className="check" style={{ marginLeft: "auto" }}>
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} /> Only services with resources
        </label>
      </div>

      <ErrorBox error={inventory.error} />

      <section>
        <h2 className="section-title">Active services</h2>
        {active.length ? (
          <div className="tiles">{active.map((s) => <Tile key={s.id} s={s} count={inv[s.id]?.count} scanning={scanning} />)}</div>
        ) : (
          <p className="empty">
            {scanning ? "Scanning for resources…" : query || category ? "No active services match." : "No resources yet in this region. Create some with the CLI, tests or `make seed`."}
          </p>
        )}
      </section>

      {!onlyActive && (
        <section>
          <h2 className="section-title">All services</h2>
          <div className="chips">
            <button className={`chip ${!category ? "active" : ""}`} onClick={() => setCategory(null)}>All {catalog?.length ?? ""}</button>
            {categories.map(([c, n]) => (
              <button key={c} className={`chip ${category === c ? "active" : ""}`} onClick={() => setCategory(category === c ? null : c)}>{c} {n}</button>
            ))}
          </div>
          {groupByCategory(rest).map(([cat, list]) => (
            <div key={cat}>
              <h3 className="category-title">{cat}</h3>
              <div className="tiles">{list.map((s) => <Tile key={s.id} s={s} count={inv[s.id]?.count} scanning={scanning} />)}</div>
            </div>
          ))}
          {catalog && !rest.length && !active.length && <p className="empty">No services match "{query}".</p>}
        </section>
      )}
    </Page>
  );
}

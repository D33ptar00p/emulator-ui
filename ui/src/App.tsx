import { useEffect, useState } from "react";
import { useApi } from "./api";
import { activeServices, iconUrl, shortName, useCatalog, useInventory } from "./catalog";
import { setRegion, useRegion } from "./region";
import { ConfirmHost } from "./confirm";
import { href, useRoute } from "./router";
import { curatedForCatalogId } from "./services";
import { Dashboard } from "./pages/Dashboard";
import { DynamoDB } from "./pages/DynamoDB";
import { S3 } from "./pages/S3";
import { Lambda } from "./pages/Lambda";
import { ApiGateway } from "./pages/ApiGateway";
import { StepFunctions } from "./pages/StepFunctions";
import { EventBridge } from "./pages/EventBridge";
import { Sqs } from "./pages/Sqs";
import { AppSync } from "./pages/AppSync";
import { Iam } from "./pages/Iam";
import { ServiceExplorer } from "./pages/ServiceExplorer";

export interface Health {
  endpoint: string;
  healthy: boolean;
  region: string | null;
  dedicated: boolean;
  account: string | null;
}

interface Regions {
  default: string;
  regions: string[];
  dedicated: Record<string, string>;
}

const PAGES: Record<string, (p: { segments: string[]; query: URLSearchParams }) => JSX.Element> = {
  dynamodb: DynamoDB,
  s3: S3,
  lambda: Lambda,
  apigateway: ApiGateway,
  stepfunctions: StepFunctions,
  eventbridge: EventBridge,
  sqs: Sqs,
  appsync: AppSync,
  iam: Iam,
};

function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("theme") ?? "dark";
    } catch {
      return "dark";
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* storage unavailable - theme just won't persist */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

function RegionSelect({ regions, active }: { regions: Regions | null; active: string }) {
  if (!regions) return null;
  const dedicated = Object.keys(regions.dedicated);
  const shared = regions.regions.filter((r) => !regions.dedicated[r]);
  return (
    <label className="region-select" title="Region for every console request">
      <span className="muted">Region</span>
      <select value={active} onChange={(e) => setRegion(e.target.value === regions.default ? null : e.target.value)}>
        {dedicated.length > 0 && (
          <optgroup label="Isolated emulators">
            {dedicated.map((r) => <option key={r} value={r}>{r}</option>)}
          </optgroup>
        )}
        <optgroup label={dedicated.length ? "Shared (default emulator)" : "Regions"}>
          {shared.map((r) => <option key={r} value={r}>{r}</option>)}
        </optgroup>
      </select>
    </label>
  );
}

export function App() {
  const route = useRoute();
  const [service, ...rest] = route.segments;
  const region = useRegion();
  const regions = useApi<Regions>("/regions");
  const health = useApi<Health>("/health");
  const catalog = useCatalog();
  const inventory = useInventory();
  const [theme, toggleTheme] = useTheme();
  const activeRegion = region ?? regions.data?.default ?? "us-east-1";
  const inv = inventory.data?.services ?? {};
  const active = activeServices(catalog ?? [], inv);
  const reloadInventory = inventory.reload;

  // Keep the sidebar current: resources are usually created outside the console (tests, CLI, seed).
  // The server rescans when its 30 s cache is stale.
  useEffect(() => {
    const timer = window.setInterval(reloadInventory, 15000);
    return () => window.clearInterval(timer);
  }, [reloadInventory]);

  // A stored region that no longer exists (e.g. emulators restarted without it) falls back to default.
  useEffect(() => {
    if (region && regions.data && !regions.data.regions.includes(region)) setRegion(null);
  }, [region, regions.data]);

  const PageComponent = service ? PAGES[service] : undefined;
  let page: JSX.Element;
  if (PageComponent) page = <PageComponent key={`${service}:${activeRegion}`} segments={rest} query={route.query} />;
  else if (service === "svc" && rest[0]) page = <ServiceExplorer key={`${rest[0]}:${activeRegion}`} service={rest[0]} query={route.query} />;
  else if (!service || service === "services") page = <Dashboard key={activeRegion} health={health.data} />;
  else page = <div className="page"><p className="empty">Unknown page.</p></div>;

  return (
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#/" style={{ textDecoration: "none" }}>
          <img className="logo" src="/logo.svg" alt="" />
          <span>
            Emulator UI
            <small>for AWS Emulator</small>
          </span>
        </a>
        <nav className="nav">
          <a href="#/" className={!service || service === "services" ? "active" : undefined}>
            <span className="nav-label">Dashboard</span>
            <span className="count">{catalog?.length ?? "–"}</span>
          </a>
        </nav>
        <div className="nav-section">Resources</div>
        <nav className="nav">
          {active.map((svc) => {
            const curated = curatedForCatalogId(svc.id);
            const link = curated ? href([curated.id]) : href(["svc", svc.id]);
            const isActive = curated ? service === curated.id : service === "svc" && rest[0] === svc.id;
            return (
              <a key={svc.id} href={link} className={isActive ? "active" : undefined} title={`${svc.fullName}: ${inv[svc.id].count} resource(s)`}>
                <span className="nav-label"><img className="svc-icon" src={iconUrl(svc.icon)} alt="" />{curated?.label ?? shortName(svc.fullName)}</span>
                <span className="count">{inv[svc.id].count}</span>
              </a>
            );
          })}
          {!active.length && (
            <p className="nav-empty">
              {!inventory.data || (inventory.data.scanning && !Object.keys(inv).length)
                ? "Scanning…"
                : health.data && !health.data.healthy
                  ? "Emulator is off."
                  : `No resources in ${activeRegion}.`}
            </p>
          )}
        </nav>
        <div className="sidebar-foot">
          Resources lists services that hold resources in {activeRegion}. All {catalog?.length ?? 436} services are on
          the Dashboard. State is in memory and lost when the emulator stops.
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <div className="status">
            <span className={`dot ${health.data?.healthy ? "ok" : ""}`} />
            {health.data?.healthy
              ? "Emulator healthy"
              : health.error
                ? "Console API unreachable"
                : health.data
                  ? "Emulator unreachable"
                  : "Connecting…"}
          </div>
          <span className="mono muted">{health.data?.endpoint}</span>
          {health.data?.dedicated && <span className="badge ok">isolated</span>}
          <span className="muted">{health.data?.account && `account ${health.data.account}`}</span>
          <span className="grow" />
          <RegionSelect regions={regions.data} active={activeRegion} />
          <button className="btn secondary small" onClick={() => { health.reload(); inventory.rescan(); }}>Refresh</button>
          <button className="btn secondary small" onClick={toggleTheme}>{theme === "dark" ? "Light" : "Dark"} mode</button>
        </div>
        {page}
      </main>
      <ConfirmHost />
    </div>
  );
}

import { useState } from "react";
import { api, useApi } from "../api";
import { ActionButton, Badge, Card, ErrorBox, Field, Json, Loading, Page, Table } from "../components";
import { formatDate } from "../lib/format";
import { href, navigate } from "../router";

interface RestApi { id: string; name: string; createdDate: string; description?: string }
interface HttpApi { ApiId: string; Name: string; ProtocolType: string; CreatedDate: string; ApiEndpoint: string }
interface Route { path?: string; method?: string; routeKey?: string; auth: string; integration: string; uri: string }
interface Detail { api: Record<string, any>; routes: Route[]; stages: Record<string, any>[]; invokeBase: string }

export function ApiGateway({ segments }: { segments: string[] }) {
  const [kind, id] = segments;
  return kind && id ? <ApiDetail kind={kind as "rest" | "http"} id={id} /> : <ApiList />;
}

function ApiList() {
  const rest = useApi<RestApi[]>("/apigateway/rest");
  const http = useApi<HttpApi[]>("/apigateway/http");
  return (
    <Page title="API Gateway" actions={<button className="btn secondary" onClick={() => { rest.reload(); http.reload(); }}>Refresh</button>}>
      <ErrorBox error={rest.error ?? http.error} />
      <Card title="REST APIs (v1)">
        <Loading show={rest.loading && !rest.data} />
        <Table rows={rest.data} rowKey={(a) => a.id} onRowClick={(a) => navigate(["apigateway", "rest", a.id])}
          columns={[
            { key: "name", label: "Name", render: (a) => <a href={href(["apigateway", "rest", a.id])}>{a.name}</a> },
            { key: "id", label: "API ID", className: "mono" },
            { key: "createdDate", label: "Created", render: (a) => formatDate(a.createdDate) },
          ]} />
      </Card>
      <Card title="HTTP / WebSocket APIs (v2)">
        <Table rows={http.data} rowKey={(a) => a.ApiId} onRowClick={(a) => navigate(["apigateway", "http", a.ApiId])}
          columns={[
            { key: "Name", label: "Name", render: (a) => <a href={href(["apigateway", "http", a.ApiId])}>{a.Name}</a> },
            { key: "ApiId", label: "API ID", className: "mono" },
            { key: "ProtocolType", label: "Protocol" },
            { key: "CreatedDate", label: "Created", render: (a) => formatDate(a.CreatedDate) },
          ]} />
      </Card>
    </Page>
  );
}

function ApiDetail({ kind, id }: { kind: "rest" | "http"; id: string }) {
  const d = useApi<Detail>(`/apigateway/${kind}/${encodeURIComponent(id)}`);
  const stages = d.data?.stages ?? [];
  const firstStage = stages[0]?.stageName ?? stages[0]?.StageName ?? "";
  const defaultPath = kind === "rest" ? `${firstStage}/` : "";
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [result, setResult] = useState<{ status: number; body: unknown; url: string } | null>(null);
  const name = d.data?.api.name ?? d.data?.api.Name ?? id;

  return (
    <Page title={name} crumbs={[{ label: "API Gateway", href: href(["apigateway"]) }, { label: name }]}>
      <ErrorBox error={d.error} />
      {d.data && (
        <Card title="Invoke URL">
          <p className="mono" style={{ margin: 0 }}>{d.data.invokeBase}{kind === "rest" ? "{stage}/" : ""}{"{path}"}</p>
          <p className="muted" style={{ marginBottom: 0 }}>
            On AWS this is <span className="mono">https://{id}.execute-api.&lt;region&gt;.amazonaws.com/…</span>; the emulator serves it under
            <span className="mono"> /_aws/execute-api/{id}</span>.
          </p>
        </Card>
      )}
      <Card title="Routes">
        <Table rows={d.data?.routes ?? null}
          onRowClick={(r) => {
            if (r.path) { setMethod(r.method === "ANY" ? "GET" : r.method!); setPath(`${firstStage}${r.path.replace(/\{[^}]+\}/g, "example")}`); }
            else if (r.routeKey) { const [m, p] = r.routeKey.split(" "); if (p) { setMethod(m === "ANY" ? "GET" : m); setPath(p.replace(/^\//, "").replace(/\{[^}]+\}/g, "example")); } }
          }}
          columns={kind === "rest"
            ? [
              { key: "method", label: "Method", render: (r) => <Badge value={r.method} /> },
              { key: "path", label: "Path", className: "mono" },
              { key: "integration", label: "Integration" },
              { key: "auth", label: "Auth" },
              { key: "uri", label: "Target", className: "mono" },
            ]
            : [
              { key: "routeKey", label: "Route", className: "mono" },
              { key: "integration", label: "Integration" },
              { key: "auth", label: "Auth" },
              { key: "uri", label: "Target", className: "mono" },
            ]} />
      </Card>
      <div className="grid-2">
        <Card title="Send request">
          <div className="stack">
            <div className="form-row">
              <Field label="Method">
                <select value={method} onChange={(e) => setMethod(e.target.value)}>
                  {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m}>{m}</option>)}
                </select>
              </Field>
              <Field label={kind === "rest" ? "Path (stage/resource?query)" : "Path (resource?query)"}>
                <input className="mono" value={path ?? defaultPath} onChange={(e) => setPath(e.target.value)} />
              </Field>
            </div>
            <label className="field"><span>Body</span>
              <textarea className="code" rows={6} value={body} onChange={(e) => setBody(e.target.value)} /></label>
            <ActionButton onClick={async () => setResult(await api.post("/apigateway/invoke", {
              apiId: id, path: path ?? defaultPath, method, body: body || null,
              headers: body ? { "content-type": "application/json" } : {},
            }))}>Send</ActionButton>
          </div>
        </Card>
        <Card title="Response" actions={result && <Badge value={String(result.status)} />}>
          {result ? <div className="stack"><span className="mono muted">{result.url}</span><Json value={result.body} /></div> : <p className="empty">Click a route or send a request.</p>}
        </Card>
      </div>
      <Card title="Stages"><Json value={stages} maxHeight={260} /></Card>
    </Page>
  );
}

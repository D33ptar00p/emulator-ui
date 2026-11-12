import { useState } from "react";
import { api, useApi } from "../api";
import { ActionButton, Badge, Card, ErrorBox, Json, JsonEditor, Kv, Loading, Page, Table, Tabs } from "../components";
import { formatDate, parseJson } from "../lib/format";
import { href, navigate } from "../router";

interface Fn { FunctionName: string; Runtime: string; Handler: string; MemorySize: number; Timeout: number; LastModified: string }
interface InvokeResult { statusCode: number; functionError: string | null; executedVersion: string; payload: unknown; log: string | null }

export function Lambda({ segments }: { segments: string[] }) {
  return segments[0] ? <FunctionDetail name={segments[0]} /> : <FunctionList />;
}

function FunctionList() {
  const fns = useApi<Fn[]>("/lambda/functions");
  return (
    <Page title="Lambda functions" actions={<button className="btn secondary" onClick={fns.reload}>Refresh</button>}>
      <ErrorBox error={fns.error} />
      <div className="notice">
        Function code runs in the emulator's embedded interpreter (RustPython / embedded JS), not the real Lambda runtimes.
      </div>
      <Card title="Functions">
        <Loading show={fns.loading && !fns.data} />
        <Table rows={fns.data} rowKey={(f) => f.FunctionName} onRowClick={(f) => navigate(["lambda", f.FunctionName])}
          columns={[
            { key: "FunctionName", label: "Name", render: (f) => <a href={href(["lambda", f.FunctionName])}>{f.FunctionName}</a> },
            { key: "Runtime", label: "Runtime" },
            { key: "Handler", label: "Handler" },
            { key: "MemorySize", label: "Memory (MB)" },
            { key: "Timeout", label: "Timeout (s)" },
            { key: "LastModified", label: "Modified", render: (f) => formatDate(f.LastModified) },
          ]} />
      </Card>
    </Page>
  );
}

function FunctionDetail({ name }: { name: string }) {
  const fn = useApi<Record<string, any>>(`/lambda/functions/${encodeURIComponent(name)}`);
  const [tab, setTab] = useState("Test");
  const [payload, setPayload] = useState('{\n  "key": "value"\n}');
  const [qualifier, setQualifier] = useState("");
  const [result, setResult] = useState<InvokeResult | null>(null);
  const cfg = fn.data?.Configuration ?? {};
  const parsed = parseJson(payload);

  return (
    <Page
      title={name}
      crumbs={[{ label: "Lambda", href: href(["lambda"]) }, { label: name }]}
      actions={
        <ActionButton variant="danger" confirm={`Delete function ${name}?`}
          onClick={async () => { await api.del(`/lambda/functions/${encodeURIComponent(name)}`); navigate(["lambda"]); }}>
          Delete
        </ActionButton>
      }
    >
      <ErrorBox error={fn.error} />
      {fn.data && (
        <Card>
          <Kv rows={[
            ["Runtime", cfg.Runtime],
            ["Handler", cfg.Handler],
            ["State", <Badge value={cfg.State} />],
            ["Memory / timeout", `${cfg.MemorySize} MB / ${cfg.Timeout}s`],
            ["Role", <span className="mono">{cfg.Role}</span>],
            ["ARN", <span className="mono">{cfg.FunctionArn}</span>],
          ]} />
        </Card>
      )}
      <Tabs tabs={["Test", "Configuration", "Permissions", "Versions"]} active={tab} onChange={setTab} />
      {tab === "Test" && (
        <div className="grid-2">
          <Card title="Event payload">
            <div className="stack">
              <JsonEditor value={payload} onChange={setPayload} rows={12} />
              <div className="form-row">
                <label className="field"><span>Qualifier (version/alias, optional)</span>
                  <input value={qualifier} onChange={(e) => setQualifier(e.target.value)} placeholder="$LATEST" /></label>
                <ActionButton disabled={!parsed.ok}
                  onClick={async () => setResult(await api.post<InvokeResult>(`/lambda/functions/${encodeURIComponent(name)}/invoke`, {
                    payload: parsed.ok ? parsed.value : null, qualifier: qualifier || null,
                  }))}>
                  Invoke
                </ActionButton>
              </div>
            </div>
          </Card>
          <Card title="Result" actions={result && <Badge value={result.functionError ?? String(result.statusCode)} />}>
            {result ? (
              <div className="stack">
                <Json value={result.payload} />
                {result.log && <><strong>Log tail</strong><Json value={result.log} /></>}
              </div>
            ) : <p className="empty">Invoke the function to see its response.</p>}
          </Card>
        </div>
      )}
      {tab === "Configuration" && <Json value={cfg} />}
      {tab === "Permissions" && (
        <Card title="Resource-based policy">{fn.data?.Policy ? <Json value={fn.data.Policy} /> : <p className="empty">No resource policy.</p>}</Card>
      )}
      {tab === "Versions" && (
        <div className="grid-2">
          <Card title="Versions"><Json value={fn.data?.Versions} /></Card>
          <Card title="Aliases"><Json value={fn.data?.Aliases} /></Card>
        </div>
      )}
    </Page>
  );
}

import { useApi } from "../api";
import { Badge, Card, ErrorBox, Json, Kv, Loading, Page, Table } from "../components";
import { arnName } from "../lib/format";
import { href, navigate } from "../router";

interface GraphqlApi { apiId: string; name: string; authenticationType: string; uris: Record<string, string> }
interface Detail {
  api: GraphqlApi & Record<string, unknown>;
  rootTypes: Record<string, string>;
  dataSources: { name: string; type: string; dynamodbConfig?: { tableName: string }; lambdaConfig?: { lambdaFunctionArn: string } }[];
  resolvers: { typeName: string; fieldName: string; dataSourceName?: string; kind: string; runtime?: { name: string } }[];
  apiKeys: { id: string; expires: number; description?: string }[];
}

export function AppSync({ segments }: { segments: string[] }) {
  return segments[0] ? <ApiDetail id={segments[0]} /> : <ApiList />;
}

function ApiList() {
  const apis = useApi<GraphqlApi[]>("/appsync/apis");
  return (
    <Page title="AppSync GraphQL APIs" actions={<button className="btn secondary" onClick={apis.reload}>Refresh</button>}>
      <ErrorBox error={apis.error} />
      <Card title="APIs">
        <Loading show={apis.loading && !apis.data} />
        <Table rows={apis.data} rowKey={(a) => a.apiId} onRowClick={(a) => navigate(["appsync", a.apiId])} columns={[
          { key: "name", label: "Name", render: (a) => <a href={href(["appsync", a.apiId])}>{a.name}</a> },
          { key: "apiId", label: "API ID", className: "mono" },
          { key: "authenticationType", label: "Auth" },
        ]} />
      </Card>
    </Page>
  );
}

function ApiDetail({ id }: { id: string }) {
  const d = useApi<Detail>(`/appsync/apis/${encodeURIComponent(id)}`);
  const name = d.data?.api.name ?? id;
  return (
    <Page title={name} crumbs={[{ label: "AppSync", href: href(["appsync"]) }, { label: name }]}>
      <ErrorBox error={d.error} />
      <div className="notice">
        The emulator does not serve the AppSync GraphQL endpoint yet, so queries can't be run from here. The schema shows
        root types only, because ListTypes and introspection return 501.
      </div>
      {d.data && (
        <Card><Kv rows={[
          ["Auth", d.data.api.authenticationType],
          ["GraphQL URI", <span className="mono">{d.data.api.uris?.GRAPHQL}</span>],
          ["API keys", String(d.data.apiKeys.length)],
        ]} /></Card>
      )}
      <div className="grid-2">
        <Card title="Data sources">
          <Table rows={d.data?.dataSources ?? null} rowKey={(s) => s.name} columns={[
            { key: "name", label: "Name" },
            { key: "type", label: "Type", render: (s) => <Badge value={s.type} /> },
            { key: "target", label: "Target", render: (s) => s.dynamodbConfig?.tableName ?? arnName(s.lambdaConfig?.lambdaFunctionArn) },
          ]} />
        </Card>
        <Card title="Resolvers">
          <Table rows={d.data?.resolvers ?? null} rowKey={(r) => `${r.typeName}.${r.fieldName}`} columns={[
            { key: "field", label: "Field", render: (r) => <span className="mono">{r.typeName}.{r.fieldName}</span> },
            { key: "dataSourceName", label: "Data source" },
            { key: "kind", label: "Kind" },
            { key: "runtime", label: "Runtime", render: (r) => r.runtime?.name ?? "VTL" },
          ]} />
        </Card>
      </div>
      <Card title="Schema (root types)">
        {d.data && Object.keys(d.data.rootTypes).length ? <Json value={Object.values(d.data.rootTypes).join("\n\n")} /> : <p className="empty">No schema.</p>}
      </Card>
    </Page>
  );
}

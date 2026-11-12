import { useEffect, useState } from "react";
import { api, q, useApi } from "../api";
import { ActionButton, Badge, Card, ErrorBox, Json, JsonEditor, Kv, Loading, Page, Table, Tabs } from "../components";
import { arnName, formatDate, parseJson } from "../lib/format";
import { href, navigate } from "../router";

interface Machine { stateMachineArn: string; name: string; type: string; creationDate: string }
interface Execution { executionArn: string; name: string; status: string; startDate: string; stopDate?: string }
interface HistoryEvent { id: number; type: string; timestamp: string; [k: string]: unknown }

export function StepFunctions({ segments, query }: { segments: string[]; query: URLSearchParams }) {
  if (segments[0] === "execution" && query.get("arn")) return <ExecutionDetail arn={query.get("arn")!} />;
  if (segments[0] === "machine" && query.get("arn")) return <MachineDetail arn={query.get("arn")!} />;
  return <MachineList />;
}

function MachineList() {
  const machines = useApi<Machine[]>("/stepfunctions/machines");
  return (
    <Page title="Step Functions" actions={<button className="btn secondary" onClick={machines.reload}>Refresh</button>}>
      <ErrorBox error={machines.error} />
      <Card title="State machines">
        <Loading show={machines.loading && !machines.data} />
        <Table rows={machines.data} rowKey={(m) => m.stateMachineArn}
          onRowClick={(m) => navigate(["stepfunctions", "machine"], { arn: m.stateMachineArn })}
          columns={[
            { key: "name", label: "Name", render: (m) => <a href={href(["stepfunctions", "machine"], { arn: m.stateMachineArn })}>{m.name}</a> },
            { key: "type", label: "Type", render: (m) => <Badge value={m.type} /> },
            { key: "creationDate", label: "Created", render: (m) => formatDate(m.creationDate) },
          ]} />
      </Card>
    </Page>
  );
}

function MachineDetail({ arn }: { arn: string }) {
  const d = useApi<{ machine: Record<string, any>; executions: Execution[] }>(`/stepfunctions/machine${q({ arn })}`);
  const [tab, setTab] = useState("Executions");
  const [input, setInput] = useState('{\n  "key": "value"\n}');
  const [syncResult, setSyncResult] = useState<unknown>(null);
  const parsed = parseJson(input);
  const def = d.data?.machine.definition as { StartAt?: string; States?: Record<string, any> } | undefined;
  const states = Object.entries(def?.States ?? {}).map(([name, s]) => ({
    name, type: s.Type, next: s.End ? "(end)" : s.Next ?? (s.Choices ? s.Choices.map((c: any) => c.Next).concat(s.Default ?? []).join(", ") : ""),
    resource: s.Resource ?? "",
  }));

  return (
    <Page title={arnName(arn)} crumbs={[{ label: "Step Functions", href: href(["stepfunctions"]) }, { label: arnName(arn) }]}>
      <ErrorBox error={d.error} />
      <div className="grid-2">
        <Card title="Start execution">
          <div className="stack">
            <JsonEditor value={input} onChange={setInput} rows={8} label="Input" />
            <ActionButton disabled={!parsed.ok} onClick={async () => {
              const r = await api.post<{ executionArn: string; sync?: unknown }>("/stepfunctions/machine/start", { arn, input: parsed.ok ? parsed.value : {} });
              if (r.sync) { setSyncResult(r.sync); d.reload(); } else navigate(["stepfunctions", "execution"], { arn: r.executionArn });
            }}>Start</ActionButton>
          </div>
        </Card>
        <Card title="Details">
          <Kv rows={[
            ["Type", <Badge value={d.data?.machine.type} />],
            ["Status", <Badge value={d.data?.machine.status} />],
            ["Start state", def?.StartAt],
            ["Role", <span className="mono">{d.data?.machine.roleArn}</span>],
          ]} />
          {syncResult !== null && <><h3>Express (sync) result</h3><Json value={syncResult} /></>}
        </Card>
      </div>
      <Tabs tabs={["Executions", "States", "Definition"]} active={tab} onChange={setTab} />
      {tab === "Executions" && (
        <Card actions={<button className="btn secondary small" onClick={d.reload}>Refresh</button>} title="Executions">
          <Table rows={d.data?.executions ?? null} rowKey={(e) => e.executionArn} empty="No executions yet."
            onRowClick={(e) => navigate(["stepfunctions", "execution"], { arn: e.executionArn })}
            columns={[
              { key: "name", label: "Name", className: "mono" },
              { key: "status", label: "Status", render: (e) => <Badge value={e.status} /> },
              { key: "startDate", label: "Started", render: (e) => formatDate(e.startDate) },
              { key: "stopDate", label: "Stopped", render: (e) => formatDate(e.stopDate) },
            ]} />
        </Card>
      )}
      {tab === "States" && (
        <Card title="States">
          <Table rows={states} rowKey={(s) => s.name} columns={[
            { key: "name", label: "State", render: (s) => <>{s.name}{s.name === def?.StartAt && <> <Badge value="start" /></>}</> },
            { key: "type", label: "Type" },
            { key: "next", label: "Next" },
            { key: "resource", label: "Resource", className: "mono" },
          ]} />
        </Card>
      )}
      {tab === "Definition" && <Json value={d.data?.machine.definition} />}
    </Page>
  );
}

function ExecutionDetail({ arn }: { arn: string }) {
  const d = useApi<{ execution: Record<string, any>; history: HistoryEvent[] }>(`/stepfunctions/execution${q({ arn })}`);
  const ex = d.data?.execution;
  const machineArn = ex?.stateMachineArn as string | undefined;
  const running = ex?.status === "RUNNING";
  const reload = d.reload;

  // Poll while the execution is still running.
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(reload, 1500);
    return () => window.clearInterval(timer);
  }, [running, reload]);
  return (
    <Page
      title={arnName(arn)}
      crumbs={[
        { label: "Step Functions", href: href(["stepfunctions"]) },
        { label: arnName(machineArn), href: machineArn ? href(["stepfunctions", "machine"], { arn: machineArn }) : undefined },
        { label: arnName(arn) },
      ]}
      actions={<button className="btn secondary" onClick={d.reload}>Refresh</button>}
    >
      <ErrorBox error={d.error} />
      {ex && (
        <Card>
          <Kv rows={[
            ["Status", <Badge value={ex.status} />],
            ["Started", formatDate(ex.startDate)],
            ["Stopped", formatDate(ex.stopDate)],
            ["Error", ex.error],
            ["Cause", ex.cause],
          ]} />
        </Card>
      )}
      <div className="grid-2">
        <Card title="Input"><Json value={ex?.input} /></Card>
        <Card title="Output"><Json value={ex?.output ?? null} /></Card>
      </div>
      <Card title="Event history">
        <Table rows={d.data?.history ?? null} rowKey={(e) => String(e.id)} columns={[
          { key: "id", label: "#" },
          { key: "type", label: "Type" },
          { key: "state", label: "State", render: (e) => ((e.stateEnteredEventDetails ?? e.stateExitedEventDetails) as { name?: string } | undefined)?.name ?? "" },
          { key: "timestamp", label: "Time", render: (e) => formatDate(e.timestamp) },
          {
            key: "detail", label: "Detail", className: "wrap",
            render: (e) => {
              const detail = Object.entries(e).find(([k]) => k.endsWith("EventDetails"))?.[1];
              return detail ? <span className="mono">{JSON.stringify(detail).slice(0, 240)}</span> : "";
            },
          },
        ]} />
      </Card>
    </Page>
  );
}

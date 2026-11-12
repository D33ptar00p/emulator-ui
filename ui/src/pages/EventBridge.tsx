import { useState } from "react";
import { api, q, useApi } from "../api";
import { ActionButton, Badge, Card, ErrorBox, Field, Json, JsonEditor, Page, Table } from "../components";
import { arnName, parseJson } from "../lib/format";
import { href } from "../router";

interface Bus { Name: string; Arn: string }
interface Rule { Name: string; State: string; EventPattern?: unknown; ScheduleExpression?: string; Targets: { Id: string; Arn: string }[] }

export function EventBridge({ segments }: { segments: string[] }) {
  const buses = useApi<Bus[]>("/eventbridge/buses");
  const bus = segments[0] ?? "default";
  const rules = useApi<Rule[]>(`/eventbridge/rules${q({ bus })}`);
  const [source, setSource] = useState("ai.move.capture");
  const [detailType, setDetailType] = useState("CaptureCompleted");
  const [detail, setDetail] = useState('{\n  "capture_id": "cap-1"\n}');
  const [result, setResult] = useState<unknown>(null);
  const parsed = parseJson(detail);

  return (
    <Page title="EventBridge" crumbs={[{ label: "EventBridge", href: href(["eventbridge"]) }, { label: bus }]}
      actions={<button className="btn secondary" onClick={() => { buses.reload(); rules.reload(); }}>Refresh</button>}>
      <ErrorBox error={buses.error ?? rules.error} />
      <Card title="Event buses">
        <Table rows={buses.data} rowKey={(b) => b.Name}
          onRowClick={(b) => (window.location.hash = href(["eventbridge", b.Name]))}
          columns={[
            { key: "Name", label: "Name", render: (b) => <>{b.Name === bus ? <strong>{b.Name}</strong> : b.Name}</> },
            { key: "Arn", label: "ARN", className: "mono" },
          ]} />
      </Card>
      <Card title={`Rules on ${bus}`}>
        <Table rows={rules.data} rowKey={(r) => r.Name} empty="No rules on this bus." columns={[
          { key: "Name", label: "Rule" },
          { key: "State", label: "State", render: (r) => <Badge value={r.State} /> },
          { key: "EventPattern", label: "Pattern / schedule", className: "wrap", render: (r) => <span className="mono">{r.ScheduleExpression ?? JSON.stringify(r.EventPattern)}</span> },
          { key: "Targets", label: "Targets", className: "wrap", render: (r) => r.Targets.map((t) => arnName(t.Arn)).join(", ") || "-" },
        ]} />
      </Card>
      <div className="grid-2">
        <Card title={`Send event to ${bus}`}>
          <div className="stack">
            <div className="form-row">
              <Field label="Source"><input value={source} onChange={(e) => setSource(e.target.value)} /></Field>
              <Field label="Detail type"><input value={detailType} onChange={(e) => setDetailType(e.target.value)} /></Field>
            </div>
            <JsonEditor value={detail} onChange={setDetail} label="Detail" rows={8} />
            <ActionButton disabled={!parsed.ok || !source || !detailType}
              onClick={async () => setResult(await api.post("/eventbridge/events", { bus, source, detailType, detail: parsed.ok ? parsed.value : {} }))}>
              Put event
            </ActionButton>
          </div>
        </Card>
        <Card title="Result">{result ? <Json value={result} /> : <p className="empty">Matching rules deliver to their targets. Check SQS or Lambda to see it arrive.</p>}</Card>
      </div>
    </Page>
  );
}

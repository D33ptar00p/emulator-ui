import { useState } from "react";
import { api, useApi } from "../api";
import { ActionButton, Card, ErrorBox, Json, Loading, Page, Table } from "../components";
import { href, navigate } from "../router";

interface Queue { url: string; name: string; QueueArn: string; ApproximateNumberOfMessages: string; ApproximateNumberOfMessagesNotVisible: string }
interface Message { MessageId: string; Body: string; Attributes?: Record<string, string> }

export function Sqs({ segments }: { segments: string[] }) {
  const queues = useApi<Queue[]>("/sqs/queues");
  const selected = queues.data?.find((qu) => qu.name === segments[0]);
  return (
    <Page title={selected ? selected.name : "SQS queues"}
      crumbs={selected ? [{ label: "SQS", href: href(["sqs"]) }, { label: selected.name }] : undefined}
      actions={<button className="btn secondary" onClick={queues.reload}>Refresh</button>}>
      <ErrorBox error={queues.error} />
      <Loading show={queues.loading && !queues.data} />
      {selected ? <QueueDetail queue={selected} onChange={queues.reload} /> : (
        <Card title="Queues">
          <Table rows={queues.data} rowKey={(qu) => qu.url} onRowClick={(qu) => navigate(["sqs", qu.name])} columns={[
            { key: "name", label: "Name", render: (qu) => <a href={href(["sqs", qu.name])}>{qu.name}</a> },
            { key: "ApproximateNumberOfMessages", label: "Available" },
            { key: "ApproximateNumberOfMessagesNotVisible", label: "In flight" },
            { key: "url", label: "URL", className: "mono" },
          ]} />
        </Card>
      )}
    </Page>
  );
}

function QueueDetail({ queue, onChange }: { queue: Queue; onChange: () => void }) {
  const [body, setBody] = useState('{"hello": "world"}');
  const [messages, setMessages] = useState<Message[] | null>(null);
  return (
    <div className="grid-2">
      <Card title="Send message">
        <div className="stack">
          <textarea className="code" rows={8} value={body} onChange={(e) => setBody(e.target.value)} />
          <ActionButton disabled={!body} onClick={async () => { await api.post("/sqs/send", { url: queue.url, body }); onChange(); }}>Send</ActionButton>
        </div>
      </Card>
      <Card title={`Messages (${queue.ApproximateNumberOfMessages} available)`}
        actions={
          <>
            <ActionButton variant="secondary" onClick={async () => setMessages(await api.post<Message[]>("/sqs/peek", { url: queue.url, max: 10 }))}>Peek</ActionButton>
            <ActionButton variant="danger" confirm={`Purge all messages in ${queue.name}?`}
              onClick={async () => { await api.post("/sqs/purge", { url: queue.url }); setMessages([]); onChange(); }}>Purge</ActionButton>
          </>
        }>
        <p className="muted" style={{ marginTop: 0 }}>Peek receives with visibility timeout 0, so messages are not consumed.</p>
        {messages && (messages.length ? messages.map((m) => (
          <div key={m.MessageId} className="stack" style={{ marginBottom: 12 }}>
            <span className="mono muted">{m.MessageId}</span>
            <Json value={(() => { try { return JSON.parse(m.Body); } catch { return m.Body; } })()} maxHeight={240} />
          </div>
        )) : <p className="empty">No messages.</p>)}
      </Card>
    </div>
  );
}

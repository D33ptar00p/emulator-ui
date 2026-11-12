import { useEffect, useState } from "react";
import { api, q, useApi } from "../api";
import { ActionButton, Badge, Card, ErrorBox, Field, Json, JsonEditor, Loading, Page, Table, Tabs } from "../components";
import { cell, columnsFor, formatDate, itemKey, parseJson, pretty } from "../lib/format";
import { href, navigate } from "../router";

interface TableSummary {
  name: string;
  status: string;
  itemCount: number;
  keys: Record<string, string>;
  indexes: string[];
  created: string;
}
type Item = Record<string, unknown>;

export function DynamoDB({ segments }: { segments: string[] }) {
  return segments[0] ? <TableDetail name={segments[0]} /> : <TableList />;
}

function TableList() {
  const tables = useApi<TableSummary[]>("/dynamodb/tables");
  const [form, setForm] = useState({ name: "", partitionKey: "id", partitionKeyType: "S", sortKey: "", sortKeyType: "S" });
  return (
    <Page title="DynamoDB tables" actions={<button className="btn secondary" onClick={tables.reload}>Refresh</button>}>
      <ErrorBox error={tables.error} />
      <Card title="Tables">
        <Loading show={tables.loading && !tables.data} />
        <Table
          rows={tables.data}
          rowKey={(t) => t.name}
          onRowClick={(t) => navigate(["dynamodb", t.name])}
          columns={[
            { key: "name", label: "Name", render: (t) => <a href={href(["dynamodb", t.name])}>{t.name}</a> },
            { key: "status", label: "Status", render: (t) => <Badge value={t.status} /> },
            { key: "keys", label: "Keys", render: (t) => Object.entries(t.keys).map(([k, v]) => `${v} (${k})`).join(", ") },
            { key: "indexes", label: "GSIs", render: (t) => t.indexes.join(", ") || "-" },
            { key: "itemCount", label: "Items" },
            { key: "created", label: "Created", render: (t) => formatDate(t.created) },
          ]}
        />
      </Card>
      <Card title="Create table">
        <div className="form-row">
          <Field label="Table name"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Partition key"><input value={form.partitionKey} onChange={(e) => setForm({ ...form, partitionKey: e.target.value })} /></Field>
          <Field label="Type"><TypeSelect value={form.partitionKeyType} onChange={(v) => setForm({ ...form, partitionKeyType: v })} /></Field>
          <Field label="Sort key (optional)"><input value={form.sortKey} onChange={(e) => setForm({ ...form, sortKey: e.target.value })} /></Field>
          <Field label="Type"><TypeSelect value={form.sortKeyType} onChange={(v) => setForm({ ...form, sortKeyType: v })} /></Field>
          <ActionButton
            disabled={!form.name || !form.partitionKey}
            onClick={async () => {
              await api.post("/dynamodb/tables", { ...form, sortKey: form.sortKey || null });
              setForm({ ...form, name: "" });
              tables.reload();
            }}
          >
            Create
          </ActionButton>
        </div>
        <p className="muted">On-demand (PAY_PER_REQUEST) billing.</p>
      </Card>
    </Page>
  );
}

function TypeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="S">String</option>
      <option value="N">Number</option>
      <option value="B">Binary</option>
    </select>
  );
}

function TableDetail({ name }: { name: string }) {
  const [tab, setTab] = useState("Items");
  const desc = useApi<Record<string, unknown>>(`/dynamodb/tables/${encodeURIComponent(name)}`);
  const keySchema = (desc.data?.KeySchema as { AttributeName: string; KeyType: string }[] | undefined) ?? [];
  const keys = Object.fromEntries(keySchema.map((k) => [k.KeyType, k.AttributeName]));
  return (
    <Page
      title={name}
      crumbs={[{ label: "DynamoDB", href: href(["dynamodb"]) }, { label: name }]}
      actions={
        <ActionButton variant="danger" confirm={`Delete table ${name}?`}
          onClick={async () => { await api.del(`/dynamodb/tables/${encodeURIComponent(name)}`); navigate(["dynamodb"]); }}>
          Delete table
        </ActionButton>
      }
    >
      <ErrorBox error={desc.error} />
      <Tabs tabs={["Items", "Schema"]} active={tab} onChange={setTab} />
      {tab === "Items" ? (keySchema.length > 0 && <Items table={name} keys={keys} />) : <Json value={desc.data} />}
    </Page>
  );
}

function Items({ table, keys }: { table: string; keys: Record<string, string> }) {
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const cursor = pages[pages.length - 1];
  const path = `/dynamodb/tables/${encodeURIComponent(table)}/items${q({ limit: 50, start: cursor })}`;
  const data = useApi<{ items: Item[]; next: string | null }>(path);
  const [editor, setEditor] = useState<string>("");
  const [selected, setSelected] = useState<Item | null>(null);

  useEffect(() => {
    if (!selected) setEditor(pretty(Object.fromEntries(Object.values(keys).map((k) => [k, ""]))));
  }, [keys, selected]);

  const items = data.data?.items ?? null;
  const cols = columnsFor(items ?? [], Object.values(keys));
  const parsed = parseJson(editor);

  return (
    <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(320px, 1fr)" }}>
      <Card
        title={`Items${items ? ` (${items.length}${data.data?.next ? "+" : ""})` : ""}`}
        actions={
          <>
            <button className="btn secondary small" disabled={pages.length < 2} onClick={() => setPages(pages.slice(0, -1))}>Prev</button>
            <button className="btn secondary small" disabled={!data.data?.next} onClick={() => setPages([...pages, data.data!.next])}>Next</button>
            <button className="btn secondary small" onClick={data.reload}>Refresh</button>
          </>
        }
      >
        <ErrorBox error={data.error} />
        <Table
          rows={items}
          empty="No items. Add one with the editor."
          onRowClick={(it) => { setSelected(it); setEditor(pretty(it)); }}
          columns={cols.map((c) => ({ key: c, label: c, render: (it: Item) => cell(it[c]) }))}
        />
      </Card>
      <Card title={selected ? "Edit item" : "New item"}
        actions={selected && <button className="btn secondary small" onClick={() => setSelected(null)}>New</button>}>
        <div className="stack">
          <JsonEditor value={editor} onChange={setEditor} rows={16} />
          <small className="muted">Numbers are stored as DynamoDB N. Binary: {"{\"__bytes__\": \"<base64>\"}"}.</small>
          <div className="actions">
            <ActionButton disabled={!parsed.ok}
              onClick={async () => { await api.put(`/dynamodb/tables/${encodeURIComponent(table)}/items`, { item: parsed.ok ? parsed.value : null }); data.reload(); }}>
              Save item
            </ActionButton>
            {selected && (
              <ActionButton variant="danger" confirm="Delete this item?"
                onClick={async () => {
                  await api.post(`/dynamodb/tables/${encodeURIComponent(table)}/items/delete`, { key: itemKey(selected, keys) });
                  setSelected(null);
                  data.reload();
                }}>
                Delete
              </ActionButton>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

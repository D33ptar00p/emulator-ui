import { useRef, useState } from "react";
import { api, q, useApi } from "../api";
import { ActionButton, Card, ErrorBox, Field, Json, Loading, Page, Table } from "../components";
import { formatBytes, formatDate } from "../lib/format";
import { href, navigate } from "../router";

interface Bucket { Name: string; CreationDate: string }
interface S3Object { Key: string; Size: number; LastModified: string; ETag: string }
interface Listing { prefixes: string[]; objects: S3Object[]; next: string | null }

export function S3({ segments, query }: { segments: string[]; query: URLSearchParams }) {
  return segments[0] ? <Browser bucket={segments[0]} prefix={query.get("prefix") ?? ""} /> : <Buckets />;
}

function Buckets() {
  const buckets = useApi<Bucket[]>("/s3/buckets");
  const [name, setName] = useState("");
  return (
    <Page title="S3 buckets" actions={<button className="btn secondary" onClick={buckets.reload}>Refresh</button>}>
      <ErrorBox error={buckets.error} />
      <Card title="Buckets">
        <Loading show={buckets.loading && !buckets.data} />
        <Table rows={buckets.data} rowKey={(b) => b.Name} onRowClick={(b) => navigate(["s3", b.Name])}
          columns={[
            { key: "Name", label: "Name", render: (b) => <a href={href(["s3", b.Name])}>{b.Name}</a> },
            { key: "CreationDate", label: "Created", render: (b) => formatDate(b.CreationDate) },
          ]} />
      </Card>
      <Card title="Create bucket">
        <div className="form-row">
          <Field label="Bucket name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-bucket" /></Field>
          <ActionButton disabled={!name} onClick={async () => { await api.post("/s3/buckets", { name }); setName(""); buckets.reload(); }}>Create</ActionButton>
        </div>
      </Card>
    </Page>
  );
}

function Browser({ bucket, prefix }: { bucket: string; prefix: string }) {
  const [tokens, setTokens] = useState<(string | null)[]>([null]);
  const listing = useApi<Listing>(`/s3/buckets/${encodeURIComponent(bucket)}/objects${q({ prefix, token: tokens[tokens.length - 1] })}`);
  const [meta, setMeta] = useState<unknown>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const objUrl = (key: string, download = false) =>
    `/api/s3/buckets/${encodeURIComponent(bucket)}/object${q({ key, download })}`;
  const parts = prefix.split("/").filter(Boolean);

  const rows = [
    ...(listing.data?.prefixes ?? []).map((p) => ({ kind: "folder" as const, key: p })),
    ...(listing.data?.objects ?? []).filter((o) => o.Key !== prefix).map((o) => ({ kind: "object" as const, key: o.Key, obj: o })),
  ];

  return (
    <Page
      title={bucket}
      crumbs={[
        { label: "S3", href: href(["s3"]) },
        { label: bucket, href: href(["s3", bucket]) },
        ...parts.map((p, i) => ({ label: p, href: href(["s3", bucket], { prefix: parts.slice(0, i + 1).join("/") + "/" }) })),
      ]}
      actions={
        <>
          <input ref={fileRef} type="file" multiple style={{ display: "none" }}
            onChange={async (e) => {
              for (const f of Array.from(e.target.files ?? [])) {
                const fd = new FormData();
                fd.append("file", f);
                fd.append("prefix", prefix);
                await api.post(`/s3/buckets/${encodeURIComponent(bucket)}/upload`, fd);
              }
              e.target.value = "";
              listing.reload();
            }} />
          <button className="btn" onClick={() => fileRef.current?.click()}>Upload</button>
          <button className="btn secondary" onClick={listing.reload}>Refresh</button>
          <ActionButton variant="danger" confirm={`Delete bucket ${bucket} and ALL its objects?`}
            onClick={async () => { await api.del(`/s3/buckets/${encodeURIComponent(bucket)}?force=true`); navigate(["s3"]); }}>
            Delete bucket
          </ActionButton>
        </>
      }
    >
      <ErrorBox error={listing.error} />
      <Card title={`Objects${prefix ? ` in ${prefix}` : ""}`}
        actions={
          <>
            <button className="btn secondary small" disabled={tokens.length < 2} onClick={() => setTokens(tokens.slice(0, -1))}>Prev</button>
            <button className="btn secondary small" disabled={!listing.data?.next} onClick={() => setTokens([...tokens, listing.data!.next])}>Next</button>
          </>
        }>
        <Table rows={listing.data ? rows : null} rowKey={(r) => r.key} empty="Empty. Upload files with the button above."
          columns={[
            {
              key: "key", label: "Name", render: (r) => r.kind === "folder"
                ? <a href={href(["s3", bucket], { prefix: r.key })}>📁 {r.key.slice(prefix.length)}</a>
                : <a href={objUrl(r.key)} target="_blank" rel="noreferrer">{r.key.slice(prefix.length)}</a>,
            },
            { key: "size", label: "Size", render: (r) => (r.kind === "object" ? formatBytes(r.obj.Size) : "") },
            { key: "mod", label: "Last modified", render: (r) => (r.kind === "object" ? formatDate(r.obj.LastModified) : "") },
            {
              key: "act", label: "", render: (r) => r.kind === "object" && (
                <span className="actions">
                  <a className="btn secondary small" href={objUrl(r.key, true)} onClick={(e) => e.stopPropagation()}>Download</a>
                  <ActionButton variant="secondary"
                    onClick={async () => setMeta(await api.get(`/s3/buckets/${encodeURIComponent(bucket)}/object/meta${q({ key: r.key })}`))}>
                    Info
                  </ActionButton>
                  <ActionButton variant="danger" confirm={`Delete ${r.key}?`}
                    onClick={async () => { await api.del(`/s3/buckets/${encodeURIComponent(bucket)}/object${q({ key: r.key })}`); listing.reload(); }}>
                    Delete
                  </ActionButton>
                </span>
              ),
            },
          ]} />
      </Card>
      {meta !== null && <Card title="Object metadata" actions={<button className="btn secondary small" onClick={() => setMeta(null)}>Close</button>}><Json value={meta} /></Card>}
    </Page>
  );
}

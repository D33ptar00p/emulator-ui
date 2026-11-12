import { useState } from "react";
import { useApi } from "../api";
import { Card, ErrorBox, Json, Loading, Page, Table } from "../components";
import { formatDate } from "../lib/format";

interface Role { RoleName: string; Arn: string; CreateDate: string; AssumeRolePolicyDocument: unknown; InlinePolicies: Record<string, unknown> }

export function Iam() {
  const roles = useApi<Role[]>("/iam/roles");
  const [selected, setSelected] = useState<Role | null>(null);
  return (
    <Page title="IAM roles" actions={<button className="btn secondary" onClick={roles.reload}>Refresh</button>}>
      <ErrorBox error={roles.error} />
      <div className="notice">
        The emulator doesn't evaluate IAM like AWS does. Execution-role policies are enforced for some service-to-service calls,
        such as Lambda and Step Functions.
      </div>
      <div className="grid-2" style={{ gridTemplateColumns: "minmax(0, 3fr) minmax(320px, 2fr)" }}>
        <Card title="Roles">
          <Loading show={roles.loading && !roles.data} />
          <Table rows={roles.data} rowKey={(r) => r.Arn} onRowClick={setSelected} columns={[
            { key: "RoleName", label: "Name" },
            { key: "trust", label: "Trusted services", render: (r) => trusted(r.AssumeRolePolicyDocument) },
            { key: "policies", label: "Inline policies", render: (r) => Object.keys(r.InlinePolicies).join(", ") || "-" },
            { key: "CreateDate", label: "Created", render: (r) => formatDate(r.CreateDate) },
          ]} />
        </Card>
        <Card title={selected ? selected.RoleName : "Role details"}>
          {selected ? (
            <div className="stack">
              <strong>Trust policy</strong>
              <Json value={selected.AssumeRolePolicyDocument} maxHeight={240} />
              <strong>Inline policies</strong>
              <Json value={selected.InlinePolicies} maxHeight={320} />
            </div>
          ) : <p className="empty">Select a role.</p>}
        </Card>
      </div>
    </Page>
  );
}

function trusted(doc: unknown): string {
  const parsed = typeof doc === "string" ? JSON.parse(decodeURIComponent(doc)) : doc;
  const statements = (parsed as { Statement?: { Principal?: { Service?: string | string[] } }[] })?.Statement ?? [];
  return statements.flatMap((s) => [s.Principal?.Service ?? []].flat()).map((s) => s.replace(".amazonaws.com", "")).join(", ");
}

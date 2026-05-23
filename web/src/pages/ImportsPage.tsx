import { useEffect, useMemo, useState } from "react";

import { Asset, ImportBatch } from "../api/client";
import { useWorkbench } from "../app/workbench";
import { EmptyState, Field, KeyValueList, MetricStrip, SectionHeader, ShortId, StructuredDetails } from "../components/common";
import { ResourceCard, ResourceTable, SplitWorkbench } from "../components/resource";
import { EntityNavLink, SelectableNameButton, shortId, statusBadge, useSelectedIdParam } from "./utils";

const IMPORT_STATUSES = ["PENDING", "IMPORTED", "PARTIALLY_IMPORTED", "FAILED", "CANCELLED"];
const SOURCE_TYPES = ["OTHER", "MANUAL_JSON", "STATIC_ANALYSIS", "DYNAMIC_ANALYSIS", "USER_REPORT"];
const CANDIDATE_TYPES = ["OBJECT", "MARK", "CHECK", "CASE", "FINDING", "RELATION", "EVIDENCE"];

export function ImportsPage() {
  const { api, selectedAssessmentId } = useWorkbench();
  const [rows, setRows] = useState<ImportBatch[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedId, setSelectedId] = useSelectedIdParam();
  const [error, setError] = useState("");

  const reload = async () => {
    if (!selectedAssessmentId) return;
    try {
      const [imports, assetRows] = await Promise.all([api.getImports(selectedAssessmentId), api.getAssets(selectedAssessmentId)]);
      setRows(imports);
      setAssets(assetRows);
      if (!selectedId && imports[0]?.id) {
        setSelectedId(String(imports[0].id));
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void reload();
  }, [selectedAssessmentId]);

  const selected = useMemo(() => rows.find((row) => String(row.id) === selectedId) ?? null, [rows, selectedId]);

  return (
    <main>
      <SectionHeader title="Imports" detail="Import batches with relink and candidate-output visibility." />
      <MetricStrip
        items={[
          { label: "Batches", value: rows.length },
          { label: "Imported", value: rows.filter((row) => row.status === "IMPORTED").length },
          { label: "Failures", value: rows.filter((row) => row.status === "FAILED").length },
        ]}
      />
      {error ? <div className="error-text">{error}</div> : null}
      <SplitWorkbench
        table={
          <ResourceCard title="Import Table">
            {rows.length ? (
              <ResourceTable
                columns={["Source", "Tool", "Asset", "Created", "Status", "ID"]}
                rows={rows.map((row) => [
                  <SelectableNameButton key={`${row.id}-pick`} selected={String(row.id) === selectedId} onClick={() => setSelectedId(String(row.id))}>
                    {row.source_name ?? "Import batch"}
                  </SelectableNameButton>,
                  row.tool_name ?? "—",
                  row.asset_id ? (
                    <EntityNavLink
                      key={`${row.id}-asset`}
                      type="ASSET"
                      id={String(row.asset_id)}
                      label={assets.find((asset) => asset.id === String(row.asset_id))?.name ?? `Asset ${shortId(String(row.asset_id))}`}
                    />
                  ) : "—",
                  String((row.summary as any)?.candidates_created ?? "0"),
                  statusBadge(row.status),
                  <ShortId key={`${row.id}-id`} value={String(row.id)} />,
                ])}
              />
            ) : (
              <EmptyState title="No imports" detail="Create or ingest batches and manage them from this table." />
            )}
          </ResourceCard>
        }
        drawer={
          selected ? (
            <div className="stack-blocks">
              <div>
                <h2>{selected.source_name ?? "Import batch"}</h2>
                <div className="small">{selected.tool_name ?? "tool"} · {shortId(String(selected.id))}</div>
              </div>
              <KeyValueList
                items={[
                  { label: "Status", value: statusBadge(selected.status) },
                  {
                    label: "Asset",
                    value: selected.asset_id ? (
                      <EntityNavLink
                        type="ASSET"
                        id={String(selected.asset_id)}
                        label={assets.find((asset) => asset.id === String(selected.asset_id))?.name ?? `Asset ${shortId(String(selected.asset_id))}`}
                      />
                    ) : "—",
                  },
                  { label: "Tool version", value: selected.tool_version ?? "—" },
                ]}
              />
              <form
                className="form-grid"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  await api.updateImport(String(selected.id), {
                    status: String(form.get("status") ?? selected.status ?? "IMPORTED"),
                    asset_id: String(form.get("asset_id") ?? "") || null,
                  });
                  await reload();
                }}
              >
                <div className="form-grid-2">
                  <Field label="Status">
                    <select name="status" defaultValue={selected.status ?? "IMPORTED"}>
                      {IMPORT_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </Field>
                  <Field label="Linked asset">
                    <select name="asset_id" defaultValue={selected.asset_id ? String(selected.asset_id) : ""}>
                      <option value="">Unlinked</option>
                      {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} ({asset.id.slice(0, 8)})</option>)}
                    </select>
                  </Field>
                </div>
                <button className="btn" type="submit">Save Import</button>
              </form>
              <StructuredDetails title="Summary" value={selected.summary} empty="No import summary." />
            </div>
          ) : (
            <EmptyState title="No import selected" detail="Pick a batch to relink assets or inspect candidate output." />
          )
        }
      />
      <ResourceCard title="Create Import">
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!selectedAssessmentId) {
              setError("Select assessment first");
              return;
            }
            const form = new FormData(event.currentTarget);
            const candidateTitle = String(form.get("candidate_title") ?? "").trim();
            await api.createImport(selectedAssessmentId, {
              source: {
                source_type: String(form.get("source_type") ?? "OTHER"),
                source_name: String(form.get("source_name") ?? "manual-web"),
                tool_name: String(form.get("tool_name") ?? "web"),
                tool_version: String(form.get("tool_version") ?? "0.1.0"),
              },
              asset_id: String(form.get("asset_id") ?? "") || null,
              candidates: candidateTitle ? [{
                candidate_type: String(form.get("candidate_type") ?? "OBJECT"),
                proposed_object_type: String(form.get("proposed_object_type") ?? ""),
                confidence: String(form.get("candidate_confidence") ?? "MEDIUM"),
                source: String(form.get("source_type") ?? "OTHER"),
                proposed_payload: {
                  title: candidateTitle,
                  name: candidateTitle,
                  locator: String(form.get("candidate_locator") ?? "") || undefined,
                  summary: String(form.get("candidate_summary") ?? "") || undefined,
                },
              }] : [],
            });
            (event.currentTarget as HTMLFormElement).reset();
            await reload();
          }}
        >
          <div className="form-grid-2">
            <Field label="Source type">
              <select name="source_type" defaultValue="OTHER">
                {SOURCE_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </Field>
            <Field label="Source name">
              <input name="source_name" defaultValue="manual-web" required />
            </Field>
            <Field label="Tool name">
              <input name="tool_name" defaultValue="web" />
            </Field>
            <Field label="Tool version">
              <input name="tool_version" defaultValue="0.1.0" />
            </Field>
            <Field label="Asset">
              <select name="asset_id" defaultValue="">
                <option value="">Unlinked</option>
                {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
              </select>
            </Field>
          </div>
          <ResourceCard title="Optional Seed Candidate" tone="compact">
            <div className="form-grid-2">
              <Field label="Candidate type">
                <select name="candidate_type" defaultValue="OBJECT">
                  {CANDIDATE_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </Field>
              <Field label="Proposed object type">
                <input name="proposed_object_type" placeholder="CODE" />
              </Field>
              <Field label="Title or name">
                <input name="candidate_title" placeholder="New finding candidate" />
              </Field>
              <Field label="Confidence">
                <select name="candidate_confidence" defaultValue="MEDIUM">
                  {["LOW", "MEDIUM", "HIGH", "UNKNOWN"].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </Field>
              <Field label="Locator">
                <input name="candidate_locator" placeholder="src/auth.ts:42" />
              </Field>
              <Field label="Summary">
                <input name="candidate_summary" placeholder="Short payload summary" />
              </Field>
            </div>
          </ResourceCard>
          <button className="btn" type="submit">Create Import</button>
        </form>
      </ResourceCard>
    </main>
  );
}

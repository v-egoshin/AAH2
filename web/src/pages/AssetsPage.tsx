import { useEffect, useMemo, useState } from "react";

import { Asset } from "../api/client";
import { useWorkbench } from "../app/workbench";
import { EmptyState, Field, KeyValueList, MetricStrip, SectionHeader, ShortId, StructuredDetails } from "../components/common";
import { LocatorLink } from "../components/locator";
import { ResourceCard, ResourceTable, SplitWorkbench } from "../components/resource";
import { SelectableNameButton, shortId, useSelectedIdParam } from "./utils";

const ASSET_TYPES = ["REPOSITORY", "FILE", "SERVICE", "ENDPOINT", "PACKAGE", "OTHER"];

export function AssetsPage() {
  const { api, selectedAssessmentId } = useWorkbench();
  const [rows, setRows] = useState<Asset[]>([]);
  const [selectedId, setSelectedId] = useSelectedIdParam();
  const [error, setError] = useState("");

  const reload = async () => {
    if (!selectedAssessmentId) {
      return;
    }
    try {
      const data = await api.getAssets(selectedAssessmentId);
      setRows(data);
      if (!selectedId && data[0]?.id) {
        setSelectedId(data[0].id);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void reload();
  }, [selectedAssessmentId]);

  const selected = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId]);

  return (
    <main>
      <SectionHeader title="Assets" detail="Dense asset inventory with inline edits and source locators." />
      <MetricStrip
        items={[
          { label: "Assets", value: rows.length },
          { label: "Repository assets", value: rows.filter((row) => row.type === "REPOSITORY").length },
          { label: "With locators", value: rows.filter((row) => row.locator).length },
        ]}
      />
      {error ? <div className="error-text">{error}</div> : null}
      <SplitWorkbench
        table={
          <ResourceCard title="Asset Table">
            {rows.length ? (
              <ResourceTable
                columns={["Type", "Name", "Locator", "Version", "ID"]}
                rows={rows.map((row) => [
                  row.type,
                  <SelectableNameButton key={`${row.id}-pick`} selected={row.id === selectedId} onClick={() => setSelectedId(row.id)}>{row.name}</SelectableNameButton>,
                  <LocatorLink key={`${row.id}-locator`} locator={row.locator} assetId={row.id} />,
                  row.version_ref ?? "—",
                  <ShortId key={`${row.id}-id`} value={row.id} />,
                ])}
              />
            ) : (
              <EmptyState title="No assets" detail="Create an asset to attach objects, imports, and review context." />
            )}
          </ResourceCard>
        }
        drawer={
          selected ? (
            <div className="stack-blocks">
              <div>
                <h2>{selected.name}</h2>
                <div className="small">{selected.type} · {shortId(selected.id)}</div>
              </div>
              <KeyValueList
                items={[
                  { label: "Locator", value: <LocatorLink locator={selected.locator} assetId={selected.id} /> },
                  { label: "Version", value: selected.version_ref ?? "—" },
                  { label: "Full ID", value: selected.id },
                ]}
              />
              <ResourceCard title="Edit Asset" tone="compact">
                <form
                  className="form-grid"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    await api.updateAsset(selected.id, {
                      name: String(form.get("name") ?? selected.name),
                      locator: String(form.get("locator") ?? selected.locator ?? ""),
                      version_ref: String(form.get("version_ref") ?? selected.version_ref ?? ""),
                      metadata: {
                        repo: String(form.get("metadata_repo") ?? ""),
                        owner: String(form.get("metadata_owner") ?? ""),
                      },
                    });
                    await reload();
                  }}
                >
                  <Field label="Name">
                    <input name="name" defaultValue={selected.name} />
                  </Field>
                  <Field label="Type">
                    <select name="type" defaultValue={selected.type} disabled>
                      {ASSET_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </Field>
                  <Field label="Locator">
                    <input name="locator" defaultValue={selected.locator ?? ""} />
                  </Field>
                  <Field label="Version ref">
                    <input name="version_ref" defaultValue={selected.version_ref ?? ""} />
                  </Field>
                  <div className="form-grid-2">
                    <Field label="Metadata repo">
                      <input name="metadata_repo" defaultValue={String((selected.metadata as any)?.repo ?? "")} />
                    </Field>
                    <Field label="Metadata owner">
                      <input name="metadata_owner" defaultValue={String((selected.metadata as any)?.owner ?? "")} />
                    </Field>
                  </div>
                  <button className="btn" type="submit">Save Asset</button>
                </form>
              </ResourceCard>
              <StructuredDetails title="Metadata" value={selected.metadata} empty="No metadata on this asset." />
            </div>
          ) : (
            <EmptyState title="No asset selected" detail="Pick a row to open its compact detail drawer." />
          )
        }
      />
      <ResourceCard title="Create Asset">
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!selectedAssessmentId) {
              setError("Select assessment first");
              return;
            }
            const form = new FormData(event.currentTarget);
            await api.createAsset(selectedAssessmentId, {
              type: String(form.get("type") ?? "REPOSITORY"),
              name: String(form.get("name") ?? ""),
              locator: String(form.get("locator") ?? "") || null,
              version_ref: String(form.get("version_ref") ?? "") || null,
              metadata: {
                repo: String(form.get("metadata_repo") ?? ""),
                owner: String(form.get("metadata_owner") ?? ""),
              },
            });
            (event.currentTarget as HTMLFormElement).reset();
            await reload();
          }}
        >
          <div className="form-grid-2">
            <Field label="Type">
              <select name="type" defaultValue="REPOSITORY">
                {ASSET_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </Field>
            <Field label="Name">
              <input name="name" placeholder="AAH2" required />
            </Field>
            <Field label="Locator">
              <input name="locator" placeholder="src/main.ts:1" />
            </Field>
            <Field label="Version ref">
              <input name="version_ref" placeholder="main" />
            </Field>
            <Field label="Metadata repo">
              <input name="metadata_repo" placeholder="AAH2" />
            </Field>
            <Field label="Metadata owner">
              <input name="metadata_owner" placeholder="team" />
            </Field>
          </div>
          <button className="btn" type="submit">Create Asset</button>
        </form>
      </ResourceCard>
    </main>
  );
}

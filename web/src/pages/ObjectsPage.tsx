import { useEffect, useMemo, useState } from "react";

import { Asset, ObjectRecord, RelationRecord } from "../api/client";
import { useWorkbench } from "../app/workbench";
import { EmptyState, Field, KeyValueList, MetricStrip, SectionHeader, ShortId, StructuredDetails } from "../components/common";
import { LocatorLink } from "../components/locator";
import { ResourceCard, ResourceTable, SplitWorkbench } from "../components/resource";
import { countRelations, EntityNavLink, SelectableNameButton, shortId, useSelectedIdParam } from "./utils";

export function ObjectsPage() {
  const { api, selectedAssessmentId } = useWorkbench();
  const [rows, setRows] = useState<ObjectRecord[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [relations, setRelations] = useState<RelationRecord[]>([]);
  const [selectedId, setSelectedId] = useSelectedIdParam();
  const [error, setError] = useState("");

  const reload = async () => {
    if (!selectedAssessmentId) return;
    try {
      const [objects, assetRows, relationRows] = await Promise.all([api.getObjects(selectedAssessmentId), api.getAssets(selectedAssessmentId), api.getRelations(selectedAssessmentId)]);
      setRows(objects);
      setAssets(assetRows);
      setRelations(relationRows);
      if (!selectedId && objects[0]?.id) {
        setSelectedId(objects[0].id);
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
      <SectionHeader title="Objects" detail="Code-adjacent objects with locator-first navigation and lightweight linking." />
      <MetricStrip items={[{ label: "Objects", value: rows.length }, { label: "With locators", value: rows.filter((row) => row.locator).length }]} />
      {error ? <div className="error-text">{error}</div> : null}
      <SplitWorkbench
        table={
          <ResourceCard title="Object Table">
            {rows.length ? (
              <ResourceTable
                columns={["Type", "Kind", "Name", "Asset", "Locator", "Relations", "ID"]}
                rows={rows.map((row) => [
                  row.type,
                  row.kind,
                  <SelectableNameButton key={`${row.id}-pick`} selected={row.id === selectedId} onClick={() => setSelectedId(row.id)}>{row.name}</SelectableNameButton>,
                  row.asset_id ? <EntityNavLink key={`${row.id}-asset`} type="ASSET" id={row.asset_id} label={assets.find((asset) => asset.id === row.asset_id)?.name ?? `Asset ${shortId(row.asset_id)}`} /> : "—",
                  <LocatorLink key={`${row.id}-locator`} locator={row.locator} assetId={row.asset_id} />,
                  String(countRelations(row.id, relations)),
                  <ShortId key={`${row.id}-id`} value={row.id} />,
                ])}
              />
            ) : (
              <EmptyState title="No objects" detail="Create objects from code context and attach marks, checks, or evidence." />
            )}
          </ResourceCard>
        }
        drawer={
          selected ? (
            <div className="stack-blocks">
              <div>
                <h2>{selected.name}</h2>
                <div className="small">{selected.kind} · {shortId(selected.id)}</div>
              </div>
              <KeyValueList
                items={[
                  { label: "Type", value: selected.type },
                  { label: "Locator", value: <LocatorLink locator={selected.locator} assetId={selected.asset_id} /> },
                  { label: "Relations", value: countRelations(selected.id, relations) },
                  { label: "Full ID", value: selected.id },
                ]}
              />
              <form
                className="form-grid"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  const rangeFile = String(form.get("range_file") ?? "").trim();
                  const startLine = Number(form.get("start_line") || 0) || undefined;
                  const endLine = Number(form.get("end_line") || 0) || undefined;
                  await api.updateObject(selected.id, {
                    name: String(form.get("name") ?? selected.name),
                    type: String(form.get("type") ?? selected.type),
                    kind: String(form.get("kind") ?? selected.kind),
                    locator: String(form.get("locator") ?? selected.locator ?? ""),
                    asset_id: String(form.get("asset_id") ?? "") || null,
                    range: rangeFile ? { file: rangeFile, start_line: startLine, end_line: endLine ?? startLine } : null,
                  });
                  await reload();
                }}
              >
                <div className="form-grid-2">
                  <Field label="Name">
                    <input name="name" defaultValue={selected.name} />
                  </Field>
                  <Field label="Type">
                    <input name="type" defaultValue={selected.type} />
                  </Field>
                  <Field label="Kind">
                    <input name="kind" defaultValue={selected.kind} />
                  </Field>
                  <Field label="Asset">
                    <select name="asset_id" defaultValue={selected.asset_id ?? ""}>
                      <option value="">Unlinked</option>
                      {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name} ({asset.id.slice(0, 8)})</option>)}
                    </select>
                  </Field>
                  <Field label="Locator">
                    <input name="locator" defaultValue={selected.locator ?? ""} />
                  </Field>
                  <Field label="Range file">
                    <input name="range_file" defaultValue={String((selected.range as any)?.file ?? "")} />
                  </Field>
                  <Field label="Start line">
                    <input name="start_line" type="number" min="1" defaultValue={String((selected.range as any)?.start_line ?? "")} />
                  </Field>
                  <Field label="End line">
                    <input name="end_line" type="number" min="1" defaultValue={String((selected.range as any)?.end_line ?? "")} />
                  </Field>
                </div>
                <button className="btn" type="submit">Save Object</button>
              </form>
              <StructuredDetails title="Range" value={selected.range} empty="No line range recorded." />
              <StructuredDetails title="Properties" value={selected.properties} empty="No object properties." />
            </div>
          ) : (
            <EmptyState title="No object selected" detail="Pick an object to edit labels, locator, and linked asset." />
          )
        }
      />
      <ResourceCard title="Create Object">
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!selectedAssessmentId) {
              setError("Select assessment first");
              return;
            }
            const form = new FormData(event.currentTarget);
            const rangeFile = String(form.get("range_file") ?? "").trim();
            const startLine = Number(form.get("start_line") || 0) || undefined;
            const endLine = Number(form.get("end_line") || 0) || undefined;
            await api.createObject(selectedAssessmentId, {
              asset_id: String(form.get("asset_id") ?? "") || null,
              type: String(form.get("type") ?? "CODE"),
              kind: String(form.get("kind") ?? "FUNCTION"),
              name: String(form.get("name") ?? ""),
              locator: String(form.get("locator") ?? "") || null,
              range: rangeFile ? { file: rangeFile, start_line: startLine, end_line: endLine ?? startLine } : null,
              properties: {
                signature: String(form.get("signature") ?? ""),
              },
              source: "OTHER",
            });
            (event.currentTarget as HTMLFormElement).reset();
            await reload();
          }}
        >
          <div className="form-grid-2">
            <Field label="Asset">
              <select name="asset_id" defaultValue="">
                <option value="">Unlinked</option>
                {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name}</option>)}
              </select>
            </Field>
            <Field label="Type">
              <input name="type" defaultValue="CODE" />
            </Field>
            <Field label="Kind">
              <input name="kind" defaultValue="FUNCTION" />
            </Field>
            <Field label="Name">
              <input name="name" defaultValue="handleLogin" required />
            </Field>
            <Field label="Locator">
              <input name="locator" placeholder="src/auth.ts:42" />
            </Field>
            <Field label="Signature">
              <input name="signature" placeholder="handleLogin(user, pass)" />
            </Field>
            <Field label="Range file">
              <input name="range_file" placeholder="src/auth.ts" />
            </Field>
            <Field label="Start line">
              <input name="start_line" type="number" min="1" />
            </Field>
            <Field label="End line">
              <input name="end_line" type="number" min="1" />
            </Field>
          </div>
          <button className="btn" type="submit">Create Object</button>
        </form>
      </ResourceCard>
    </main>
  );
}

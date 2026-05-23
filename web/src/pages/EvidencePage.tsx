import { useEffect, useMemo, useState } from "react";

import { EvidenceRecord } from "../api/client";
import { useWorkbench } from "../app/workbench";
import { EmptyState, Field, MetricStrip, SectionHeader, ShortId, StructuredDetails } from "../components/common";
import { ResourceCard, ResourceTable, SplitWorkbench } from "../components/resource";
import { SelectableNameButton, shortId, useSelectedIdParam } from "./utils";

export function EvidencePage() {
  const { api, selectedAssessmentId } = useWorkbench();
  const [rows, setRows] = useState<EvidenceRecord[]>([]);
  const [selectedId, setSelectedId] = useSelectedIdParam();
  const [error, setError] = useState("");

  const reload = async () => {
    if (!selectedAssessmentId) return;
    try {
      const data = await api.getEvidence(selectedAssessmentId);
      setRows(data);
      if (!selectedId && data[0]?.id) {
        setSelectedId(data[0].id);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => { void reload(); }, [selectedAssessmentId]);
  const selected = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId]);

  return (
    <main>
      <SectionHeader title="Evidence" detail="Evidence summaries and content through editable drawers and forms." />
      <MetricStrip items={[{ label: "Evidence", value: rows.length }, { label: "High confidence", value: rows.filter((row) => row.confidence === "HIGH").length }]} />
      {error ? <div className="error-text">{error}</div> : null}
      <SplitWorkbench
        table={<ResourceCard title="Evidence Table">{rows.length ? <ResourceTable columns={["Title", "Type", "Confidence", "ID"]} rows={rows.map((row) => [<SelectableNameButton key={row.id} selected={row.id === selectedId} onClick={() => setSelectedId(row.id)}>{row.title}</SelectableNameButton>, row.evidence_type, row.confidence ?? "—", <ShortId key={`${row.id}-id`} value={row.id} />])} /> : <EmptyState title="No evidence" detail="Attach evidence to checks, cases, findings, or marks." />}</ResourceCard>}
        drawer={selected ? <div className="stack-blocks"><div><h2>{selected.title}</h2><div className="small">{selected.evidence_type} · {shortId(selected.id)}</div></div><form className="form-grid" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await api.updateEvidence(selected.id, { title: String(form.get("title") ?? selected.title), evidence_type: String(form.get("evidence_type") ?? selected.evidence_type), summary: String(form.get("summary") ?? selected.summary), content: String(form.get("content") ?? selected.content), confidence: String(form.get("confidence") ?? selected.confidence ?? "MEDIUM") }); await reload(); }}><div className="form-grid-2"><Field label="Title"><input name="title" defaultValue={selected.title} /></Field><Field label="Type"><input name="evidence_type" defaultValue={selected.evidence_type} /></Field><Field label="Confidence"><select name="confidence" defaultValue={selected.confidence ?? "MEDIUM"}>{["LOW", "MEDIUM", "HIGH", "UNKNOWN"].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field></div><Field label="Summary"><textarea name="summary" rows={3} defaultValue={selected.summary} /></Field><Field label="Content"><textarea name="content" rows={8} defaultValue={selected.content} /></Field><button className="btn" type="submit">Save Evidence</button></form><StructuredDetails title="Properties" value={selected.properties} empty="No evidence properties." /></div> : <EmptyState title="No evidence selected" detail="Pick a row to inspect or edit evidence content." />}
      />
      <ResourceCard title="Create Evidence"><form className="form-grid" onSubmit={async (event) => { event.preventDefault(); if (!selectedAssessmentId) { setError("Select assessment first"); return; } const form = new FormData(event.currentTarget); const linkObjectId = String(form.get("link_object_id") ?? ""); await api.createEvidence(selectedAssessmentId, { title: String(form.get("title") ?? ""), evidence_type: String(form.get("evidence_type") ?? "SCREENSHOT"), summary: String(form.get("summary") ?? ""), content: String(form.get("content") ?? ""), confidence: String(form.get("confidence") ?? "MEDIUM"), source: "OTHER", properties: {}, link_to: linkObjectId ? [{ object_type: String(form.get("link_object_type") ?? "FINDING"), object_id: linkObjectId, predicate: String(form.get("link_predicate") ?? "SUPPORTS") }] : [] }); (event.currentTarget as HTMLFormElement).reset(); await reload(); }}><div className="form-grid-2"><Field label="Title"><input name="title" defaultValue="Screenshot of vulnerable flow" required /></Field><Field label="Type"><input name="evidence_type" defaultValue="SCREENSHOT" /></Field><Field label="Confidence"><select name="confidence" defaultValue="MEDIUM">{["LOW", "MEDIUM", "HIGH", "UNKNOWN"].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field></div><Field label="Summary"><textarea name="summary" rows={3} defaultValue="UI path to risky action" /></Field><Field label="Content"><textarea name="content" rows={6} defaultValue="Describe or paste evidence here" /></Field><ResourceCard title="Optional Link" tone="compact"><div className="form-grid-2"><Field label="Object type"><input name="link_object_type" defaultValue="FINDING" /></Field><Field label="Object ID"><input name="link_object_id" placeholder="Optional UUID" /></Field><Field label="Predicate"><input name="link_predicate" defaultValue="SUPPORTS" /></Field></div></ResourceCard><button className="btn" type="submit">Create Evidence</button></form></ResourceCard>
    </main>
  );
}

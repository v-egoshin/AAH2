import { useEffect, useMemo, useState } from "react";

import { FindingRecord } from "../api/client";
import { useWorkbench } from "../app/workbench";
import { EmptyState, Field, MetricStrip, SectionHeader, ShortId, StructuredDetails } from "../components/common";
import { ResourceCard, ResourceTable, SplitWorkbench } from "../components/resource";
import { SelectableNameButton, shortId, statusBadge, useSelectedIdParam } from "./utils";

export function FindingsPage() {
  const { api, selectedAssessmentId } = useWorkbench();
  const [rows, setRows] = useState<FindingRecord[]>([]);
  const [selectedId, setSelectedId] = useSelectedIdParam();
  const [error, setError] = useState("");

  const reload = async () => {
    if (!selectedAssessmentId) return;
    try {
      const data = await api.getFindings(selectedAssessmentId);
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
      <SectionHeader title="Findings" detail="Severity and status edits through structured controls only." />
      <MetricStrip items={[{ label: "Findings", value: rows.length }, { label: "Open", value: rows.filter((row) => row.status === "OPEN").length }]} />
      {error ? <div className="error-text">{error}</div> : null}
      <SplitWorkbench
        table={<ResourceCard title="Finding Table">{rows.length ? <ResourceTable columns={["Title", "Severity", "Type", "Status", "ID"]} rows={rows.map((row) => [<SelectableNameButton key={row.id} selected={row.id === selectedId} onClick={() => setSelectedId(row.id)}>{row.title}</SelectableNameButton>, row.severity, row.finding_type, statusBadge(row.status), <ShortId key={`${row.id}-id`} value={row.id} />])} /> : <EmptyState title="No findings" detail="Create findings directly or derive them from failed checks." />}</ResourceCard>}
        drawer={selected ? <div className="stack-blocks"><div><h2>{selected.title}</h2><div className="small">{selected.finding_type} · {shortId(selected.id)}</div></div><form className="form-grid" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await api.updateFinding(selected.id, { title: String(form.get("title") ?? selected.title), severity: String(form.get("severity") ?? selected.severity), status: String(form.get("status") ?? selected.status), finding_type: String(form.get("finding_type") ?? selected.finding_type), description: String(form.get("description") ?? selected.description), impact: String(form.get("impact") ?? selected.impact), recommendation: String(form.get("recommendation") ?? selected.recommendation) }); await reload(); }}><div className="form-grid-2"><Field label="Title"><input name="title" defaultValue={selected.title} /></Field><Field label="Finding type"><input name="finding_type" defaultValue={selected.finding_type} /></Field><Field label="Severity"><select name="severity" defaultValue={selected.severity}>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field><Field label="Status"><select name="status" defaultValue={selected.status}>{["OPEN", "NEEDS_REVIEW", "ACCEPTED", "RESOLVED", "CLOSED"].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field></div><Field label="Description"><textarea name="description" rows={3} defaultValue={selected.description} /></Field><Field label="Impact"><textarea name="impact" rows={3} defaultValue={selected.impact} /></Field><Field label="Recommendation"><textarea name="recommendation" rows={4} defaultValue={selected.recommendation} /></Field><button className="btn" type="submit">Save Finding</button></form><StructuredDetails title="Finding Snapshot" value={{ description: selected.description, impact: selected.impact }} empty="No finding details." /></div> : <EmptyState title="No finding selected" detail="Pick a finding to update its severity or workflow state." />}
      />
      <ResourceCard title="Create Finding"><form className="form-grid" onSubmit={async (event) => { event.preventDefault(); if (!selectedAssessmentId) { setError("Select assessment first"); return; } const form = new FormData(event.currentTarget); await api.createFinding(selectedAssessmentId, { title: String(form.get("title") ?? ""), severity: String(form.get("severity") ?? "HIGH"), finding_type: String(form.get("finding_type") ?? "INJECTION"), description: String(form.get("description") ?? ""), impact: String(form.get("impact") ?? ""), recommendation: String(form.get("recommendation") ?? "") }); (event.currentTarget as HTMLFormElement).reset(); await reload(); }}><div className="form-grid-2"><Field label="Title"><input name="title" defaultValue="Command injection in admin import" required /></Field><Field label="Finding type"><input name="finding_type" defaultValue="INJECTION" /></Field><Field label="Severity"><select name="severity" defaultValue="HIGH">{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field></div><Field label="Description"><textarea name="description" rows={3} defaultValue="Unsanitized shell invocation" /></Field><Field label="Impact"><textarea name="impact" rows={3} defaultValue="Remote command execution" /></Field><Field label="Recommendation"><textarea name="recommendation" rows={4} defaultValue="Use parameterized process APIs" /></Field><button className="btn" type="submit">Create Finding</button></form></ResourceCard>
    </main>
  );
}

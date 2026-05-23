import { useEffect, useMemo, useState } from "react";

import { Candidate, CaseRecord, CheckRecord, FindingRecord, MarkRecord, ObjectRecord, RelationRecord } from "../api/client";
import { useWorkbench } from "../app/workbench";
import { EmptyState, Field, MetricStrip, SectionHeader, ShortId, StructuredDetails } from "../components/common";
import { ResourceCard, ResourceTable, SplitWorkbench } from "../components/resource";
import { EntityNavLink, SelectableNameButton, shortId, statusBadge, useSelectedIdParam } from "./utils";

export function RelationsPage() {
  const { api, selectedAssessmentId } = useWorkbench();
  const [rows, setRows] = useState<RelationRecord[]>([]);
  const [marks, setMarks] = useState<MarkRecord[]>([]);
  const [checks, setChecks] = useState<CheckRecord[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [findings, setFindings] = useState<FindingRecord[]>([]);
  const [objects, setObjects] = useState<ObjectRecord[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useSelectedIdParam();
  const [error, setError] = useState("");

  const reload = async () => {
    if (!selectedAssessmentId) return;
    try {
      const [relationRows, markRows, checkRows, caseRows, findingRows, objectRows, candidateRows] = await Promise.all([
        api.getRelations(selectedAssessmentId),
        api.getMarks(selectedAssessmentId),
        api.getChecks(selectedAssessmentId),
        api.getCases(selectedAssessmentId),
        api.getFindings(selectedAssessmentId),
        api.getObjects(selectedAssessmentId),
        api.getCandidates(selectedAssessmentId),
      ]);
      setRows(relationRows.filter((row) => row.subject_type !== "EVIDENCE" && row.object_type !== "EVIDENCE"));
      setMarks(markRows);
      setChecks(checkRows);
      setCases(caseRows);
      setFindings(findingRows);
      setObjects(objectRows);
      setCandidates(candidateRows);
      if (!selectedId && relationRows[0]?.id) {
        setSelectedId(relationRows[0].id);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => { void reload(); }, [selectedAssessmentId]);
  const selected = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId]);

  const resolveEntityLabel = (type: string, id: string) => {
    const normalized = type.toUpperCase();
    if (normalized === "MARK") {
      return marks.find((item) => item.id === id)?.title;
    }
    if (normalized === "CHECK") {
      return checks.find((item) => item.id === id)?.title;
    }
    if (normalized === "CASE") {
      return cases.find((item) => item.id === id)?.title;
    }
    if (normalized === "FINDING") {
      return findings.find((item) => item.id === id)?.title;
    }
    if (normalized === "OBJECT") {
      return objects.find((item) => item.id === id)?.name;
    }
    if (normalized === "CANDIDATE") {
      const candidate = candidates.find((item) => item.id === id);
      return candidate ? String((candidate.proposed_payload as any)?.title ?? (candidate.proposed_payload as any)?.name ?? candidate.candidate_type) : undefined;
    }
    return undefined;
  };

  const relationEntityLink = (type: string, id: string) => (
    <EntityNavLink type={type} id={id} label={resolveEntityLabel(type, id) ?? `${type} ${shortId(id)}`} />
  );

  return (
    <main>
      <SectionHeader title="Relations" detail="Audit and linking view without raw relation payload editing." />
      <MetricStrip items={[{ label: "Relations", value: rows.length }, { label: "Accepted", value: rows.filter((row) => row.status === "ACCEPTED").length }]} />
      {error ? <div className="error-text">{error}</div> : null}
      <SplitWorkbench
        table={<ResourceCard title="Relation Table">{rows.length ? <ResourceTable columns={["Subject", "Predicate", "Object", "Status", "ID"]} rows={rows.map((row) => [relationEntityLink(row.subject_type, row.subject_id), <SelectableNameButton key={row.id} selected={row.id === selectedId} onClick={() => setSelectedId(row.id)}>{row.predicate}</SelectableNameButton>, relationEntityLink(row.object_type, row.object_id), statusBadge(row.status), <ShortId key={`${row.id}-id`} value={row.id} />])} /> : <EmptyState title="No relations" detail="Create links from marks, checks, cases, and findings." />}</ResourceCard>}
        drawer={selected ? <div className="stack-blocks"><div><h2>{selected.predicate}</h2><div className="small">{shortId(selected.id)}</div></div><form className="form-grid" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await api.updateRelation(selected.id, { predicate: String(form.get("predicate") ?? selected.predicate), status: String(form.get("status") ?? selected.status ?? "ACCEPTED"), confidence: String(form.get("confidence") ?? selected.confidence ?? "MEDIUM") }); await reload(); }}><div className="form-grid-2"><Field label="Predicate"><input name="predicate" defaultValue={selected.predicate} /></Field><Field label="Status"><select name="status" defaultValue={selected.status ?? "ACCEPTED"}>{["ACCEPTED", "NEEDS_REVIEW", "REJECTED"].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field><Field label="Confidence"><select name="confidence" defaultValue={selected.confidence ?? "MEDIUM"}>{["LOW", "MEDIUM", "HIGH", "UNKNOWN"].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field></div><button className="btn" type="submit">Save Relation</button></form><StructuredDetails title="Endpoints" value={{ subject: resolveEntityLabel(selected.subject_type, selected.subject_id) ?? `${selected.subject_type} ${shortId(selected.subject_id)}`, object: resolveEntityLabel(selected.object_type, selected.object_id) ?? `${selected.object_type} ${shortId(selected.object_id)}` }} empty="No relation details." /><div className="key-value-list"><div className="key-value-row"><span className="small">Subject</span><div>{relationEntityLink(selected.subject_type, selected.subject_id)}</div></div><div className="key-value-row"><span className="small">Object</span><div>{relationEntityLink(selected.object_type, selected.object_id)}</div></div></div></div> : <EmptyState title="No relation selected" detail="Pick a relation to update confidence, status, or predicate." />}
      />
      <ResourceCard title="Create Relation"><form className="form-grid" onSubmit={async (event) => { event.preventDefault(); if (!selectedAssessmentId) { setError("Select assessment first"); return; } const form = new FormData(event.currentTarget); await api.createRelation(selectedAssessmentId, { subject_type: String(form.get("subject_type") ?? "MARK"), subject_id: String(form.get("subject_id") ?? ""), predicate: String(form.get("predicate") ?? "CHECKS"), object_type: String(form.get("object_type") ?? "CHECK"), object_id: String(form.get("object_id") ?? ""), confidence: String(form.get("confidence") ?? "MEDIUM"), status: String(form.get("status") ?? "ACCEPTED"), source: "OTHER", properties: {} }); (event.currentTarget as HTMLFormElement).reset(); await reload(); }}><div className="form-grid-2"><Field label="Subject type"><input name="subject_type" defaultValue="MARK" /></Field><Field label="Subject ID"><input name="subject_id" required /></Field><Field label="Predicate"><input name="predicate" defaultValue="CHECKS" /></Field><Field label="Object type"><input name="object_type" defaultValue="CHECK" /></Field><Field label="Object ID"><input name="object_id" required /></Field><Field label="Confidence"><select name="confidence" defaultValue="MEDIUM">{["LOW", "MEDIUM", "HIGH", "UNKNOWN"].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field><Field label="Status"><select name="status" defaultValue="ACCEPTED">{["ACCEPTED", "NEEDS_REVIEW", "REJECTED"].map((value) => <option key={value} value={value}>{value}</option>)}</select></Field></div><button className="btn" type="submit">Create Relation</button></form></ResourceCard>
    </main>
  );
}

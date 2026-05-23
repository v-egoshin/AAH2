import { useEffect, useMemo, useState } from "react";

import { Candidate } from "../api/client";
import { useWorkbench } from "../app/workbench";
import { EmptyState, Field, KeyValueList, MetricStrip, SectionHeader, ShortId, StructuredDetails } from "../components/common";
import { ResourceCard, ResourceTable, SplitWorkbench } from "../components/resource";
import { EntityNavLink, SelectableNameButton, shortId, statusBadge, useSelectedIdParam } from "./utils";

const FILTER_STATUSES = ["ALL", "NEW", "NEEDS_REVIEW", "DUPLICATE", "ACCEPTED", "REJECTED", "ERROR"];

export function CandidateInboxPage() {
  const { api, selectedAssessmentId } = useWorkbench();
  const [rows, setRows] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useSelectedIdParam();
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [error, setError] = useState("");

  const reload = async () => {
    if (!selectedAssessmentId) {
      return;
    }
    try {
      const data = await api.getCandidates(selectedAssessmentId);
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

  const filtered = useMemo(() => {
    return rows.filter((row) => statusFilter === "ALL" || row.status === statusFilter);
  }, [rows, statusFilter]);
  const selected = useMemo(() => filtered.find((row) => row.id === selectedId) ?? rows.find((row) => row.id === selectedId) ?? null, [filtered, rows, selectedId]);

  return (
    <main>
      <SectionHeader
        title="Candidates"
        detail="Central triage inbox with fast state transitions and structured payload review."
        actions={
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {FILTER_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        }
      />
      <MetricStrip
        items={[
          { label: "Total", value: rows.length },
          { label: "New", value: rows.filter((row) => row.status === "NEW").length },
          { label: "Needs review", value: rows.filter((row) => row.status === "NEEDS_REVIEW").length },
          { label: "Duplicate", value: rows.filter((row) => row.status === "DUPLICATE").length },
        ]}
      />
      {error ? <div className="error-text">{error}</div> : null}
      <SplitWorkbench
        table={
          <ResourceCard title="Triage Table">
            {filtered.length ? (
              <ResourceTable
                columns={["Type", "Summary", "Confidence", "Status", "Import", "ID"]}
                rows={filtered.map((row) => [
                  row.candidate_type,
                  <SelectableNameButton key={`${row.id}-pick`} selected={row.id === selectedId} onClick={() => setSelectedId(row.id)}>
                    {String((row.proposed_payload as any)?.title ?? (row.proposed_payload as any)?.name ?? row.proposed_object_type ?? row.candidate_type)}
                  </SelectableNameButton>,
                  row.confidence,
                  statusBadge(row.status),
                  row.import_batch_id ? <EntityNavLink key={`${row.id}-import`} type="IMPORT" id={row.import_batch_id} label={`Import ${shortId(row.import_batch_id)}`} /> : "—",
                  <ShortId key={`${row.id}-id`} value={row.id} />,
                ])}
              />
            ) : (
              <EmptyState title="No candidates" detail="Imports and tool ingests will appear here for triage." />
            )}
          </ResourceCard>
        }
        drawer={
          selected ? (
            <div className="stack-blocks">
              <div>
                <h2>{String((selected.proposed_payload as any)?.title ?? (selected.proposed_payload as any)?.name ?? selected.candidate_type)}</h2>
                <div className="small">{selected.candidate_type} · {selected.confidence} · {shortId(selected.id)}</div>
              </div>
              <div className="inline-actions">
                <button className="btn" onClick={async () => { await api.acceptCandidate(selected.id); await reload(); }}>Accept</button>
                <button className="btn btn-secondary" onClick={async () => { await api.rejectCandidate(selected.id); await reload(); }}>Reject</button>
              </div>
              <form
                className="form-grid"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  await api.updateCandidate(selected.id, {
                    status: String(form.get("status") ?? selected.status),
                    duplicate_of_id: String(form.get("duplicate_of_id") ?? "") || null,
                  });
                  await reload();
                }}
              >
                <div className="form-grid-2">
                  <Field label="Workflow status">
                    <select name="status" defaultValue={selected.status}>
                      {FILTER_STATUSES.filter((value) => value !== "ALL").map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </Field>
                  <Field label="Duplicate of candidate ID">
                    <input name="duplicate_of_id" defaultValue={selected.duplicate_of_id ?? ""} placeholder="Optional UUID" />
                  </Field>
                </div>
                <button className="btn btn-subtle" type="submit">Save Candidate</button>
              </form>
              <KeyValueList
                items={[
                  { label: "Status", value: statusBadge(selected.status) },
                  { label: "Source", value: selected.source ?? "—" },
                  { label: "Validation errors", value: selected.validation_errors?.length ? selected.validation_errors.join(", ") : "—" },
                  { label: "Full ID", value: selected.id },
                ]}
              />
              <StructuredDetails title="Proposed Payload" value={selected.proposed_payload ?? {}} empty="No proposed payload." />
            </div>
          ) : (
            <EmptyState title="No candidate selected" detail="Pick a row to open payload preview and transition actions." />
          )
        }
      />
    </main>
  );
}

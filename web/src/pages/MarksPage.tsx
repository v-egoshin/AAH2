import { Fragment, useEffect, useMemo, useState } from "react";

import { MarkRecord, ObjectRecord } from "../api/client";
import { useWorkbench } from "../app/workbench";
import { EmptyState, Field, KeyValueList, MetricStrip, SectionHeader, ShortId, StructuredDetails } from "../components/common";
import { ResourceCard, ResourceTable, SplitWorkbench } from "../components/resource";
import { EntityNavLink, SelectableNameButton, shortId, statusBadge, useSelectedIdParam } from "./utils";

const MARK_KINDS = ["SOURCE", "SINK", "GUARD", "TRANSFORM", "VALIDATOR", "OTHER"];

function HighlightedSnippet({
  snippet,
  selectedText,
  highlightStartOffset,
  highlightEndOffset,
}: {
  snippet?: string;
  selectedText?: string;
  highlightStartOffset?: number;
  highlightEndOffset?: number;
}) {
  if (!snippet) {
    return <p className="small">No captured context.</p>;
  }
  if (
    typeof highlightStartOffset === "number"
    && typeof highlightEndOffset === "number"
    && highlightStartOffset >= 0
    && highlightEndOffset > highlightStartOffset
    && highlightEndOffset <= snippet.length
  ) {
    const before = snippet.slice(0, highlightStartOffset);
    const highlighted = snippet.slice(highlightStartOffset, highlightEndOffset);
    const after = snippet.slice(highlightEndOffset);
    return (
      <pre className="code-block">
        <Fragment>{before}</Fragment>
        <mark>{highlighted}</mark>
        <Fragment>{after}</Fragment>
      </pre>
    );
  }
  if (!selectedText) {
    return <pre className="code-block">{snippet}</pre>;
  }
  const firstIndex = snippet.indexOf(selectedText);
  if (firstIndex < 0) {
    return <pre className="code-block">{snippet}</pre>;
  }
  const before = snippet.slice(0, firstIndex);
  const after = snippet.slice(firstIndex + selectedText.length);
  return (
    <pre className="code-block">
      <Fragment>{before}</Fragment>
      <mark>{selectedText}</mark>
      <Fragment>{after}</Fragment>
    </pre>
  );
}

export function MarksPage() {
  const { api, selectedAssessmentId } = useWorkbench();
  const [rows, setRows] = useState<MarkRecord[]>([]);
  const [objects, setObjects] = useState<ObjectRecord[]>([]);
  const [selectedId, setSelectedId] = useSelectedIdParam();
  const [error, setError] = useState("");

  const reload = async () => {
    if (!selectedAssessmentId) return;
    try {
      const [marks, objectRows] = await Promise.all([api.getMarks(selectedAssessmentId), api.getObjects(selectedAssessmentId)]);
      setRows(marks);
      setObjects(objectRows);
      if (!selectedId && marks[0]?.id) {
        setSelectedId(marks[0].id);
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
  const selectedObject = useMemo(() => objects.find((row) => row.id === selected?.object_id) ?? null, [objects, selected]);
  const selectedText = String((selectedObject?.properties as any)?.selected_text ?? "");
  const contextSnippet = String((selectedObject?.properties as any)?.context_snippet ?? selected?.note ?? "");
  const contextStartLine = (selectedObject?.properties as any)?.context_start_line;
  const contextEndLine = (selectedObject?.properties as any)?.context_end_line;
  const highlightStartOffset = (selectedObject?.properties as any)?.context_highlight_start_offset;
  const highlightEndOffset = (selectedObject?.properties as any)?.context_highlight_end_offset;

  return (
    <main>
      <SectionHeader title="Marks" detail="Inline mark status transitions and compact source/sink review." />
      <MetricStrip items={[{ label: "Marks", value: rows.length }, { label: "Needs review", value: rows.filter((row) => row.status === "NEEDS_REVIEW").length }]} />
      {error ? <div className="error-text">{error}</div> : null}
      <SplitWorkbench
        table={
          <ResourceCard title="Mark Table">
            {rows.length ? (
              <ResourceTable
                columns={["Kind", "Title", "Status", "Object", "ID"]}
                rows={rows.map((row) => [
                  row.kind,
                  <SelectableNameButton key={`${row.id}-pick`} selected={row.id === selectedId} onClick={() => setSelectedId(row.id)}>{row.title}</SelectableNameButton>,
                  statusBadge(row.status),
                  <EntityNavLink key={`${row.id}-object`} type="OBJECT" id={row.object_id} label={objects.find((object) => object.id === row.object_id)?.name ?? `Object ${shortId(row.object_id)}`} />,
                  <ShortId key={`${row.id}-id`} value={row.id} />,
                ])}
              />
            ) : (
              <EmptyState title="No marks" detail="Create marks from the extension or use structured UI controls here." />
            )}
          </ResourceCard>
        }
        drawer={
          selected ? (
            <div className="stack-blocks">
              <div>
                <h2>{selected.title}</h2>
                <div className="small">{selected.kind} · {shortId(selected.id)}</div>
              </div>
              <div className="inline-actions">
                <button className="btn btn-subtle" onClick={async () => { await api.updateMark(selected.id, { status: "CONFIRMED" }); await reload(); }}>Confirm</button>
                <button className="btn btn-subtle" onClick={async () => { await api.updateMark(selected.id, { status: "DISMISSED" }); await reload(); }}>Dismiss</button>
                <button className="btn btn-subtle" onClick={async () => { await api.updateMark(selected.id, { status: "NEEDS_REVIEW" }); await reload(); }}>Needs review</button>
                <button className="btn btn-subtle" onClick={async () => { await api.deleteMark(selected.id); if (selectedId === selected.id) { setSelectedId(""); } await reload(); }}>Remove</button>
              </div>
              <form
                className="form-grid"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  await api.updateMark(selected.id, {
                    title: String(form.get("title") ?? selected.title),
                    note: String(form.get("note") ?? selected.note ?? ""),
                    status: String(form.get("status") ?? selected.status),
                  });
                  await reload();
                }}
              >
                <div className="form-grid-2">
                  <Field label="Title">
                    <input name="title" defaultValue={selected.title} />
                  </Field>
                  <Field label="Status">
                    <select name="status" defaultValue={selected.status}>
                      {["ACTIVE", "NEEDS_REVIEW", "CONFIRMED", "DISMISSED"].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Note">
                  <textarea name="note" rows={4} defaultValue={selected.note ?? ""} />
                </Field>
                <button className="btn" type="submit">Save Mark</button>
              </form>
              <KeyValueList
                items={[
                  { label: "Status", value: statusBadge(selected.status) },
                  {
                    label: "Object",
                    value: <EntityNavLink type="OBJECT" id={selected.object_id} label={objects.find((item) => item.id === selected.object_id)?.name ?? `Object ${shortId(selected.object_id)}`} />,
                  },
                ]}
              />
              <ResourceCard title="Captured Context" tone="compact">
                <div className="stack-tight">
                  <div className="small">Selected text</div>
                  <pre className="code-block">{selectedText || "—"}</pre>
                  <div className="small">
                    Context lines {String(contextStartLine ?? "—")}..{String(contextEndLine ?? "—")}
                  </div>
                  <HighlightedSnippet
                    snippet={contextSnippet}
                    selectedText={selectedText}
                    highlightStartOffset={typeof highlightStartOffset === "number" ? highlightStartOffset : undefined}
                    highlightEndOffset={typeof highlightEndOffset === "number" ? highlightEndOffset : undefined}
                  />
                </div>
              </ResourceCard>
              <StructuredDetails title="Source Details" value={{ source: selected.source, object_id: selected.object_id }} empty="No source details." />
            </div>
          ) : (
            <EmptyState title="No mark selected" detail="Pick a mark to confirm, dismiss, or send back to review." />
          )
        }
      />
      <ResourceCard title="Create Mark">
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!selectedAssessmentId) {
              setError("Select assessment first");
              return;
            }
            const form = new FormData(event.currentTarget);
            const objectId = String(form.get("object_id") ?? "");
            await api.createMark(selectedAssessmentId, {
              kind: String(form.get("kind") ?? "SINK"),
              title: String(form.get("title") ?? ""),
              note: String(form.get("note") ?? "") || null,
              source: "OTHER",
              ...(objectId ? {
                object_id: objectId,
              } : {
                object_payload: {
                  type: String(form.get("object_type") ?? "CODE"),
                  kind: String(form.get("object_kind") ?? "CALLSITE"),
                  name: String(form.get("object_name") ?? ""),
                  locator: String(form.get("object_locator") ?? "") || null,
                  source: "OTHER",
                },
              }),
            });
            (event.currentTarget as HTMLFormElement).reset();
            await reload();
          }}
        >
          <div className="form-grid-2">
            <Field label="Kind">
              <select name="kind" defaultValue="SINK">
                {MARK_KINDS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </Field>
            <Field label="Title">
              <input name="title" defaultValue="Manual sink" required />
            </Field>
            <Field label="Existing object">
              <select name="object_id" defaultValue="">
                <option value="">Create new object below</option>
                {objects.map((object) => <option key={object.id} value={object.id}>{object.name} ({object.id.slice(0, 8)})</option>)}
              </select>
            </Field>
          </div>
          <Field label="Note">
            <textarea name="note" rows={3} defaultValue="Created from web" />
          </Field>
          <ResourceCard title="New Object If Needed" tone="compact">
            <div className="form-grid-2">
              <Field label="Object type">
                <input name="object_type" defaultValue="CODE" />
              </Field>
              <Field label="Object kind">
                <input name="object_kind" defaultValue="CALLSITE" />
              </Field>
              <Field label="Object name">
                <input name="object_name" defaultValue="exec(sql)" />
              </Field>
              <Field label="Object locator">
                <input name="object_locator" placeholder="src/db.ts:88" />
              </Field>
            </div>
          </ResourceCard>
          <button className="btn" type="submit">Create Mark</button>
        </form>
      </ResourceCard>
    </main>
  );
}

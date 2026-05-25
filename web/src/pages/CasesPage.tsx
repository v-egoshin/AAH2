import { type ReactNode, useEffect, useMemo, useState } from "react";

import { CaseRecord } from "../api/client";
import { useWorkbench } from "../app/workbench";
import { Field, InlineEditableText } from "../components/common";
import { ModalGlyph, ModalShell } from "../components/modal";
import { CaseLinkedEntitiesPanel } from "../features/case-linked-entities/CaseLinkedEntitiesPanel";
import { shortId, useSelectedIdParam } from "./utils";

function buttonIcon(children: ReactNode) {
  return <span className="btn-icon" aria-hidden="true">{children}</span>;
}

function saveIcon() {
  return buttonIcon(
    <ModalGlyph>
      <path d="M3.25 3.25h7.8l1.7 1.7v7.8H3.25z" />
      <path d="M5.25 3.25v3h5v-3" />
      <path d="M5.4 10.1h4.9" />
    </ModalGlyph>,
  );
}

function plusIcon() {
  return buttonIcon(
    <ModalGlyph>
      <path d="M8 3.25v9.5" />
      <path d="M3.25 8h9.5" />
    </ModalGlyph>,
  );
}

function noteIcon() {
  return buttonIcon(
    <ModalGlyph>
      <path d="M4 3.25h8a.75.75 0 0 1 .75.75v8L9.5 10.25H4a.75.75 0 0 1-.75-.75V4A.75.75 0 0 1 4 3.25Z" />
      <path d="M5.5 6h5" />
      <path d="M5.5 8.5h3.5" />
    </ModalGlyph>,
  );
}

export function CasesPage() {
  const { api, selectedAssessmentId } = useWorkbench();
  const [rows, setRows] = useState<CaseRecord[]>([]);
  const [selectedId, setSelectedId] = useSelectedIdParam();
  const [error, setError] = useState("");
  const [graphRefreshToken, setGraphRefreshToken] = useState(0);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [isRenamingCase, setIsRenamingCase] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    title: "Untrusted input reaches command execution",
    description: "Investigation case",
  });
  const [editDraft, setEditDraft] = useState({
    title: "",
    description: "",
    status: "OPEN",
  });

  const reload = async () => {
    if (!selectedAssessmentId) {
      return;
    }
    try {
      const caseRows = await api.getCases(selectedAssessmentId);
      setRows(caseRows);
      if (!selectedId && caseRows[0]?.id) {
        setSelectedId(caseRows[0].id);
      }
      setGraphRefreshToken((current) => current + 1);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => { void reload(); }, [selectedAssessmentId]);

  const orderedRows = useMemo(
    () => [...rows].sort((left, right) => {
      const leftTime = left.created_at ? Date.parse(left.created_at) : 0;
      const rightTime = right.created_at ? Date.parse(right.created_at) : 0;
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return left.id.localeCompare(right.id);
    }),
    [rows],
  );

  const selected = useMemo(() => orderedRows.find((row) => row.id === selectedId) ?? null, [orderedRows, selectedId]);
  useEffect(() => {
    setDescriptionDraft(selected?.description ?? "");
    setIsEditingDescription(false);
  }, [selected?.id, selected?.description]);
  useEffect(() => {
    if (!isCreateOpen) {
      setCreateDraft({
        title: "Untrusted input reaches command execution",
        description: "Investigation case",
      });
    }
  }, [isCreateOpen]);
  useEffect(() => {
    if (!isEditOpen || !selected) {
      return;
    }
    setEditDraft({
      title: selected.title,
      description: selected.description ?? "",
      status: selected.status,
    });
  }, [isEditOpen, selected]);
  const isCreateDirty = createDraft.title !== "Untrusted input reaches command execution" || createDraft.description !== "Investigation case";
  const isEditDirty = Boolean(selected) && (
    editDraft.title !== selected.title
    || editDraft.description !== (selected.description ?? "")
    || editDraft.status !== selected.status
  );
  const saveDescription = async () => {
    if (!selected || isSavingDescription) {
      return;
    }
    setIsSavingDescription(true);
    try {
      await api.updateCase(selected.id, {
        description: descriptionDraft,
      });
      setIsEditingDescription(false);
      await reload();
    } finally {
      setIsSavingDescription(false);
    }
  };

  return (
    <main>
      <div className="cases-summary-strip">
        <span className="cases-summary-chip">Cases {rows.length}</span>
        <span className="cases-summary-chip">Open {rows.filter((row) => row.status === "OPEN").length}</span>
        <div className="cases-summary-picker">
          <span className="field-label">Case</span>
          <select
            id="case-selector"
            value={selectedId ?? ""}
            onChange={(event) => setSelectedId(event.target.value || null)}
          >
            <option value="">Select case...</option>
            {orderedRows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="cases-header-row">
        <div className="cases-header-main">
          <div className="cases-header-topline">
            <div className="cases-title-row">
              <h1>Cases</h1>
              {selected ? <span className="badge badge-info">{selected.status}</span> : null}
            </div>
            <div className="cases-header-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setIsCreateOpen(true)}>Create</button>
              <button className="btn" type="button" disabled={!selected} onClick={() => setIsEditOpen(true)}>Edit</button>
            </div>
          </div>
          {selected ? (
            <InlineEditableText
              editing={isRenamingCase}
              selectOnFocus={false}
              value={selected.title}
              className="cases-current-title"
              displayClassName="cases-current-title-display"
              inputClassName="cases-current-title-input"
              onActivate={() => setIsRenamingCase(true)}
              onCancel={() => setIsRenamingCase(false)}
              onSave={async (value) => {
                setIsRenamingCase(false);
                const nextTitle = value.trim();
                if (!nextTitle || nextTitle === selected.title) {
                  return;
                }
                await api.updateCase(selected.id, { title: nextTitle });
                await reload();
              }}
            />
          ) : null}
          <div className="cases-description-editor">
            {isEditingDescription ? (
              <textarea
                rows={3}
                value={descriptionDraft}
                disabled={!selected || isSavingDescription}
                autoFocus
                onChange={(event) => setDescriptionDraft(event.target.value)}
                onBlur={() => {
                  if (selected && descriptionDraft !== (selected.description ?? "")) {
                    void saveDescription();
                  } else {
                    setIsEditingDescription(false);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void saveDescription();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setDescriptionDraft(selected?.description ?? "");
                    setIsEditingDescription(false);
                  }
                }}
                placeholder="Double click for edit..."
              />
            ) : (
              <p
                className={`cases-description-display ${!selected?.description ? "is-placeholder" : ""}`}
                onClick={() => setIsRenamingCase(false)}
                onDoubleClick={() => {
                  if (selected) {
                    setIsEditingDescription(true);
                  }
                }}
                title={selected ? "Double click for edit" : "Select case first"}
              >
                {selected?.description?.trim() || "Double click for edit..."}
              </p>
            )}
          </div>
        </div>
      </div>
      {error ? <div className="error-text">{error}</div> : null}
      <CaseLinkedEntitiesPanel
        caseId={selectedId}
        variant="page"
        refreshToken={graphRefreshToken}
        onError={setError}
        onGraphMutated={() => {
          setGraphRefreshToken((current) => current + 1);
        }}
      />
      {isCreateOpen ? (
        <ModalShell
          title="Create Case"
          subtitle="Create a compact investigation record inside the selected assessment."
          onClose={() => setIsCreateOpen(false)}
          isDirty={isCreateDirty}
          closeWarningDetail="This case draft has unsaved fields."
        >
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!selectedAssessmentId) {
                setError("Select assessment first");
                return;
              }
              await api.createCase(selectedAssessmentId, {
                title: createDraft.title,
                description: createDraft.description,
              });
              setIsCreateOpen(false);
              await reload();
            }}
          >
            <Field label="Title">
              <input
                name="title"
                required
                autoFocus
                value={createDraft.title}
                onChange={(event) => setCreateDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </Field>
            <Field label="Description">
              <textarea
                name="description"
                rows={4}
                value={createDraft.description}
                onChange={(event) => setCreateDraft((current) => ({ ...current, description: event.target.value }))}
              />
            </Field>
            <div className="inline-actions modal-actions">
              <button className="btn btn-small" type="submit">
                {plusIcon()}
                <span>Create case</span>
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}
      {isEditOpen && selected ? (
        <ModalShell
          title="Edit Case"
          subtitle={shortId(selected.id)}
          onClose={() => setIsEditOpen(false)}
          isDirty={isEditDirty}
          closeWarningDetail="The current case form has unsaved edits."
        >
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              await api.updateCase(selected.id, {
                title: editDraft.title,
                description: editDraft.description,
                status: editDraft.status,
              });
              setIsEditOpen(false);
              await reload();
            }}
          >
            <div className="form-grid-2">
              <Field label="Title">
                <input name="title" value={editDraft.title} onChange={(event) => setEditDraft((current) => ({ ...current, title: event.target.value }))} />
              </Field>
              <Field label="Status">
                <select name="status" value={editDraft.status} onChange={(event) => setEditDraft((current) => ({ ...current, status: event.target.value }))}>
                  {["OPEN", "IN_PROGRESS", "NEEDS_REVIEW", "RESOLVED", "CLOSED"].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Description">
              <textarea name="description" rows={4} value={editDraft.description} onChange={(event) => setEditDraft((current) => ({ ...current, description: event.target.value }))} />
            </Field>
            <div className="inline-actions modal-actions">
              <button className="btn btn-small" type="submit">
                {saveIcon()}
                <span>Save case</span>
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}
    </main>
  );
}

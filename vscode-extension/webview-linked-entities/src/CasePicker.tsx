import { useEffect, useState } from "react";
import { requestHostMutation } from "./hostApi";
import { vscode } from "./vscode";

type CasePickerProps = {
  selectedId: string | null;
  selectedStatus?: string | null;
  caseScopedDecorations: boolean;
  contextBeforeLines?: number | null;
  contextAfterLines?: number | null;
};

const CASE_STATUSES = [
  { label: "Open", value: "OPEN" },
  { label: "In progress", value: "IN_PROGRESS" },
  { label: "Resolved", value: "RESOLVED" },
  { label: "Failed", value: "FAILED" },
];

export function CasePicker({
  selectedId,
  selectedStatus,
  caseScopedDecorations,
  contextBeforeLines,
  contextAfterLines,
}: CasePickerProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const effectiveBefore = typeof selectedId === "string" && selectedId
    ? (typeof contextBeforeLines === "number" ? contextBeforeLines : 10)
    : 10;
  const effectiveAfter = typeof selectedId === "string" && selectedId
    ? (typeof contextAfterLines === "number" ? contextAfterLines : 10)
    : 10;
  const [beforeDraft, setBeforeDraft] = useState(String(effectiveBefore));
  const [afterDraft, setAfterDraft] = useState(String(effectiveAfter));
  useEffect(() => {
    setBeforeDraft(String(effectiveBefore));
    setAfterDraft(String(effectiveAfter));
  }, [effectiveBefore, effectiveAfter, selectedId]);

  const deleteSelectedCase = async () => {
    if (!selectedId || !window.confirm("Delete this case and its Linked Entities relations?")) {
      return;
    }
    try {
      await requestHostMutation("deleteCase", { caseId: selectedId });
      setSettingsOpen(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };

  const saveContextLines = async () => {
    if (!selectedId) {
      return;
    }
    const before = Math.max(0, Number.parseInt(beforeDraft || "0", 10) || 0);
    const after = Math.max(0, Number.parseInt(afterDraft || "0", 10) || 0);
    try {
      await requestHostMutation("updateCaseContextLines", { caseId: selectedId, context_before_lines: before, context_after_lines: after });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <div className="case-picker-field">
      <div className="case-picker-row">
        <div className="case-status-actions" aria-label="Case status">
          {CASE_STATUSES.map((status) => (
            <button
              key={status.value}
              className={`case-status-button ${selectedStatus === status.value ? "is-active" : ""}`}
              type="button"
              disabled={!selectedId}
              onClick={() => {
                if (selectedId) {
                  vscode.postMessage({ type: "updateCaseStatus", id: selectedId, status: status.value });
                }
              }}
            >
              {status.label}
            </button>
          ))}
        </div>
        <button
          className="case-settings-button"
          type="button"
          title="Linked Entities display settings"
          aria-label="Linked Entities display settings"
          onClick={() => setSettingsOpen((value) => !value)}
        >
          ⚙
        </button>
      </div>
      {settingsOpen ? (
        <div className="case-settings-popover">
          <div className="case-settings-title">Display</div>
          <label className="case-scope-toggle" title="Show editor marks only for the selected case">
            <input
              type="checkbox"
              checked={caseScopedDecorations}
              onChange={(event) => {
                vscode.postMessage({ type: "setCaseScopedDecorations", enabled: event.target.checked });
              }}
            />
            <span>Only selected case</span>
          </label>
          <div className="case-settings-description">
            Show editor decorations only for the selected case.
          </div>
          <div className="case-settings-title" style={{ marginTop: 10 }}>Context</div>
          <div className="case-settings-description">
            Lines sent to the server around the current editor position (before / after).
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span className="label">Before</span>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                disabled={!selectedId}
                value={beforeDraft}
                onChange={(e) => setBeforeDraft(e.target.value)}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span className="label">After</span>
              <input
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                disabled={!selectedId}
                value={afterDraft}
                onChange={(e) => setAfterDraft(e.target.value)}
              />
            </label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 8 }}>
            <button
              className="case-settings-delete"
              type="button"
              disabled={!selectedId}
              onClick={() => void saveContextLines()}
            >
              Save context
            </button>
          </div>
          <div className="case-settings-danger">
            <button
              className="case-settings-delete"
              type="button"
              disabled={!selectedId}
              onClick={() => void deleteSelectedCase()}
            >
              Delete case
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

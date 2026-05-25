import { useState } from "react";
import { requestHostMutation } from "./hostApi";
import { vscode } from "./vscode";

type CasePickerProps = {
  selectedId: string | null;
  selectedStatus?: string | null;
  caseScopedDecorations: boolean;
};

const CASE_STATUSES = [
  { label: "Open", value: "OPEN" },
  { label: "In progress", value: "IN_PROGRESS" },
  { label: "Resolved", value: "RESOLVED" },
  { label: "Failed", value: "FAILED" },
];

export function CasePicker({ selectedId, selectedStatus, caseScopedDecorations }: CasePickerProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
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

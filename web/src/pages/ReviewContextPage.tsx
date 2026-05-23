import { useState } from "react";

import { useWorkbench } from "../app/workbench";
import { Field, SectionHeader, StructuredDetails } from "../components/common";
import { ResourceCard } from "../components/resource";

export function ReviewContextPage() {
  const { api, selectedAssessmentId } = useWorkbench();
  const [response, setResponse] = useState<any>(null);
  const [error, setError] = useState("");

  return (
    <main>
      <SectionHeader title="Review Context" detail="Compact source inspection with related objects, marks, candidates, checks, and findings." />
      <div className="workbench-split">
        <ResourceCard title="Request">
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!selectedAssessmentId) {
                setError("Select assessment first");
                return;
              }
              const form = new FormData(event.currentTarget);
              try {
                const payload = {
                  asset_id: String(form.get("asset_id") ?? "") || undefined,
                  file: String(form.get("file") ?? "") || undefined,
                  start_line: Number(form.get("start_line") || 0) || undefined,
                  end_line: Number(form.get("end_line") || 0) || undefined,
                  symbol: String(form.get("symbol") ?? "") || undefined,
                  locator: String(form.get("locator") ?? "") || undefined,
                  include_nearby: form.get("include_nearby") === "on",
                };
                setResponse(await api.reviewContext(selectedAssessmentId, payload));
                setError("");
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              }
            }}
          >
            <div className="form-grid-2">
              <Field label="Asset ID">
                <input name="asset_id" placeholder="Optional UUID" />
              </Field>
              <Field label="File">
                <input name="file" placeholder="src/auth.ts" />
              </Field>
              <Field label="Start line">
                <input name="start_line" type="number" min="1" placeholder="1" />
              </Field>
              <Field label="End line">
                <input name="end_line" type="number" min="1" placeholder="200" />
              </Field>
              <Field label="Symbol">
                <input name="symbol" placeholder="Optional symbol" />
              </Field>
              <Field label="Locator">
                <input name="locator" placeholder="src/auth.ts:42" />
              </Field>
            </div>
            <label className="field-inline">
              <input name="include_nearby" type="checkbox" defaultChecked />
              <span>Include nearby objects and marks</span>
            </label>
            {error ? <div className="error-text">{error}</div> : null}
            <button className="btn" type="submit">Fetch Context</button>
          </form>
        </ResourceCard>
        <aside className="workbench-drawer card">
          <h2>Context Summary</h2>
          {response ? (
            <div className="stack-tight">
              <div>Objects: {response.summary?.current_objects ?? 0}</div>
              <div>Marks: {response.summary?.current_marks ?? 0}</div>
              <div>Candidates: {response.summary?.current_candidates ?? 0}</div>
              <div>Checks: {response.summary?.current_checks ?? 0}</div>
              <div>Findings: {response.summary?.current_findings ?? 0}</div>
              <StructuredDetails title="Suggested Actions" value={response.suggested_actions} empty="No suggested actions." />
              <StructuredDetails title="Objects" value={response.objects} empty="No matching objects." />
              <StructuredDetails title="Marks" value={response.marks} empty="No matching marks." />
              <StructuredDetails title="Candidates" value={response.candidates} empty="No matching candidates." />
              <StructuredDetails title="Checks" value={response.checks} empty="No linked checks." />
              <StructuredDetails title="Cases" value={response.cases} empty="No linked cases." />
              <StructuredDetails title="Findings" value={response.findings} empty="No linked findings." />
            </div>
          ) : <p className="small">Run a context query to inspect nearby entities and actions.</p>}
        </aside>
      </div>
    </main>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useWorkbench } from "../app/workbench";
import { KeyValueList, MetricStrip, SectionHeader, StructuredDetails } from "../components/common";
import { ResourceCard } from "../components/resource";

type Summary = {
  candidateBacklog: number;
  openChecks: number;
  findingsBySeverity: Record<string, number>;
  unlinkedMarks: number;
  unresolvedCases: number;
};

export function DashboardPage() {
  const { api, selectedAssessment, selectedAssessmentId } = useWorkbench();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [coverage, setCoverage] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedAssessmentId) {
      return;
    }
    Promise.all([
      api.getCandidates(selectedAssessmentId),
      api.getChecks(selectedAssessmentId),
      api.getFindings(selectedAssessmentId),
      api.getMarks(selectedAssessmentId),
      api.getCases(selectedAssessmentId),
      api.getCoverage(selectedAssessmentId),
    ])
      .then(([candidates, checks, findings, marks, cases, coveragePayload]) => {
        setCoverage(coveragePayload);
        setSummary({
          candidateBacklog: candidates.filter((item) => ["NEW", "NEEDS_REVIEW", "DUPLICATE"].includes(item.status)).length,
          openChecks: checks.filter((item) => ["NOT_STARTED", "IN_PROGRESS", "NEEDS_REVIEW", "FAILED", "BLOCKED"].includes(item.status)).length,
          findingsBySeverity: findings.reduce<Record<string, number>>((acc, finding) => {
            acc[finding.severity] = (acc[finding.severity] ?? 0) + 1;
            return acc;
          }, {}),
          unlinkedMarks: Number((coveragePayload as any)?.marks?.sources_without_relations ?? 0) + Number((coveragePayload as any)?.marks?.sinks_without_checks ?? 0),
          unresolvedCases: cases.filter((item) => item.status !== "CLOSED" && item.status !== "RESOLVED").length,
        });
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [api, selectedAssessmentId]);

  const severitySummary = useMemo(() => {
    if (!summary) {
      return "—";
    }
    const order = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
    return order.map((key) => `${key[0]}:${summary.findingsBySeverity[key] ?? 0}`).join(" ");
  }, [summary]);

  return (
    <main>
      <SectionHeader title="Dashboard" detail="Assessment-wide attention queues and operator KPIs." />
      {summary ? (
        <MetricStrip
          items={[
            { label: "Candidate backlog", value: summary.candidateBacklog },
            { label: "Open checks", value: summary.openChecks },
            { label: "Findings by severity", value: severitySummary },
            { label: "Unlinked marks", value: summary.unlinkedMarks },
            { label: "Unresolved cases", value: summary.unresolvedCases },
          ]}
        />
      ) : null}
      {error ? <div className="error-text">{error}</div> : null}
      <div className="dashboard-grid">
        <ResourceCard title="Attention Queues">
          <div className="attention-list">
            <Link className="attention-card" to="/candidates">
              <strong>Candidate triage</strong>
              <span className="small">Review backlog, duplicates, and needs-review items.</span>
            </Link>
            <Link className="attention-card" to="/checks">
              <strong>Open checks</strong>
              <span className="small">Move in-progress and blocked checks forward.</span>
            </Link>
            <Link className="attention-card" to="/coverage">
              <strong>Coverage gaps</strong>
              <span className="small">Jump directly into the highest-signal workflow gaps.</span>
            </Link>
          </div>
        </ResourceCard>
        <ResourceCard title="Current Assessment" tone="compact">
          {selectedAssessment ? (
            <div className="stack-tight">
              <strong>{selectedAssessment.title}</strong>
              <div className="small">Status: {selectedAssessment.status}</div>
              {selectedAssessment.description ? <p className="small">{selectedAssessment.description}</p> : null}
              <KeyValueList
                items={[
                  { label: "Assessment ID", value: selectedAssessment.id },
                  { label: "Metadata", value: Object.keys(selectedAssessment.metadata ?? {}).length ? "Configured" : "Empty" },
                ]}
              />
              <StructuredDetails title="Assessment Metadata" value={selectedAssessment.metadata} empty="No assessment metadata." />
            </div>
          ) : (
            <p className="small">Select an assessment to load the workbench.</p>
          )}
        </ResourceCard>
        <ResourceCard title="Coverage Snapshot">
          <StructuredDetails title="Coverage Signals" value={coverage} empty="Coverage data will appear after an assessment is loaded." />
        </ResourceCard>
      </div>
    </main>
  );
}

import { Link } from "react-router-dom";
import { useEffect, useState } from "react";

import { useWorkbench } from "../app/workbench";
import { MetricStrip, SectionHeader, StructuredDetails } from "../components/common";
import { ResourceCard } from "../components/resource";

export function CoveragePage() {
  const { api, selectedAssessmentId } = useWorkbench();
  const [coverage, setCoverage] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedAssessmentId) return;
    api.getCoverage(selectedAssessmentId).then((payload) => {
      setCoverage(payload as Record<string, any>);
      setError("");
    }).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [api, selectedAssessmentId]);

  const cards = coverage ? [
    { label: "New candidates", value: coverage.candidates?.new_count ?? 0, to: "/candidates" },
    { label: "Needs review candidates", value: coverage.candidates?.needs_review_count ?? 0, to: "/candidates" },
    { label: "Sinks without checks", value: coverage.marks?.sinks_without_checks ?? 0, to: "/marks" },
    { label: "Failed checks without findings", value: coverage.checks?.failed_without_finding ?? 0, to: "/checks" },
    { label: "Findings without evidence", value: coverage.findings?.without_evidence ?? 0, to: "/findings" },
    { label: "Open cases without checks", value: coverage.cases?.open_without_checks ?? 0, to: "/cases" },
  ] : [];

  return (
    <main>
      <SectionHeader title="Coverage" detail="Checklist-style gap view with direct jumps into the relevant workbench tables." />
      <MetricStrip items={cards.map((card) => ({ label: card.label, value: card.value }))} />
      {error ? <div className="error-text">{error}</div> : null}
      <div className="attention-list">
        {cards.map((card) => (
          <Link key={card.label} className="attention-card" to={card.to}>
            <strong>{card.label}</strong>
            <span className="metric">{card.value}</span>
          </Link>
        ))}
      </div>
      <ResourceCard title="Coverage Details">
        <StructuredDetails title="Workflow Coverage" value={coverage} empty="Coverage is not loaded yet." />
      </ResourceCard>
    </main>
  );
}

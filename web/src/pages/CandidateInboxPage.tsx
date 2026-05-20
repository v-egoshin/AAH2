import { useEffect, useMemo, useState } from "react";
import { ApiClient } from "../api/client";
import { CandidateRow, CandidateTable } from "../components/CandidateTable";

const api = new ApiClient("http://localhost:8000/api");

export function CandidateInboxPage() {
  const [assessmentId, setAssessmentId] = useState("");
  const [rows, setRows] = useState<CandidateRow[]>([]);

  useEffect(() => { api.getAssessments().then((a) => Array.isArray(a) && a[0] && setAssessmentId(a[0].id)); }, []);
  useEffect(() => { if (assessmentId) api.getCandidates(assessmentId).then((r) => setRows(Array.isArray(r) ? r : [])); }, [assessmentId]);

  const summary = useMemo(() => ({ total: rows.length, newCount: rows.filter((r) => r.status === "NEW").length }), [rows]);

  return (
    <main>
      <h1>Candidate Inbox</h1>
      <p className="small">Assessment: {assessmentId || "not selected"}</p>
      <div className="card" style={{ marginBottom: 12 }}>
        <strong>Total:</strong> {summary.total} &nbsp; <strong>NEW:</strong> {summary.newCount}
      </div>
      <div className="card">
        <CandidateTable rows={rows} onAccept={async (id) => { await api.acceptCandidate(id); if (assessmentId) setRows(await api.getCandidates(assessmentId)); }} />
      </div>
    </main>
  );
}

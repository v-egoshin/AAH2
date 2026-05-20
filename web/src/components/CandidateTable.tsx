export type CandidateRow = { id: string; candidate_type: string; confidence: string; status: string };

export function CandidateTable({ rows, onAccept }: { rows: CandidateRow[]; onAccept: (id: string) => void }) {
  return (
    <table className="table">
      <thead><tr><th>ID</th><th>Type</th><th>Confidence</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.id}</td><td>{row.candidate_type}</td><td><span className="badge">{row.confidence}</span></td><td>{row.status}</td>
            <td><button className="btn" onClick={() => onAccept(row.id)}>Accept</button></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

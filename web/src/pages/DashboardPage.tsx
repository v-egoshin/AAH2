export function DashboardPage() {
  return (
    <main>
      <h1>Assessment Dashboard</h1>
      <p className="small">Лаконичный обзор текущего состояния.</p>
      <div className="grid">
        <div className="card"><div className="small">Candidates NEW</div><div className="metric">—</div></div>
        <div className="card"><div className="small">Open Cases</div><div className="metric">—</div></div>
        <div className="card"><div className="small">Findings</div><div className="metric">—</div></div>
      </div>
    </main>
  );
}

export function CoveragePage() {
  return (
    <main>
      <h1>Coverage Gaps</h1>
      <div className="card">
        <ul>
          <li>New candidates not reviewed</li>
          <li>Sinks without checks</li>
          <li>Failed checks without findings</li>
        </ul>
      </div>
    </main>
  );
}

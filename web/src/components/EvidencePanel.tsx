export function EvidencePanel({ rows }: { rows: any[] }) {
  return <div>{rows.map(r => <article key={r.id}><h4>{r.title}</h4><p>{r.summary}</p></article>)}</div>;
}

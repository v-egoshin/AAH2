export function RelationList({ rows }: { rows: any[] }) {
  return <ul>{rows.map(r => <li key={r.id}>{r.subject_type}:{r.subject_id} → {r.predicate} → {r.object_type}:{r.object_id}</li>)}</ul>;
}

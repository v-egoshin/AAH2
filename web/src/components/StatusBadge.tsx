export function StatusBadge({ value }: { value: string }) {
  const cls = value.includes('FAILED') || value.includes('ERROR') ? '#fecaca' : value.includes('DONE') || value.includes('OK') ? '#bbf7d0' : '#e2e8f0';
  return <span className='badge' style={{ background: cls }}>{value}</span>;
}

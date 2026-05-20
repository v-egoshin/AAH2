import { useEffect, useMemo, useState } from 'react';
import { api, useAssessment } from './_shared';

export function CandidateInboxPage(){const aid=useAssessment(); const [rows,setRows]=useState<any[]>([]); const [q,setQ]=useState('');
useEffect(()=>{if(aid) api.getCandidates(aid).then(setRows);},[aid]);
const filtered=useMemo(()=>rows.filter(r=>!q||JSON.stringify(r).toLowerCase().includes(q.toLowerCase())),[rows,q]);
return <main><h1>Candidate Inbox</h1><input placeholder='filter...' value={q} onChange={e=>setQ(e.target.value)} />
<div className='card'><table className='table'><thead><tr><th>Type</th><th>Confidence</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td>{r.candidate_type}</td><td>{r.confidence}</td><td>{r.status}</td><td><button className='btn' onClick={async()=>{await api.acceptCandidate(r.id); if(aid) setRows(await api.getCandidates(aid));}}>Accept</button> <button className='btn' onClick={async()=>{await api.rejectCandidate(r.id); if(aid) setRows(await api.getCandidates(aid));}}>Reject</button></td></tr>)}</tbody></table></div></main>}

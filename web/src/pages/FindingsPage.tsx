import { useEffect, useState } from 'react';
import { api, useAssessment } from './_shared';

export function FindingsPage(){const aid=useAssessment(); const [rows,setRows]=useState<any[]>([]); useEffect(()=>{if(aid) api.getFindings(aid).then(setRows);},[aid]);
return <main><h1>Findings</h1><div className='card'><table className='table'><thead><tr><th>Title</th><th>Severity</th><th>Status</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.title}</td><td>{r.severity}</td><td>{r.status}</td></tr>)}</tbody></table></div></main>}

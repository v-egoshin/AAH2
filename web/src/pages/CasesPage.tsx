import { useEffect, useState } from 'react';
import { api, useAssessment } from './_shared';

export function CasesPage(){const aid=useAssessment(); const [rows,setRows]=useState<any[]>([]); useEffect(()=>{if(aid) api.getCases(aid).then(setRows);},[aid]);
return <main><h1>Cases</h1><div className='card'><table className='table'><thead><tr><th>Title</th><th>Status</th><th>Severity hint</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.title}</td><td>{r.status}</td><td>{r.severity_hint}</td></tr>)}</tbody></table></div></main>}

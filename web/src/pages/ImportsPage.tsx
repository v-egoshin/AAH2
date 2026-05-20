import { useEffect, useState } from 'react';
import { api, useAssessment } from './_shared';

export function ImportsPage(){const aid=useAssessment(); const [rows,setRows]=useState<any[]>([]); useEffect(()=>{if(aid) api.getImports(aid).then(setRows);},[aid]);
return <main><h1>Import History</h1><div className='card'><table className='table'><thead><tr><th>Source</th><th>Status</th><th>Summary</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.source_name}</td><td>{r.status}</td><td>{JSON.stringify(r.summary)}</td></tr>)}</tbody></table></div></main>}

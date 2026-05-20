import { useEffect, useState } from 'react';
import { api, useAssessment } from './_shared';

export function ChecksPage(){const aid=useAssessment(); const [rows,setRows]=useState<any[]>([]); useEffect(()=>{if(aid) api.getChecks(aid).then(setRows);},[aid]);
return <main><h1>Checks</h1><div className='card'><table className='table'><thead><tr><th>Title</th><th>Status</th><th>Priority</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.title}</td><td>{r.status}</td><td>{r.priority}</td></tr>)}</tbody></table></div></main>}

import { useEffect, useState } from 'react';
import { api, useAssessment } from './_shared';

export function ObjectsPage(){const aid=useAssessment(); const [rows,setRows]=useState<any[]>([]); useEffect(()=>{if(aid) api.getObjects(aid).then(setRows);},[aid]);
return <main><h1>Objects & Marks</h1><div className='card'><table className='table'><thead><tr><th>Name</th><th>Type</th><th>Kind</th><th>Locator</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{r.name}</td><td>{r.type}</td><td>{r.kind}</td><td>{r.locator}</td></tr>)}</tbody></table></div></main>}

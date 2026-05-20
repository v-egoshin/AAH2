import { useEffect, useState } from 'react';
import { api, useAssessment } from './_shared';

export function DashboardPage(){const aid=useAssessment(); const [cov,setCov]=useState<any>(null); useEffect(()=>{if(aid) api.getCoverage(aid).then(setCov);},[aid]);
return <main><h1>Assessment Dashboard</h1><div className='grid'>
<div className='card'><div className='small'>New Candidates</div><div className='metric'>{cov?.candidates?.new_count ?? '—'}</div></div>
<div className='card'><div className='small'>Sinks w/o checks</div><div className='metric'>{cov?.marks?.sinks_without_checks ?? '—'}</div></div>
<div className='card'><div className='small'>Failed checks w/o finding</div><div className='metric'>{cov?.checks?.failed_without_finding ?? '—'}</div></div>
</div></main>}

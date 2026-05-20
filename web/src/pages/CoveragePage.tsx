import { useEffect, useState } from 'react';
import { api, useAssessment } from './_shared';

export function CoveragePage(){const aid=useAssessment(); const [cov,setCov]=useState<any>(null); useEffect(()=>{if(aid) api.getCoverage(aid).then(setCov);},[aid]);
return <main><h1>Coverage Gaps</h1><div className='card'><pre>{JSON.stringify(cov, null, 2)}</pre></div></main>}

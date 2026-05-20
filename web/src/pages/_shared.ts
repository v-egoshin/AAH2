import { useEffect, useState } from 'react';
import { ApiClient } from '../api/client';

export const api = new ApiClient('http://localhost:8000/api');

export function useAssessment() {
  const [assessmentId, setAssessmentId] = useState('');
  useEffect(() => { api.getAssessments().then((a:any[]) => { if (a?.[0]?.id) setAssessmentId(a[0].id); }); }, []);
  return assessmentId;
}

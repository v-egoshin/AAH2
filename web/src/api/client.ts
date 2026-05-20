export class ApiClient {
  constructor(private baseUrl: string) {}

  private async j(path: string, init?: RequestInit) {
    const r = await fetch(`${this.baseUrl}${path}`, init);
    return r.json();
  }

  getAssessments() { return this.j('/assessments'); }
  getAssets(aid: string) { return this.j(`/assessments/${aid}/assets`); }
  getImports(aid: string) { return this.j(`/assessments/${aid}/imports`); }
  getCandidates(aid: string) { return this.j(`/assessments/${aid}/candidates`); }
  getObjects(aid: string) { return this.j(`/assessments/${aid}/objects`); }
  getChecks(aid: string) { return this.j(`/assessments/${aid}/checks`); }
  getCases(aid: string) { return this.j(`/assessments/${aid}/cases`); }
  getFindings(aid: string) { return this.j(`/assessments/${aid}/findings`); }
  getCoverage(aid: string) { return this.j(`/assessments/${aid}/coverage`); }
  acceptCandidate(id: string) { return this.j(`/candidates/${id}/accept`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); }
  rejectCandidate(id: string) { return this.j(`/candidates/${id}/reject`, { method: 'POST' }); }
}

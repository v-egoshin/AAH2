export type ReviewContextRequest = {
  asset_id?: string;
  file?: string;
  start_line?: number;
  end_line?: number;
  symbol?: string;
  locator?: string;
  include_nearby?: boolean;
};

export class ApiClient {
  constructor(private baseUrl: string) {}

  async getAssessments() {
    const res = await fetch(`${this.baseUrl}/assessments`);
    return res.json();
  }

  async getCandidates(assessmentId: string) {
    const res = await fetch(`${this.baseUrl}/assessments/${assessmentId}/candidates`);
    return res.json();
  }

  async acceptCandidate(candidateId: string) {
    const res = await fetch(`${this.baseUrl}/candidates/${candidateId}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    return res.json();
  }

  async reviewContext(assessmentId: string, payload: ReviewContextRequest) {
    const res = await fetch(`${this.baseUrl}/assessments/${assessmentId}/review-context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.json();
  }
}

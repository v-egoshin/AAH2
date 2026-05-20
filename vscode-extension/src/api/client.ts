export type WorkbenchConfig = {
  apiBaseUrl: string;
  assessmentId: string;
  assetId: string;
  authToken?: string;
};

export class WorkbenchApiClient {
  constructor(private cfg: WorkbenchConfig) {}

  private headers() {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.cfg.authToken) h.Authorization = `Bearer ${this.cfg.authToken}`;
    return h;
  }

  async getReviewContext(file: string, line: number) {
    const res = await fetch(`${this.cfg.apiBaseUrl}/assessments/${this.cfg.assessmentId}/review-context`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ asset_id: this.cfg.assetId, file, start_line: line, end_line: line, include_nearby: true }),
    });
    return res.json();
  }

  async createMark(kind: "SOURCE" | "SINK" | "GUARD" | "TRANSFORM", payload: unknown) {
    const res = await fetch(`${this.cfg.apiBaseUrl}/assessments/${this.cfg.assessmentId}/marks`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ kind, ...payload }),
    });
    return res.json();
  }

  async acceptCandidate(candidateId: string) {
    const res = await fetch(`${this.cfg.apiBaseUrl}/candidates/${candidateId}/accept`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({}),
    });
    return res.json();
  }
}

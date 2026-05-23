import * as vscode from "vscode";

export type WorkbenchConfig = {
  apiBaseUrl: string;
  assessmentId: string;
  assetId: string;
  authToken?: string;
};

export type AssessmentCreateRequest = {
  title: string;
  description?: string;
};

export type AssessmentRecord = {
  id: string;
  title: string;
  description?: string;
};

export type AssetRecord = {
  id: string;
  name: string;
};

export type ReviewEntity = {
  id: string;
  title?: string;
  description?: string;
  name?: string;
  kind?: string;
  candidate_type?: string;
  predicate?: string;
  subject_type?: string;
  subject_id?: string;
  object_type?: string;
  object_id?: string;
  status?: string;
  severity?: string;
  confidence?: string;
  note?: string;
  reason?: string;
  source?: string;
  created_at?: string;
  locator?: string | null;
  range?: { file?: string; start_line?: number; end_line?: number } | null;
  properties?: Record<string, unknown>;
  proposed_payload?: Record<string, unknown>;
};

export type ReviewContextResponse = {
  context?: {
    file?: string;
    start_line?: number;
    end_line?: number;
    include_nearby?: boolean;
  };
  objects?: ReviewEntity[];
  nearby_objects?: ReviewEntity[];
  marks?: ReviewEntity[];
  nearby_marks?: ReviewEntity[];
  candidates?: ReviewEntity[];
  relations?: ReviewEntity[];
  checks?: ReviewEntity[];
  findings?: ReviewEntity[];
  cases?: ReviewEntity[];
  evidence?: ReviewEntity[];
  summary?: Record<string, number>;
  suggested_actions?: string[];
};

type ResolvedConfig = {
  assessmentId: string;
  assetId: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeLookup(value: string): string {
  return value.trim().toLowerCase();
}

export class WorkbenchApiClient {
  private readonly baseUrl: string;
  private resolvedConfig: Promise<ResolvedConfig> | null = null;

  constructor(private cfg: WorkbenchConfig) {
    this.baseUrl = cfg.apiBaseUrl.replace(/\/+$/, "");
  }

  private headers() {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.cfg.authToken) h.Authorization = `Bearer ${this.cfg.authToken}`;
    return h;
  }

  private async request(path: string, init: RequestInit) {
    const url = `${this.baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Request to ${url} failed: ${message}`);
    }

    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const detail = typeof data === "object" && data && "detail" in data ? String((data as { detail: unknown }).detail) : text || `${res.status} ${res.statusText}`;
      throw new Error(`API ${res.status} at ${url}: ${detail}`);
    }

    return data;
  }

  async listAssessments(): Promise<AssessmentRecord[]> {
    return this.request(`/assessments`, { method: "GET", headers: this.headers() });
  }

  async findAssessmentByName(name: string): Promise<AssessmentRecord | null> {
    const lookup = normalizeLookup(name);
    const assessments = await this.listAssessments();
    const exact = assessments.find((item) => normalizeLookup(item.title) === lookup);
    if (exact) {
      return exact;
    }
    const partial = assessments.filter((item) => normalizeLookup(item.title).includes(lookup));
    if (partial.length === 1) {
      return partial[0];
    }
    if (partial.length > 1) {
      throw new Error(`Assessment setting is ambiguous: ${name}`);
    }
    return null;
  }

  private async listAssets(assessmentId: string): Promise<AssetRecord[]> {
    return this.request(`/assessments/${assessmentId}/assets`, { method: "GET", headers: this.headers() });
  }

  private async resolveAssessmentId(): Promise<string> {
    const raw = this.cfg.assessmentId.trim();
    if (!raw) {
      throw new Error("Set appsecWorkbench.assessmentId first");
    }
    if (UUID_RE.test(raw)) {
      return raw;
    }

    const found = await this.findAssessmentByName(raw);
    if (found) {
      return found.id;
    }
    const assessments = await this.listAssessments();
    if (assessments.length === 1) {
      const fallback = assessments[0];
      await vscode.workspace.getConfiguration("appsecWorkbench").update("assessmentId", fallback.title, vscode.ConfigurationTarget.Workspace);
      this.cfg.assessmentId = fallback.title;
      return fallback.id;
    }
    throw new Error(`Assessment not found for setting: ${raw}`);
  }

  private async resolveAssetId(assessmentId: string): Promise<string> {
    const raw = this.cfg.assetId.trim();
    if (!raw) {
      return "";
    }
    if (UUID_RE.test(raw)) {
      return raw;
    }

    const lookup = normalizeLookup(raw);
    const assets = await this.listAssets(assessmentId);
    const exact = assets.find((item) => normalizeLookup(item.name) === lookup || normalizeLookup(`${item.name} (${item.id.slice(0, 8)})`) === lookup);
    if (exact) {
      return exact.id;
    }

    const partial = assets.filter((item) => normalizeLookup(item.name).includes(lookup) || normalizeLookup(`${item.name} (${item.id.slice(0, 8)})`).includes(lookup));
    if (partial.length === 1) {
      return partial[0].id;
    }
    if (partial.length > 1) {
      throw new Error(`Asset setting is ambiguous: ${raw}`);
    }

    throw new Error(`Asset not found for setting: ${raw}`);
  }

  private async getResolvedConfig(): Promise<ResolvedConfig> {
    if (!this.resolvedConfig) {
      this.resolvedConfig = (async () => {
        const assessmentId = await this.resolveAssessmentId();
        const assetId = await this.resolveAssetId(assessmentId);
        return { assessmentId, assetId };
      })();
    }
    return this.resolvedConfig;
  }

  async createAssessment(payload: AssessmentCreateRequest) {
    return this.request(`/assessments`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
  }

  async listCases() {
    const resolved = await this.getResolvedConfig();
    return this.request(`/assessments/${resolved.assessmentId}/cases`, {
      method: "GET",
      headers: this.headers(),
    });
  }

  async getReviewContext(file: string, line: number) {
    const resolved = await this.getResolvedConfig();
    return this.request(`/assessments/${resolved.assessmentId}/review-context`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ asset_id: resolved.assetId || undefined, file, start_line: line, end_line: line, include_nearby: true }),
    });
  }

  async createMark(kind: "SOURCE" | "SINK" | "GUARD" | "TRANSFORM" | "NOTE", payload: Record<string, unknown>) {
    const resolved = await this.getResolvedConfig();
    return this.request(`/assessments/${resolved.assessmentId}/marks`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ kind, ...payload }),
    });
  }

  async deleteMark(markId: string) {
    return this.request(`/marks/${markId}`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  async updateMark(markId: string, payload: Record<string, unknown>) {
    return this.request(`/marks/${markId}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
  }

  async acceptCandidate(candidateId: string) {
    return this.request(`/candidates/${candidateId}/accept`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({}),
    });
  }

  async rejectCandidate(candidateId: string) {
    return this.request(`/candidates/${candidateId}/reject`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({}),
    });
  }

  async createCheck(payload: Record<string, unknown>) {
    const resolved = await this.getResolvedConfig();
    return this.request(`/assessments/${resolved.assessmentId}/checks`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
  }

  async createEvidence(payload: Record<string, unknown>) {
    const resolved = await this.getResolvedConfig();
    return this.request(`/assessments/${resolved.assessmentId}/evidence`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
  }

  async updateCheckStatus(checkId: string, payload: Record<string, unknown>) {
    return this.request(`/checks/${checkId}/status`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
  }

  async updateCheck(checkId: string, payload: Record<string, unknown>) {
    return this.request(`/checks/${checkId}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
  }

  async convertCheckToFinding(checkId: string, payload: Record<string, unknown>) {
    return this.request(`/checks/${checkId}/convert-to-finding`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
  }

  async createCase(payload: Record<string, unknown>) {
    const resolved = await this.getResolvedConfig();
    return this.request(`/assessments/${resolved.assessmentId}/cases`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
  }

  async createRelation(payload: Record<string, unknown>) {
    const resolved = await this.getResolvedConfig();
    return this.request(`/assessments/${resolved.assessmentId}/relations`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
  }

  async updateObject(objectId: string, payload: Record<string, unknown>) {
    return this.request(`/objects/${objectId}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify(payload),
    });
  }
}

export type JsonObject = Record<string, unknown>;

export type Assessment = {
  id: string;
  title: string;
  description: string;
  status: string;
  metadata?: JsonObject;
};

export type Asset = {
  id: string;
  assessment_id: string;
  type: string;
  name: string;
  locator?: string | null;
  version_ref?: string | null;
  metadata?: JsonObject;
};

export type Candidate = {
  id: string;
  assessment_id?: string;
  import_batch_id?: string | null;
  candidate_type: string;
  proposed_object_type?: string;
  proposed_payload?: JsonObject;
  confidence: string;
  status: string;
  source?: string;
  validation_errors?: string[];
  duplicate_of_id?: string | null;
};

export type ImportBatch = {
  id?: string;
  import_batch_id?: string;
  assessment_id?: string;
  asset_id?: string | null;
  source_type?: string;
  source_name?: string;
  tool_name?: string | null;
  tool_version?: string | null;
  status?: string;
  summary?: JsonObject;
};

export type ObjectRecord = {
  id: string;
  assessment_id: string;
  asset_id?: string | null;
  type: string;
  kind: string;
  name: string;
  locator?: string | null;
  range?: JsonObject | null;
  properties?: JsonObject;
  source?: string;
};

export type MarkRecord = {
  id: string;
  assessment_id: string;
  object_id: string;
  kind: string;
  title: string;
  note?: string | null;
  confidence: string;
  status: string;
  source?: string;
  is_dead_end?: boolean;
};

export type CheckRecord = {
  id: string;
  assessment_id: string;
  title: string;
  description?: string;
  category?: string | null;
  check_type?: string | null;
  parent_check_id?: string | null;
  sort_order?: number;
  is_group?: boolean;
  is_checked?: boolean;
  priority?: string;
  status: string;
  reason?: string | null;
  source?: string;
  created_at?: string;
  updated_at?: string;
};

export type CaseRecord = {
  id: string;
  assessment_id: string;
  asset_id: string;
  title: string;
  description?: string;
  status: string;
  severity_hint?: string | null;
  confidence?: string;
  created_at?: string;
  updated_at?: string;
};

export type FindingRecord = {
  id: string;
  assessment_id: string;
  title: string;
  severity: string;
  status: string;
  finding_type: string;
  description: string;
  impact: string;
  recommendation: string;
};

export type RelationRecord = {
  id: string;
  assessment_id: string;
  subject_type: string;
  subject_id: string;
  predicate: string;
  object_type: string;
  object_id: string;
  confidence?: string;
  status?: string;
  source?: string;
  evidence_summary?: string | null;
  properties?: JsonObject;
  created_at?: string;
  updated_at?: string;
};

export type EvidenceRecord = {
  id: string;
  assessment_id?: string;
  title: string;
  evidence_type: string;
  summary: string;
  content: string;
  confidence?: string;
  source?: string;
  properties?: JsonObject;
};

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
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers ?? {});
    if (init?.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers,
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const detail = typeof data === "object" && data && "detail" in data ? String((data as { detail: unknown }).detail) : text || `${response.status} ${response.statusText}`;
      throw new Error(`API ${response.status}: ${detail}`);
    }

    return data as T;
  }

  getAssessments() {
    return this.request<Assessment[]>(`/assessments`);
  }

  createAssessment(payload: { title: string; description?: string }) {
    return this.request<Assessment>(`/assessments`, { method: "POST", body: JSON.stringify(payload) });
  }

  updateAssessment(assessmentId: string, payload: JsonObject) {
    return this.request<Assessment>(`/assessments/${assessmentId}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  deleteAssessment(assessmentId: string) {
    return this.request<JsonObject>(`/assessments/${assessmentId}`, { method: "DELETE" });
  }

  getAssets(assessmentId: string) {
    return this.request<Asset[]>(`/assessments/${assessmentId}/assets`);
  }

  createAsset(assessmentId: string, payload: JsonObject) {
    return this.request<Asset>(`/assessments/${assessmentId}/assets`, { method: "POST", body: JSON.stringify(payload) });
  }

  updateAsset(assetId: string, payload: JsonObject) {
    return this.request<Asset>(`/assets/${assetId}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  deleteAsset(assetId: string) {
    return this.request<JsonObject>(`/assets/${assetId}`, { method: "DELETE" });
  }

  getImports(assessmentId: string) {
    return this.request<ImportBatch[]>(`/assessments/${assessmentId}/imports`);
  }

  createImport(assessmentId: string, payload: JsonObject) {
    return this.request<ImportBatch>(`/assessments/${assessmentId}/imports`, { method: "POST", body: JSON.stringify(payload) });
  }

  updateImport(importBatchId: string, payload: JsonObject) {
    return this.request<ImportBatch>(`/imports/${importBatchId}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  getCandidates(assessmentId: string) {
    return this.request<Candidate[]>(`/assessments/${assessmentId}/candidates`);
  }

  acceptCandidate(candidateId: string, payload: JsonObject = {}) {
    return this.request<JsonObject>(`/candidates/${candidateId}/accept`, { method: "POST", body: JSON.stringify(payload) });
  }

  rejectCandidate(candidateId: string) {
    return this.request<JsonObject>(`/candidates/${candidateId}/reject`, { method: "POST", body: JSON.stringify({}) });
  }

  updateCandidate(candidateId: string, payload: JsonObject) {
    return this.request<Candidate>(`/candidates/${candidateId}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  getObjects(assessmentId: string) {
    return this.request<ObjectRecord[]>(`/assessments/${assessmentId}/objects`);
  }

  createObject(assessmentId: string, payload: JsonObject) {
    return this.request<ObjectRecord>(`/assessments/${assessmentId}/objects`, { method: "POST", body: JSON.stringify(payload) });
  }

  updateObject(objectId: string, payload: JsonObject) {
    return this.request<ObjectRecord>(`/objects/${objectId}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  getMarks(assessmentId: string) {
    return this.request<MarkRecord[]>(`/assessments/${assessmentId}/marks`);
  }

  createMark(assessmentId: string, payload: JsonObject) {
    return this.request<MarkRecord>(`/assessments/${assessmentId}/marks`, { method: "POST", body: JSON.stringify(payload) });
  }

  updateMark(markId: string, payload: JsonObject) {
    return this.request<MarkRecord>(`/marks/${markId}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  getChecks(assessmentId: string) {
    return this.request<CheckRecord[]>(`/assessments/${assessmentId}/checks`);
  }

  createCheck(assessmentId: string, payload: JsonObject) {
    return this.request<CheckRecord>(`/assessments/${assessmentId}/checks`, { method: "POST", body: JSON.stringify(payload) });
  }

  updateCheckStatus(checkId: string, payload: JsonObject) {
    return this.request<CheckRecord>(`/checks/${checkId}/status`, { method: "POST", body: JSON.stringify(payload) });
  }

  updateCheck(checkId: string, payload: JsonObject) {
    return this.request<CheckRecord>(`/checks/${checkId}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  deleteCheck(checkId: string) {
    return this.request<JsonObject>(`/checks/${checkId}`, { method: "DELETE" });
  }

  convertCheckToFinding(checkId: string, payload: JsonObject) {
    return this.request<FindingRecord>(`/checks/${checkId}/convert-to-finding`, { method: "POST", body: JSON.stringify(payload) });
  }

  getCases(assessmentId: string) {
    return this.request<CaseRecord[]>(`/assessments/${assessmentId}/cases`);
  }

  createCase(assessmentId: string, payload: JsonObject) {
    return this.request<CaseRecord>(`/assessments/${assessmentId}/cases`, { method: "POST", body: JSON.stringify(payload) });
  }

  updateCase(caseId: string, payload: JsonObject) {
    return this.request<CaseRecord>(`/cases/${caseId}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  deleteCase(caseId: string) {
    return this.request<JsonObject>(`/cases/${caseId}`, { method: "DELETE" });
  }

  getFindings(assessmentId: string) {
    return this.request<FindingRecord[]>(`/assessments/${assessmentId}/findings`);
  }

  createFinding(assessmentId: string, payload: JsonObject) {
    return this.request<FindingRecord>(`/assessments/${assessmentId}/findings`, { method: "POST", body: JSON.stringify(payload) });
  }

  updateFinding(findingId: string, payload: JsonObject) {
    return this.request<FindingRecord>(`/findings/${findingId}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  getRelations(assessmentId: string) {
    return this.request<RelationRecord[]>(`/assessments/${assessmentId}/relations`);
  }

  createRelation(assessmentId: string, payload: JsonObject) {
    return this.request<RelationRecord>(`/assessments/${assessmentId}/relations`, { method: "POST", body: JSON.stringify(payload) });
  }

  updateRelation(relationId: string, payload: JsonObject) {
    return this.request<RelationRecord>(`/relations/${relationId}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  deleteRelation(relationId: string) {
    return this.request<JsonObject>(`/relations/${relationId}`, { method: "DELETE" });
  }

  getEvidence(assessmentId: string) {
    return this.request<EvidenceRecord[]>(`/assessments/${assessmentId}/evidence`);
  }

  createEvidence(assessmentId: string, payload: JsonObject) {
    return this.request<JsonObject>(`/assessments/${assessmentId}/evidence`, { method: "POST", body: JSON.stringify(payload) });
  }

  updateEvidence(evidenceId: string, payload: JsonObject) {
    return this.request<EvidenceRecord>(`/evidence/${evidenceId}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  getCoverage(assessmentId: string) {
    return this.request<JsonObject>(`/assessments/${assessmentId}/coverage`);
  }

  reviewContext(assessmentId: string, payload: ReviewContextRequest) {
    return this.request<JsonObject>(`/assessments/${assessmentId}/review-context`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkbenchApiClient = void 0;
const assessmentState_1 = require("../state/assessmentState");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function normalizeLookup(value) {
    return value.trim().toLowerCase();
}
class WorkbenchApiClient {
    constructor(cfg) {
        this.cfg = cfg;
        this.resolvedConfig = null;
        this.baseUrl = cfg.apiBaseUrl.replace(/\/+$/, "");
    }
    headers() {
        const h = { "Content-Type": "application/json" };
        if (this.cfg.authToken)
            h.Authorization = `Bearer ${this.cfg.authToken}`;
        return h;
    }
    async request(path, init) {
        const url = `${this.baseUrl}${path}`;
        let res;
        try {
            res = await fetch(url, init);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Request to ${url} failed: ${message}`);
        }
        const text = await res.text();
        const data = text ? JSON.parse(text) : null;
        if (!res.ok) {
            const detail = typeof data === "object" && data && "detail" in data ? String(data.detail) : text || `${res.status} ${res.statusText}`;
            throw new Error(`API ${res.status} at ${url}: ${detail}`);
        }
        return data;
    }
    async listAssessments() {
        return this.request(`/assessments`, { method: "GET", headers: this.headers() });
    }
    async findAssessmentByName(name) {
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
    async listAssets(assessmentId) {
        return this.request(`/assessments/${assessmentId}/assets`, { method: "GET", headers: this.headers() });
    }
    async resolveAssessmentId() {
        const raw = this.cfg.assessmentId.trim();
        const assessments = await this.listAssessments();
        if (!assessments.length) {
            throw new Error("Create assessment first");
        }
        if (raw) {
            if (UUID_RE.test(raw) && assessments.some((item) => item.id === raw)) {
                return raw;
            }
            const lookup = normalizeLookup(raw);
            const found = assessments.find((item) => normalizeLookup(item.title) === lookup || item.id === raw);
            if (found) {
                return found.id;
            }
        }
        if (assessments.length === 1) {
            const fallback = assessments[0];
            await (0, assessmentState_1.updateAssessmentState)({ assessmentId: fallback.id });
            this.cfg.assessmentId = fallback.title;
            return fallback.id;
        }
        throw new Error("Select assessment.");
    }
    async resolveAssetId(assessmentId) {
        const raw = this.cfg.assetId.trim();
        const assets = await this.listAssets(assessmentId);
        if (!assets.length) {
            return "";
        }
        if (!raw) {
            return assets[0].id;
        }
        if (UUID_RE.test(raw) && assets.some((item) => item.id === raw)) {
            return raw;
        }
        const lookup = normalizeLookup(raw);
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
        return assets[0].id;
    }
    async getResolvedConfig() {
        if (!this.resolvedConfig) {
            this.resolvedConfig = (async () => {
                const assessmentId = await this.resolveAssessmentId();
                const assetId = await this.resolveAssetId(assessmentId);
                return { assessmentId, assetId };
            })();
        }
        return this.resolvedConfig;
    }
    async createAssessment(payload) {
        return this.request(`/assessments`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(payload),
        });
    }
    async updateAssessment(assessmentId, payload) {
        return this.request(`/assessments/${assessmentId}`, {
            method: "PATCH",
            headers: this.headers(),
            body: JSON.stringify(payload),
        });
    }
    async deleteAssessment(assessmentId) {
        return this.request(`/assessments/${assessmentId}`, {
            method: "DELETE",
            headers: this.headers(),
        });
    }
    async resolveIds() {
        return this.getResolvedConfig();
    }
    async createAsset(assessmentId, payload) {
        return this.request(`/assessments/${assessmentId}/assets`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(payload),
        });
    }
    async updateAsset(assetId, payload) {
        return this.request(`/assets/${assetId}`, {
            method: "PATCH",
            headers: this.headers(),
            body: JSON.stringify(payload),
        });
    }
    async deleteAsset(assetId) {
        return this.request(`/assets/${assetId}`, {
            method: "DELETE",
            headers: this.headers(),
        });
    }
    async listCases() {
        const resolved = await this.getResolvedConfig();
        return this.request(`/assessments/${resolved.assessmentId}/cases`, {
            method: "GET",
            headers: this.headers(),
        });
    }
    async updateCase(caseId, payload) {
        return this.request(`/cases/${caseId}`, {
            method: "PATCH",
            headers: this.headers(),
            body: JSON.stringify(payload),
        });
    }
    async deleteCase(caseId) {
        return this.request(`/cases/${caseId}`, {
            method: "DELETE",
            headers: this.headers(),
        });
    }
    async getReviewContext(file, line) {
        const resolved = await this.getResolvedConfig();
        return this.request(`/assessments/${resolved.assessmentId}/review-context`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({ asset_id: resolved.assetId || undefined, file, start_line: line, end_line: line, include_nearby: true }),
        });
    }
    async createMark(kind, payload) {
        const resolved = await this.getResolvedConfig();
        return this.request(`/assessments/${resolved.assessmentId}/marks`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({ kind, ...payload }),
        });
    }
    async listMarks() {
        const resolved = await this.getResolvedConfig();
        return this.request(`/assessments/${resolved.assessmentId}/marks`, {
            method: "GET",
            headers: this.headers(),
        });
    }
    async deleteMark(markId) {
        return this.request(`/marks/${markId}`, {
            method: "DELETE",
            headers: this.headers(),
        });
    }
    async updateMark(markId, payload) {
        return this.request(`/marks/${markId}`, {
            method: "PATCH",
            headers: this.headers(),
            body: JSON.stringify(payload),
        });
    }
    async acceptCandidate(candidateId) {
        return this.request(`/candidates/${candidateId}/accept`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({}),
        });
    }
    async rejectCandidate(candidateId) {
        return this.request(`/candidates/${candidateId}/reject`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({}),
        });
    }
    async createCheck(payload) {
        const resolved = await this.getResolvedConfig();
        return this.request(`/assessments/${resolved.assessmentId}/checks`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(payload),
        });
    }
    async listChecks() {
        const resolved = await this.getResolvedConfig();
        return this.request(`/assessments/${resolved.assessmentId}/checks`, {
            method: "GET",
            headers: this.headers(),
        });
    }
    async createEvidence(payload) {
        const resolved = await this.getResolvedConfig();
        return this.request(`/assessments/${resolved.assessmentId}/evidence`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(payload),
        });
    }
    async updateCheckStatus(checkId, payload) {
        return this.request(`/checks/${checkId}/status`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(payload),
        });
    }
    async updateCheck(checkId, payload) {
        return this.request(`/checks/${checkId}`, {
            method: "PATCH",
            headers: this.headers(),
            body: JSON.stringify(payload),
        });
    }
    async deleteCheck(checkId) {
        return this.request(`/checks/${checkId}`, {
            method: "DELETE",
            headers: this.headers(),
        });
    }
    async convertCheckToFinding(checkId, payload) {
        return this.request(`/checks/${checkId}/convert-to-finding`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(payload),
        });
    }
    async createCase(payload) {
        const resolved = await this.getResolvedConfig();
        if (!resolved.assetId && !payload.asset_id) {
            throw new Error("Select asset first");
        }
        return this.request(`/assessments/${resolved.assessmentId}/cases`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify({ asset_id: resolved.assetId, ...payload }),
        });
    }
    async listFindings() {
        const resolved = await this.getResolvedConfig();
        return this.request(`/assessments/${resolved.assessmentId}/findings`, {
            method: "GET",
            headers: this.headers(),
        });
    }
    async listObjects() {
        const resolved = await this.getResolvedConfig();
        return this.request(`/assessments/${resolved.assessmentId}/objects`, {
            method: "GET",
            headers: this.headers(),
        });
    }
    async listCandidates() {
        const resolved = await this.getResolvedConfig();
        return this.request(`/assessments/${resolved.assessmentId}/candidates`, {
            method: "GET",
            headers: this.headers(),
        });
    }
    async createRelation(payload) {
        const resolved = await this.getResolvedConfig();
        return this.request(`/assessments/${resolved.assessmentId}/relations`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(payload),
        });
    }
    async getRelations() {
        const resolved = await this.getResolvedConfig();
        return this.request(`/assessments/${resolved.assessmentId}/relations`, {
            method: "GET",
            headers: this.headers(),
        });
    }
    async updateRelation(relationId, payload) {
        return this.request(`/relations/${relationId}`, {
            method: "PATCH",
            headers: this.headers(),
            body: JSON.stringify(payload),
        });
    }
    async deleteRelation(relationId) {
        return this.request(`/relations/${relationId}`, {
            method: "DELETE",
            headers: this.headers(),
        });
    }
    async updateObject(objectId, payload) {
        return this.request(`/objects/${objectId}`, {
            method: "PATCH",
            headers: this.headers(),
            body: JSON.stringify(payload),
        });
    }
}
exports.WorkbenchApiClient = WorkbenchApiClient;

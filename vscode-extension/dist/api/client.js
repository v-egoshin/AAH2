"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkbenchApiClient = void 0;
const vscode = __importStar(require("vscode"));
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
    async resolveAssetId(assessmentId) {
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
    async listCases() {
        const resolved = await this.getResolvedConfig();
        return this.request(`/assessments/${resolved.assessmentId}/cases`, {
            method: "GET",
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
    async convertCheckToFinding(checkId, payload) {
        return this.request(`/checks/${checkId}/convert-to-finding`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(payload),
        });
    }
    async createCase(payload) {
        const resolved = await this.getResolvedConfig();
        return this.request(`/assessments/${resolved.assessmentId}/cases`, {
            method: "POST",
            headers: this.headers(),
            body: JSON.stringify(payload),
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
    async updateObject(objectId, payload) {
        return this.request(`/objects/${objectId}`, {
            method: "PATCH",
            headers: this.headers(),
            body: JSON.stringify(payload),
        });
    }
}
exports.WorkbenchApiClient = WorkbenchApiClient;

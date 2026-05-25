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
exports.Checks2Panel = void 0;
const vscode = __importStar(require("vscode"));
const client_1 = require("../api/client");
const activeCase_1 = require("../state/activeCase");
const assessmentState_1 = require("../state/assessmentState");
function nonce() {
    return Math.random().toString(36).slice(2);
}
function asRows(value) {
    return Array.isArray(value) ? value.filter((row) => Boolean(row && typeof row === "object" && "id" in row)) : [];
}
function asCases(value) {
    return Array.isArray(value) ? value.filter((row) => Boolean(row && typeof row === "object" && "id" in row)) : [];
}
function asRelations(value) {
    return Array.isArray(value) ? value.filter((row) => Boolean(row && typeof row === "object" && "id" in row)) : [];
}
function asAssessments(value) {
    return Array.isArray(value) ? value.filter((row) => Boolean(row && typeof row === "object" && "id" in row)) : [];
}
function asAssets(value) {
    return Array.isArray(value) ? value.filter((row) => Boolean(row && typeof row === "object" && "id" in row)) : [];
}
function sortRows(rows) {
    return [...rows].sort((a, b) => {
        const parentDelta = String(a.parent_check_id ?? "").localeCompare(String(b.parent_check_id ?? ""));
        if (parentDelta !== 0)
            return parentDelta;
        const orderDelta = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (orderDelta !== 0)
            return orderDelta;
        const createdDelta = (a.created_at ? Date.parse(a.created_at) : 0) - (b.created_at ? Date.parse(b.created_at) : 0);
        if (createdDelta !== 0)
            return createdDelta;
        return String(a.title ?? a.id).localeCompare(String(b.title ?? b.id));
    });
}
function readProjectBasePaths() {
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
        const value = vscode.workspace.getConfiguration("appsecWorkbench", folder.uri).get("projectBasePathByAsset");
        if (value && typeof value === "object") {
            return value;
        }
    }
    return {};
}
async function updateProjectBasePath(assetId, basePath) {
    const cfg = vscode.workspace.getConfiguration("appsecWorkbench");
    const current = cfg.get("projectBasePathByAsset", {});
    const next = { ...current };
    if (basePath.trim()) {
        next[assetId] = basePath.trim();
    }
    else {
        delete next[assetId];
    }
    await cfg.update("projectBasePathByAsset", next, vscode.ConfigurationTarget.Workspace);
}
class Checks2Panel {
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
        this.view = null;
    }
    register(context) {
        context.subscriptions.push(vscode.window.registerWebviewViewProvider("appsecChecks2", this, {
            webviewOptions: { retainContextWhenHidden: true },
        }));
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist")],
        };
        webviewView.webview.html = this.renderHtml(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case "ready":
                    await this.pushData();
                    return;
                case "refresh":
                    this.scheduleRefresh(50);
                    return;
                case "createAssessment":
                    await this.createAssessment(message.payload ?? {});
                    return;
                case "createAsset":
                    await this.createAsset(message.payload ?? {});
                    return;
                case "updateAssessment":
                    if (message.assessmentId) {
                        await this.updateAssessment(message.assessmentId, message.payload ?? {});
                    }
                    return;
                case "deleteAssessment":
                    if (message.assessmentId) {
                        await this.deleteAssessment(message.assessmentId);
                    }
                    return;
                case "deleteAsset":
                    if (message.assetId) {
                        await this.deleteAsset(message.assetId);
                    }
                    return;
                case "setProjectBasePath":
                    if (message.assetId) {
                        await updateProjectBasePath(message.assetId, message.projectBasePath ?? "");
                        await this.pushData();
                    }
                    return;
                case "createCheck":
                    await this.createCheck(message.payload ?? {});
                    return;
                case "createChecksBulk":
                    await this.createChecksBulk(message.payloads ?? []);
                    return;
                case "updateCheck":
                    if (message.id) {
                        await this.updateCheck(message.id, message.payload ?? {});
                    }
                    return;
                case "deleteCheck":
                    if (message.id) {
                        await this.deleteCheck(message.id);
                    }
                    return;
                case "moveChecks":
                    await this.moveChecks(message.updates ?? []);
                    return;
                case "mapCases":
                    if (message.id) {
                        await this.mapCases(message.id, message.caseIds ?? []);
                    }
                    return;
                case "setAssessment":
                    await this.setAssessment(message.assessmentId ?? "");
                    return;
                case "setAsset":
                    await this.setAsset(message.assetId ?? "");
                    return;
                case "selectCase":
                    if (message.id) {
                        const resolved = await this.createApiClient().resolveIds();
                        if (typeof message.assetId === "string" && message.assetId && message.assetId !== resolved.assetId) {
                            await vscode.workspace.getConfiguration("appsecWorkbench").update("assetId", message.assetId, vscode.ConfigurationTarget.Workspace);
                        }
                        (0, activeCase_1.setActiveCase)({
                            id: message.id,
                            title: String(message.payload?.title ?? "Case"),
                            assessmentId: resolved.assessmentId,
                            assetId: typeof message.assetId === "string" ? message.assetId : resolved.assetId,
                        });
                        await vscode.commands.executeCommand("appsecWorkbench.refreshLinkedEntities");
                        await vscode.commands.executeCommand("appsecLinkedEntities.focus");
                        await this.pushData();
                    }
                    return;
                case "createCase":
                    await vscode.commands.executeCommand("appsecWorkbench.createCaseFromContext");
                    await this.pushData();
                    return;
                case "setCodeLensEnabled":
                    await vscode.workspace.getConfiguration("appsecWorkbench").update("selectionActionPopupEnabled", Boolean(message.payload?.enabled), vscode.ConfigurationTarget.Workspace);
                    return;
                case "updateAsset":
                    if (message.assetId) {
                        await this.updateAsset(message.assetId, message.payload ?? {});
                    }
                    return;
                default:
                    return;
            }
        });
        void this.pushData();
    }
    refreshConfig() {
        this.scheduleRefresh(0);
    }
    selectCheck(checkId) {
        if (!this.view) {
            return;
        }
        this.view.show?.(true);
        this.view.webview.postMessage({ type: "selectCheck", id: checkId });
    }
    scheduleRefresh(delayMs) {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = undefined;
            void this.pushData();
        }, delayMs);
    }
    createApiClient(state = (0, assessmentState_1.readState)()) {
        return new client_1.WorkbenchApiClient({
            apiBaseUrl: state.apiBaseUrl,
            assessmentId: state.assessmentId,
            assetId: state.assetId,
            authToken: state.authToken,
        });
    }
    async loadRows() {
        const state = (0, assessmentState_1.readState)();
        const empty = {
            rows: [],
            cases: [],
            relations: [],
            assessments: [],
            assets: [],
            projectBasePaths: {},
            assessmentId: "",
            assetId: "",
            activeCaseId: "",
            activeCaseTitle: "",
            activeCaseStatus: "",
            error: "",
        };
        try {
            const client = this.createApiClient(state);
            const assessments = asAssessments(await client.listAssessments());
            const projectBasePaths = readProjectBasePaths();
            if (!state.assessmentId.trim()) {
                return { ...empty, assessments, projectBasePaths, error: "Select assessment." };
            }
            const assessmentId = await client.resolveAssessmentId();
            const assets = asAssets(await client.listAssets(assessmentId));
            let assetId = await client.resolveAssetId(assessmentId);
            if (!assetId && assets[0]) {
                assetId = assets[0].id;
                await vscode.workspace.getConfiguration("appsecWorkbench").update("assetId", assetId, vscode.ConfigurationTarget.Workspace);
            }
            const [checks, cases, relations] = await Promise.all([
                client.listChecks(),
                client.listCases(),
                client.getRelations(),
            ]);
            const caseRows = asCases(cases);
            const activeCase = (0, activeCase_1.getActiveCase)();
            const scopedActiveCase = activeCase?.id
                && activeCase.assessmentId === assessmentId
                && caseRows.some((row) => row.id === activeCase.id)
                ? activeCase
                : null;
            if (activeCase?.id && !scopedActiveCase) {
                (0, activeCase_1.setActiveCase)(null);
            }
            const activeCaseRow = caseRows.find((row) => row.id === scopedActiveCase?.id);
            return {
                rows: sortRows(asRows(checks)),
                cases: caseRows,
                relations: asRelations(relations),
                assessments,
                assets,
                projectBasePaths,
                assessmentId,
                assetId,
                activeCaseId: scopedActiveCase?.id ?? "",
                activeCaseTitle: scopedActiveCase?.title ?? "",
                activeCaseStatus: activeCaseRow?.status ?? "",
                codeLensEnabled: (0, assessmentState_1.readState)().selectionActionPopupEnabled,
                error: "",
            };
        }
        catch (error) {
            return { ...empty, error: error instanceof Error ? error.message : String(error) };
        }
    }
    async setAssessment(assessmentId) {
        try {
            const client = this.createApiClient({ ...(0, assessmentState_1.readState)(), assessmentId, assetId: "" });
            const assets = assessmentId ? asAssets(await client.listAssets(assessmentId)) : [];
            const cfg = vscode.workspace.getConfiguration("appsecWorkbench");
            (0, activeCase_1.setActiveCase)(null);
            await cfg.update("assessmentId", assessmentId, vscode.ConfigurationTarget.Workspace);
            await cfg.update("assetId", assets[0]?.id ?? "", vscode.ConfigurationTarget.Workspace);
            await this.pushData();
        }
        catch (error) {
            this.postError(error);
        }
    }
    async setAsset(assetId) {
        try {
            await vscode.workspace.getConfiguration("appsecWorkbench").update("assetId", assetId, vscode.ConfigurationTarget.Workspace);
            await this.pushData();
        }
        catch (error) {
            this.postError(error);
        }
    }
    async createAssessment(payload) {
        try {
            const created = await this.createApiClient().createAssessment({
                title: String(payload.title ?? "").trim(),
                description: String(payload.description ?? ""),
            });
            const cfg = vscode.workspace.getConfiguration("appsecWorkbench");
            await cfg.update("assessmentId", created.id, vscode.ConfigurationTarget.Workspace);
            await cfg.update("assetId", "", vscode.ConfigurationTarget.Workspace);
            await this.pushData();
        }
        catch (error) {
            this.postError(error);
        }
    }
    async updateAssessment(assessmentId, payload) {
        try {
            await this.createApiClient().updateAssessment(assessmentId, {
                title: String(payload.title ?? "").trim(),
                description: String(payload.description ?? ""),
            });
            await this.pushData();
        }
        catch (error) {
            this.postError(error);
        }
    }
    async deleteAssessment(assessmentId) {
        try {
            await this.createApiClient().deleteAssessment(assessmentId);
            const cfg = vscode.workspace.getConfiguration("appsecWorkbench");
            const assessments = asAssessments(await this.createApiClient({ ...(0, assessmentState_1.readState)(), assessmentId: "", assetId: "" }).listAssessments());
            await cfg.update("assessmentId", assessments[0]?.id ?? "", vscode.ConfigurationTarget.Workspace);
            await cfg.update("assetId", "", vscode.ConfigurationTarget.Workspace);
            await this.pushData();
        }
        catch (error) {
            this.postError(error);
        }
    }
    async createAsset(payload) {
        try {
            const state = (0, assessmentState_1.readState)();
            const client = this.createApiClient(state);
            const assessmentId = await client.resolveAssessmentId();
            const created = await client.createAsset(assessmentId, {
                type: String(payload.type ?? "OTHER"),
                name: String(payload.name ?? "").trim(),
                locator: payload.locator == null ? null : String(payload.locator),
                version_ref: payload.version_ref == null ? null : String(payload.version_ref),
                metadata: typeof payload.metadata === "object" && payload.metadata ? payload.metadata : {},
            });
            await vscode.workspace.getConfiguration("appsecWorkbench").update("assetId", created.id, vscode.ConfigurationTarget.Workspace);
            if (typeof payload.projectBasePath === "string") {
                await updateProjectBasePath(created.id, payload.projectBasePath);
            }
            await this.pushData();
        }
        catch (error) {
            this.postError(error);
        }
    }
    async updateAsset(assetId, payload) {
        try {
            await this.createApiClient().updateAsset(assetId, payload);
            await this.pushData();
        }
        catch (error) {
            this.postError(error);
        }
    }
    async deleteAsset(assetId) {
        try {
            await this.createApiClient().deleteAsset(assetId);
            const state = (0, assessmentState_1.readState)();
            const client = this.createApiClient({ ...state, assetId: "" });
            const assessmentId = await client.resolveAssessmentId();
            const assets = asAssets(await client.listAssets(assessmentId));
            const cfg = vscode.workspace.getConfiguration("appsecWorkbench");
            await cfg.update("assetId", assets[0]?.id ?? "", vscode.ConfigurationTarget.Workspace);
            await updateProjectBasePath(assetId, "");
            await this.pushData();
        }
        catch (error) {
            this.postError(error);
        }
    }
    async createCheck(payload) {
        try {
            await this.createApiClient().createCheck(payload);
            await this.pushData();
        }
        catch (error) {
            this.postError(error);
        }
    }
    async createChecksBulk(payloads) {
        try {
            const client = this.createApiClient();
            for (const payload of payloads) {
                await client.createCheck(payload);
            }
            await this.pushData();
        }
        catch (error) {
            this.postError(error);
        }
    }
    async updateCheck(id, payload) {
        try {
            await this.createApiClient().updateCheck(id, payload);
            await this.pushData();
        }
        catch (error) {
            this.postError(error);
        }
    }
    async deleteCheck(id) {
        try {
            await this.createApiClient().deleteCheck(id);
            await this.pushData();
        }
        catch (error) {
            this.postError(error);
        }
    }
    async moveChecks(updates) {
        try {
            const client = this.createApiClient();
            await Promise.all(updates
                .filter((update) => Boolean(update.id && update.payload))
                .map((update) => client.updateCheck(update.id, update.payload)));
            await this.pushData();
        }
        catch (error) {
            this.postError(error);
        }
    }
    async mapCases(checkId, caseIds) {
        try {
            const client = this.createApiClient();
            const relationRows = asRelations(await client.getRelations());
            const current = relationRows.filter((relation) => relation.subject_type === "CHECK"
                && relation.subject_id === checkId
                && relation.predicate === "PART_OF"
                && relation.object_type === "CASE");
            const nextIds = new Set(caseIds);
            const currentIds = new Set(current.map((relation) => relation.object_id).filter((id) => Boolean(id)));
            await Promise.all(current
                .filter((relation) => relation.object_id && !nextIds.has(relation.object_id))
                .map((relation) => client.deleteRelation(relation.id)));
            await Promise.all(caseIds
                .filter((caseId) => !currentIds.has(caseId))
                .map((caseId) => client.createRelation({
                subject_type: "CHECK",
                subject_id: checkId,
                predicate: "PART_OF",
                object_type: "CASE",
                object_id: caseId,
                confidence: "MEDIUM",
                status: "ACCEPTED",
                source: "OTHER",
                properties: {},
            })));
            await this.pushData();
        }
        catch (error) {
            this.postError(error);
        }
    }
    postError(error) {
        this.view?.webview.postMessage({ type: "error", error: error instanceof Error ? error.message : String(error) });
    }
    async pushData() {
        if (!this.view)
            return;
        const payload = await this.loadRows();
        this.view.webview.postMessage({ type: "checks2Data", ...payload });
    }
    renderHtml(_webview) {
        const scriptNonce = nonce();
        const styleNonce = nonce();
        const csp = [
            "default-src 'none'",
            `style-src 'nonce-${styleNonce}'`,
            `script-src 'nonce-${scriptNonce}'`,
        ].join("; ");
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Checks2</title>
  <style nonce="${styleNonce}">
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body { margin: 0; color: var(--vscode-foreground); background: var(--vscode-sideBar-background); font: 12px/1.35 var(--vscode-font-family); }
    button, input, textarea, select { font: inherit; }
    .shell { display: grid; grid-template-rows: auto auto minmax(0, 1fr) auto; height: 100vh; min-width: 0; }
    .toolbar { display: flex; gap: 6px; align-items: center; padding: 7px 8px; border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border)); overflow-x: auto; }
    .selector { width: 150px; height: 24px; padding: 2px 6px; }
    .selector.case { width: 150px; }
    .btn { height: 24px; padding: 0 8px; color: var(--vscode-button-secondaryForeground); background: var(--vscode-button-secondaryBackground); border: 1px solid var(--vscode-button-border, transparent); border-radius: 3px; cursor: pointer; white-space: nowrap; }
    .btn.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    .btn.active { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    .btn:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
    .btn.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
    .btn:disabled { opacity: .45; cursor: default; }
    .stats { display: flex; gap: 5px; padding: 5px 8px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border)); white-space: nowrap; overflow: hidden; }
    .stat-chip { height: 22px; padding: 0 7px; color: var(--vscode-descriptionForeground); background: transparent; border: 1px solid transparent; border-radius: 3px; cursor: pointer; }
    .stat-chip.active { color: var(--vscode-foreground); border-color: var(--vscode-focusBorder); background: var(--vscode-list-hoverBackground); }
    .tree { overflow: auto; padding: 2px 0 6px; outline: none; }
    .drop-line { height: 2px; margin-left: var(--indent); border-left: 1px solid var(--vscode-tree-indentGuidesStroke, var(--vscode-panel-border)); }
    .drop-line.is-active { background: var(--vscode-list-dropBackground, var(--vscode-list-hoverBackground)); }
    .row { display: grid; grid-template-columns: 14px 17px minmax(0, 1fr) auto; align-items: center; min-height: 21px; gap: 3px; padding: 0 8px 0 var(--indent); cursor: default; border-left: 2px solid transparent; }
    .row:hover { background: var(--vscode-list-hoverBackground); }
    .row.selected { color: var(--vscode-list-activeSelectionForeground); background: var(--vscode-list-activeSelectionBackground); border-left-color: var(--vscode-focusBorder); }
    .row.selected:not(:focus) { outline: 1px solid color-mix(in srgb, var(--vscode-focusBorder) 45%, transparent); outline-offset: -1px; }
    .row.drop-inside { outline: 1px solid var(--vscode-list-dropBackground, var(--vscode-focusBorder)); outline-offset: -2px; }
    .row.is-dragging { opacity: .55; }
    .expander { width: 14px; height: 18px; padding: 0; color: var(--vscode-descriptionForeground); background: transparent; border: 0; cursor: pointer; }
    .expander.placeholder { cursor: default; opacity: .35; }
    .checkcell { display: flex; justify-content: center; align-items: center; }
    .checkcell input { width: 13px; height: 13px; margin: 0; }
    .marker { width: 13px; display: inline-block; color: var(--vscode-descriptionForeground); text-align: center; }
    .marker.good { color: var(--vscode-testing-iconPassed); }
    .marker.progress { color: var(--vscode-charts-blue); }
    .marker.bad { color: var(--vscode-testing-iconFailed); }
    .marker.warn { color: var(--vscode-testing-iconQueued); }
    .title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .title.group { font-weight: 600; }
    .linked-cases { margin-left: 8px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .case-prefix { color: var(--vscode-descriptionForeground); }
    .linked-case-button { padding: 0; color: var(--vscode-textLink-foreground); background: transparent; border: 0; cursor: pointer; }
    .linked-case-button:hover { text-decoration: underline; }
    .meta { padding-left: 8px; color: var(--vscode-descriptionForeground); font-size: 11px; white-space: nowrap; }
    .row.selected .meta, .row.selected .marker, .row.selected .expander { color: inherit; opacity: .85; }
    .detail { min-height: 118px; padding: 8px; border-top: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-panel-border)); background: var(--vscode-sideBar-background); }
    .detail-title { margin: 0 0 6px; font-size: 12px; font-weight: 600; }
    .detail-grid { display: grid; grid-template-columns: auto 1fr; gap: 3px 9px; margin-bottom: 7px; color: var(--vscode-descriptionForeground); }
    .detail-value { color: var(--vscode-foreground); overflow-wrap: anywhere; }
    .detail-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .history { display: grid; gap: 2px; margin-top: 7px; color: var(--vscode-descriptionForeground); font-size: 11px; }
    .history-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
    .empty, .error { padding: 12px 8px; color: var(--vscode-descriptionForeground); }
    .error { color: var(--vscode-errorForeground); }
    .field-error { min-height: 16px; color: var(--vscode-errorForeground); font-size: 11px; }
    .modal-backdrop { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, .32); z-index: 5; }
    .modal-backdrop.open { display: flex; }
    .modal { width: min(520px, 100%); max-height: calc(100vh - 32px); overflow: auto; color: var(--vscode-foreground); background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 6px; }
    .modal-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 10px; border-bottom: 1px solid var(--vscode-panel-border); }
    .modal-title { margin: 0; font-size: 13px; font-weight: 600; }
    .icon-btn { width: 24px; height: 24px; padding: 0; color: var(--vscode-icon-foreground); background: transparent; border: 0; cursor: pointer; }
    .form { display: grid; gap: 8px; padding: 10px; }
    .field { display: grid; gap: 4px; }
    .field.two { grid-template-columns: 1fr 1fr; gap: 8px; }
    .manager-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .danger-text { color: var(--vscode-errorForeground); }
    .confirm-body { padding: 10px; display: grid; gap: 10px; }
    label { color: var(--vscode-descriptionForeground); }
    input[type="text"], textarea, select { width: 100%; min-width: 0; color: var(--vscode-input-foreground); background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); border-radius: 3px; padding: 4px 6px; }
    textarea { resize: vertical; }
    .inline-check { display: flex; align-items: center; gap: 6px; color: var(--vscode-foreground); }
    .codelens-setting-row { position: relative; }
    .hotkey-help-wrap { position: relative; margin-left: auto; }
    .hotkey-help-btn { width: 18px; height: 18px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: #2563eb; font-size: 12px; font-weight: 700; line-height: 1; cursor: pointer; }
    .hotkey-help-btn:hover, .hotkey-help-btn.is-open { background: rgba(37, 99, 235, .12); }
    .hotkey-help-popover { position: absolute; right: 0; top: calc(100% + 4px); z-index: 20; display: none; min-width: 190px; padding: 6px 8px; color: var(--vscode-foreground); background: var(--vscode-editorWidget-background, var(--vscode-editor-background)); border: 1px solid var(--vscode-panel-border); border-radius: 4px; box-shadow: 0 2px 8px rgba(0, 0, 0, .2); }
    .hotkey-help-wrap:hover .hotkey-help-popover, .hotkey-help-popover.is-open { display: block; }
    .hotkey-help-title { font-size: 11px; font-weight: 600; color: var(--vscode-descriptionForeground); }
    .hotkey-help-list { margin: 4px 0 0; padding: 0; list-style: none; display: grid; gap: 3px; font-size: 11px; }
    .hotkey-help-list kbd { font-family: inherit; padding: 1px 4px; border-radius: 3px; background: var(--vscode-keybindingLabel-background, rgba(128, 128, 128, .2)); border: 1px solid var(--vscode-widget-border, transparent); }
    .form-actions { display: flex; gap: 6px; justify-content: flex-end; padding-top: 2px; }
    .context-menu { position: fixed; z-index: 10; min-width: 190px; padding: 4px 0; color: var(--vscode-menu-foreground); background: var(--vscode-menu-background); border: 1px solid var(--vscode-menu-border, var(--vscode-panel-border)); box-shadow: 0 2px 8px rgba(0,0,0,.24); }
    .context-menu[hidden] { display: none; }
    .menu-item { display: flex; align-items: center; gap: 7px; width: 100%; min-height: 24px; padding: 3px 10px; color: inherit; background: transparent; border: 0; text-align: left; cursor: pointer; }
    .menu-item:hover, .menu-item.active { color: var(--vscode-menu-selectionForeground); background: var(--vscode-menu-selectionBackground); }
    .menu-item.danger { color: var(--vscode-errorForeground); }
    .menu-separator { height: 1px; margin: 4px 0; background: var(--vscode-menu-separatorBackground, var(--vscode-panel-border)); }
    .case-list { display: grid; gap: 5px; max-height: 240px; overflow: auto; }
    .case-option { display: flex; align-items: center; gap: 7px; color: var(--vscode-foreground); }
  </style>
</head>
<body>
  <div class="shell">
    <div class="toolbar">
      <select id="assessmentSelect" class="selector" title="Assessment"></select>
      <select id="assetSelect" class="selector" title="Asset"></select>
      <select id="caseSelect" class="selector case" title="Case"></select>
      <button id="manageScope" class="btn" type="button">Manage</button>
      <button id="newCheck" class="btn" type="button">+ Check</button>
      <button id="newGroup" class="btn" type="button">+ Group</button>
      <button id="newCase" class="btn" type="button">+ Case</button>
      <button id="checksSettings" class="btn" type="button" title="Checks settings">⚙</button>
      <button id="refresh" class="btn" type="button">Refresh</button>
    </div>
    <div id="stats" class="stats"></div>
    <div id="tree" class="tree"></div>
    <div id="detail" class="detail"></div>
  </div>
  <div id="modalBackdrop" class="modal-backdrop" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <div class="modal-head">
        <h2 id="modalTitle" class="modal-title">Check</h2>
        <button id="modalClose" class="icon-btn" type="button" aria-label="Close">×</button>
      </div>
      <form id="checkForm" class="form">
        <input id="formMode" type="hidden" />
        <input id="formParentId" type="hidden" />
        <div class="field">
          <label for="formTitle">Title</label>
          <input id="formTitle" name="title" type="text" required />
        </div>
        <div class="field">
          <label for="formDescription">Description</label>
          <textarea id="formDescription" name="description" rows="3"></textarea>
        </div>
        <div id="modalCaseList" class="case-list" data-edit-only></div>
        <div class="field" data-edit-only data-check-only>
          <label for="formEditPriority">Priority</label>
          <select id="formEditPriority" name="edit_priority">
            <option>LOW</option><option>MEDIUM</option><option>HIGH</option><option>CRITICAL</option>
          </select>
        </div>
        <div class="field two" data-create-only>
          <div class="field">
            <label for="formCategory">Category</label>
            <input id="formCategory" name="category" type="text" />
          </div>
          <div class="field" data-check-only>
            <label for="formType">Check type</label>
            <input id="formType" name="check_type" type="text" />
          </div>
        </div>
        <div class="field two" data-create-only data-check-only>
          <div class="field">
            <label for="formPriority">Priority</label>
            <select id="formPriority" name="priority">
              <option>LOW</option><option selected>MEDIUM</option><option>HIGH</option><option>CRITICAL</option>
            </select>
          </div>
          <div class="field">
            <label for="formStatus">Status</label>
            <select id="formStatus" name="status">
              <option>NOT_STARTED</option><option>IN_PROGRESS</option><option>NEEDS_REVIEW</option><option>CHECKED_OK</option><option>CHECKED_WEAK</option><option>FAILED</option><option>NOT_APPLICABLE</option><option>BLOCKED</option>
            </select>
          </div>
        </div>
        <label class="inline-check" data-create-only data-check-only>
          <input id="formChecked" name="is_checked" type="checkbox" />
          <span>Marked complete</span>
        </label>
        <div class="field" data-create-only data-check-only>
          <label for="formReason">Reason</label>
          <textarea id="formReason" name="reason" rows="3"></textarea>
        </div>
        <div class="form-actions">
          <button id="addChildFromForm" class="btn" type="button">Add child</button>
          <button id="addGroupFromForm" class="btn" type="button">Add group</button>
          <button class="btn primary" type="submit">Save</button>
        </div>
      </form>
    </div>
  </div>
  <div id="caseBackdrop" class="modal-backdrop" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="caseModalTitle">
      <div class="modal-head">
        <h2 id="caseModalTitle" class="modal-title">Map To Cases</h2>
        <button id="caseModalClose" class="icon-btn" type="button" aria-label="Close">×</button>
      </div>
      <form id="caseForm" class="form">
        <div id="caseList" class="case-list"></div>
        <div class="form-actions">
          <button class="btn primary" type="submit">Save mapping</button>
        </div>
      </form>
    </div>
  </div>
  <div id="bulkBackdrop" class="modal-backdrop" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="bulkModalTitle">
      <div class="modal-head">
        <h2 id="bulkModalTitle" class="modal-title">Add Checks In Bulk</h2>
        <button id="bulkModalClose" class="icon-btn" type="button" aria-label="Close">×</button>
      </div>
      <form id="bulkForm" class="form">
        <div id="bulkTarget" class="detail-value"></div>
        <div class="field">
          <label for="bulkText">One check per line</label>
          <textarea id="bulkText" rows="10"></textarea>
        </div>
        <div id="bulkCount" class="detail-value">Will add: 0</div>
        <div class="form-actions">
          <button class="btn primary" type="submit">Add checks</button>
        </div>
      </form>
    </div>
  </div>
  <div id="assessmentBackdrop" class="modal-backdrop" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="assessmentModalTitle">
      <div class="modal-head">
        <h2 id="assessmentModalTitle" class="modal-title">Create Assessment</h2>
        <button id="assessmentModalClose" class="icon-btn" type="button" aria-label="Close">×</button>
      </div>
      <form id="assessmentForm" class="form">
        <div class="field">
          <label for="assessmentTitle">Title</label>
          <input id="assessmentTitle" name="title" type="text" required />
        </div>
        <div class="field">
          <label for="assessmentDescription">Description</label>
          <textarea id="assessmentDescription" name="description" rows="3"></textarea>
        </div>
        <div class="form-actions">
          <button class="btn primary" type="submit">Create assessment</button>
        </div>
      </form>
    </div>
  </div>
  <div id="assetBackdrop" class="modal-backdrop" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="assetModalTitle">
      <div class="modal-head">
        <h2 id="assetModalTitle" class="modal-title">Asset Settings</h2>
        <button id="assetModalClose" class="icon-btn" type="button" aria-label="Close">×</button>
      </div>
      <form id="assetForm" class="form">
        <div class="field two">
          <div class="field">
            <label for="assetName">Name</label>
            <input id="assetName" name="name" type="text" required />
          </div>
          <div class="field">
            <label for="assetType">Type</label>
            <select id="assetType" name="type">
              <option>REPOSITORY</option><option>URL</option><option>URL_GROUP</option><option>DOMAIN</option><option>SERVICE</option><option>API_SPEC</option><option>BLACKBOX_TARGET</option><option>BINARY</option><option>CONTAINER_IMAGE</option><option>DOCUMENT</option><option>OTHER</option>
            </select>
          </div>
        </div>
        <div class="field">
          <label for="assetLocator">Locator</label>
          <input id="assetLocator" name="locator" type="text" />
        </div>
        <div class="field">
          <label for="assetProjectPath">Project base path</label>
          <input id="assetProjectPath" name="project_base_path" type="text" placeholder="/workspace/repo" />
        </div>
        <div class="field">
          <label for="assetVersion">Version ref</label>
          <input id="assetVersion" name="version_ref" type="text" />
        </div>
        <div class="field">
          <label for="assetMetadata">Metadata JSON</label>
          <textarea id="assetMetadata" name="metadata" rows="3"></textarea>
          <div id="assetMetadataError" class="field-error"></div>
        </div>
        <div class="form-actions">
          <button id="assetSubmit" class="btn primary" type="submit">Save asset</button>
        </div>
      </form>
    </div>
  </div>
  <div id="manageBackdrop" class="modal-backdrop" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="manageModalTitle">
      <div class="modal-head">
        <h2 id="manageModalTitle" class="modal-title">Manage Assessments And Assets</h2>
        <button id="manageModalClose" class="icon-btn" type="button" aria-label="Close">×</button>
      </div>
      <div class="form">
        <div class="manager-grid">
          <div class="field">
            <label for="manageAssessmentSelect">Assessment</label>
            <select id="manageAssessmentSelect"></select>
          </div>
          <div class="field">
            <label for="manageAssetSelect">Asset</label>
            <select id="manageAssetSelect"></select>
          </div>
        </div>
        <form id="manageAssessmentForm" class="field">
          <label for="manageAssessmentTitle">Assessment title</label>
          <input id="manageAssessmentTitle" type="text" required />
          <textarea id="manageAssessmentDescription" rows="2" placeholder="Description"></textarea>
          <div class="form-actions">
            <button id="manageAssessmentDelete" class="btn danger-text" type="button">Delete assessment</button>
            <button id="manageAssessmentNew" class="btn" type="button">New assessment</button>
            <button class="btn primary" type="submit">Save assessment</button>
          </div>
        </form>
        <form id="manageAssetForm" class="field">
          <label for="manageAssetName">Asset</label>
          <div class="field two">
            <input id="manageAssetName" type="text" required />
            <select id="manageAssetType">
              <option>REPOSITORY</option><option>URL</option><option>URL_GROUP</option><option>DOMAIN</option><option>SERVICE</option><option>API_SPEC</option><option>BLACKBOX_TARGET</option><option>BINARY</option><option>CONTAINER_IMAGE</option><option>DOCUMENT</option><option>OTHER</option>
            </select>
          </div>
          <input id="manageAssetLocator" type="text" placeholder="Asset locator" />
          <input id="manageAssetProjectPath" type="text" placeholder="Project base path" />
          <input id="manageAssetVersion" type="text" placeholder="Version ref" />
          <textarea id="manageAssetMetadata" rows="2" placeholder="{}"></textarea>
          <div id="manageAssetMetadataError" class="field-error"></div>
          <div class="form-actions">
            <button id="manageAssetDelete" class="btn danger-text" type="button">Delete asset</button>
            <button id="manageAssetNew" class="btn" type="button">New asset</button>
            <button class="btn primary" type="submit">Save asset</button>
          </div>
        </form>
      </div>
    </div>
  </div>
  <div id="confirmBackdrop" class="modal-backdrop" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="confirmModalTitle">
      <div class="modal-head">
        <h2 id="confirmModalTitle" class="modal-title">Confirm Delete</h2>
        <button id="confirmModalClose" class="icon-btn" type="button" aria-label="Close">×</button>
      </div>
      <div class="confirm-body">
        <div id="confirmMessage" class="detail-value"></div>
        <div class="form-actions">
          <button id="confirmCancel" class="btn" type="button">Cancel</button>
          <button id="confirmOk" class="btn primary" type="button">Delete</button>
        </div>
      </div>
    </div>
  </div>
  <div id="settingsBackdrop" class="modal-backdrop" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="settingsModalTitle">
      <div class="modal-head">
        <h2 id="settingsModalTitle" class="modal-title">Checks Settings</h2>
        <button id="settingsModalClose" class="icon-btn" type="button" aria-label="Close">×</button>
      </div>
      <div class="form">
        <label class="inline-check">
          <input id="showPriorityToggle" type="checkbox" />
          <span>Show priority in check rows</span>
        </label>
        <label class="inline-check">
          <input id="showStatsFilterToggle" type="checkbox" />
          <span>Show summary filters</span>
        </label>
        <label class="inline-check codelens-setting-row">
          <input id="showCodeLensToggle" type="checkbox" />
          <span>Show CodeLens actions</span>
          <span class="hotkey-help-wrap">
            <button id="codeLensHotkeyHelp" class="hotkey-help-btn" type="button" aria-label="Keyboard shortcuts">?</button>
            <div id="codeLensHotkeyPopover" class="hotkey-help-popover">
              <div class="hotkey-help-title">Editor shortcuts</div>
              <ul class="hotkey-help-list">
                <li><kbd>Alt+Shift+M</kbd> Mark</li>
                <li><kbd>Alt+Shift+S</kbd> Source</li>
                <li><kbd>Alt+Shift+K</kbd> Sink</li>
                <li><kbd>Alt+Shift+G</kbd> Guard</li>
                <li><kbd>Alt+Shift+T</kbd> Transform</li>
                <li><kbd>Alt+Shift+C</kbd> Create Check</li>
              </ul>
            </div>
          </span>
        </label>
      </div>
    </div>
  </div>
  <div id="contextMenu" class="context-menu" hidden></div>
  <script nonce="${scriptNonce}">
    const vscode = acquireVsCodeApi();
    const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'NEEDS_REVIEW', 'CHECKED_OK', 'CHECKED_WEAK', 'FAILED', 'NOT_APPLICABLE', 'BLOCKED'];
    const OPEN_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'NEEDS_REVIEW', 'FAILED', 'BLOCKED'];
    const CREATE_NEW_CASE_VALUE = '__create_new__';
    let rows = [];
    let cases = [];
    let relations = [];
    let assessments = [];
    let assets = [];
    let projectBasePaths = {};
    let currentAssessmentId = '';
    let currentAssetId = '';
    let activeCaseId = '';
    let activeCaseStatus = '';
    let selectedId = '';
    let selectedIds = new Set();
    let lastSelectedId = '';
    let draggingIds = [];
    let collapsedIds = new Set();
    let draggingId = '';
    let modalKind = '';
    let modalRowId = '';
    let modalParentId = null;
    let modalIsGroup = false;
    let caseModalRowId = '';
    let bulkParentId = null;
    let assetModalMode = 'edit';
    let manageAssetMode = 'edit';
    let manageAssessmentId = '';
    let manageAssetId = '';
    let pendingConfirm = null;
    let viewState = vscode.getState() || {};
    let showPriority = Boolean(viewState.showPriority);
    let showStatsFilter = viewState.showStatsFilter !== false;
    let codeLensEnabled = true;
    let activeStatsFilter = viewState.activeStatsFilter || 'all';

    const tree = document.getElementById('tree');
    const detail = document.getElementById('detail');
    const stats = document.getElementById('stats');
    const assessmentSelect = document.getElementById('assessmentSelect');
    const assetSelect = document.getElementById('assetSelect');
    const caseSelect = document.getElementById('caseSelect');
    const contextMenu = document.getElementById('contextMenu');
    const backdrop = document.getElementById('modalBackdrop');
    const caseBackdrop = document.getElementById('caseBackdrop');
    const bulkBackdrop = document.getElementById('bulkBackdrop');
    const assessmentBackdrop = document.getElementById('assessmentBackdrop');
    const assetBackdrop = document.getElementById('assetBackdrop');
    const manageBackdrop = document.getElementById('manageBackdrop');
    const confirmBackdrop = document.getElementById('confirmBackdrop');
    const settingsBackdrop = document.getElementById('settingsBackdrop');
    const caseForm = document.getElementById('caseForm');
    const bulkForm = document.getElementById('bulkForm');
    const assessmentForm = document.getElementById('assessmentForm');
    const assetForm = document.getElementById('assetForm');
    const caseList = document.getElementById('caseList');
    const bulkText = document.getElementById('bulkText');
    const bulkTarget = document.getElementById('bulkTarget');
    const bulkCount = document.getElementById('bulkCount');
    const assessmentTitleInput = document.getElementById('assessmentTitle');
    const assessmentDescriptionInput = document.getElementById('assessmentDescription');
    const assetNameInput = document.getElementById('assetName');
    const assetTypeInput = document.getElementById('assetType');
    const assetLocatorInput = document.getElementById('assetLocator');
    const assetProjectPathInput = document.getElementById('assetProjectPath');
    const assetVersionInput = document.getElementById('assetVersion');
    const assetMetadataInput = document.getElementById('assetMetadata');
    const assetMetadataError = document.getElementById('assetMetadataError');
    const assetSubmit = document.getElementById('assetSubmit');
    const manageAssessmentSelect = document.getElementById('manageAssessmentSelect');
    const manageAssetSelect = document.getElementById('manageAssetSelect');
    const manageAssessmentForm = document.getElementById('manageAssessmentForm');
    const manageAssessmentTitle = document.getElementById('manageAssessmentTitle');
    const manageAssessmentDescription = document.getElementById('manageAssessmentDescription');
    const manageAssessmentDelete = document.getElementById('manageAssessmentDelete');
    const manageAssessmentNew = document.getElementById('manageAssessmentNew');
    const manageAssetForm = document.getElementById('manageAssetForm');
    const manageAssetName = document.getElementById('manageAssetName');
    const manageAssetType = document.getElementById('manageAssetType');
    const manageAssetLocator = document.getElementById('manageAssetLocator');
    const manageAssetProjectPath = document.getElementById('manageAssetProjectPath');
    const manageAssetVersion = document.getElementById('manageAssetVersion');
    const manageAssetMetadata = document.getElementById('manageAssetMetadata');
    const manageAssetMetadataError = document.getElementById('manageAssetMetadataError');
    const manageAssetDelete = document.getElementById('manageAssetDelete');
    const manageAssetNew = document.getElementById('manageAssetNew');
    const confirmMessage = document.getElementById('confirmMessage');
    const form = document.getElementById('checkForm');
    const modalCaseList = document.getElementById('modalCaseList');
    const titleInput = document.getElementById('formTitle');
    const descriptionInput = document.getElementById('formDescription');
    const categoryInput = document.getElementById('formCategory');
    const typeInput = document.getElementById('formType');
    const priorityInput = document.getElementById('formPriority');
    const editPriorityInput = document.getElementById('formEditPriority');
    const statusInput = document.getElementById('formStatus');
    const checkedInput = document.getElementById('formChecked');
    const reasonInput = document.getElementById('formReason');

    function text(value) { return String(value ?? '').trim(); }
    function lookup(value) { return text(value).toLowerCase(); }
    function duplicateAssessmentTitle(title, exceptId) {
      const normalized = lookup(title);
      return assessments.some((item) => item.id !== exceptId && lookup(item.title) === normalized);
    }
    function duplicateAssetName(name, exceptId) {
      const normalized = lookup(name);
      return assets.some((item) => item.id !== exceptId && lookup(item.name) === normalized);
    }
    function rowTitle(row) { return text(row.title) || row.id; }
    function isOpen(row) { return !row.is_group && OPEN_STATUSES.includes(row.status); }
    function byId(id) { return rows.find((row) => row.id === id) || null; }
    function childrenOf(parentId) { return rows.filter((row) => (row.parent_check_id || null) === parentId).sort(compareRows); }
    function filteredIds() {
      if (activeStatsFilter === 'all') return null;
      const matches = (row) => {
        if (activeStatsFilter === 'checks') return !row.is_group;
        if (activeStatsFilter === 'open') return isOpen(row);
        if (activeStatsFilter === 'done') return !row.is_group && (row.is_checked || row.status === 'CHECKED_OK');
        return true;
      };
      const visible = new Set();
      const byRowId = new Map(rows.map((row) => [row.id, row]));
      for (const row of rows) {
        if (!matches(row)) continue;
        visible.add(row.id);
        let parentId = row.parent_check_id || null;
        while (parentId) {
          visible.add(parentId);
          parentId = byRowId.get(parentId)?.parent_check_id || null;
        }
      }
      return visible;
    }
    function visibleChildrenOf(parentId, visibleSet) {
      const children = childrenOf(parentId);
      return visibleSet ? children.filter((row) => visibleSet.has(row.id)) : children;
    }
    function linkedCases(checkId) {
      const caseById = new Map(cases.map((item) => [item.id, item]));
      return relations
        .filter((relation) => relation.subject_type === 'CHECK' && relation.subject_id === checkId && relation.predicate === 'PART_OF' && relation.object_type === 'CASE')
        .map((relation) => caseById.get(relation.object_id))
        .filter(Boolean);
    }
    function linkedCasesLabel(checkId) {
      const linked = linkedCases(checkId);
      if (!linked.length) return '';
      const visible = linked.slice(0, 2).map((item) => item.title || item.id).join(' · ');
      return visible + (linked.length > 2 ? ' · +' + (linked.length - 2) : '');
    }
    function linkedCasesButtons(checkId) {
      return linkedCases(checkId).slice(0, 2);
    }
    function caseAssetLabel(caseRow) {
      if (!caseRow.asset_id) return 'no asset';
      const asset = assets.find((item) => item.id === caseRow.asset_id);
      return asset ? (asset.name || asset.id) : 'other asset';
    }
    function saveViewState() {
      viewState = Object.assign({}, viewState, { showPriority, showStatsFilter, activeStatsFilter });
      vscode.setState(viewState);
    }
    function sortedCases() {
      return [...cases].sort((a, b) => {
        const aCurrent = a.asset_id === currentAssetId ? 0 : 1;
        const bCurrent = b.asset_id === currentAssetId ? 0 : 1;
        if (aCurrent !== bCurrent) return aCurrent - bCurrent;
        return String(a.title || a.id).localeCompare(String(b.title || b.id));
      });
    }
    function compareRows(a, b) {
      const orderDelta = (a.sort_order ?? 0) - (b.sort_order ?? 0);
      if (orderDelta) return orderDelta;
      const createdDelta = Date.parse(a.created_at || '') - Date.parse(b.created_at || '');
      if (createdDelta) return createdDelta;
      return rowTitle(a).localeCompare(rowTitle(b));
    }
    function hasChildren(id) { return childrenOf(id).length > 0; }
    function descendantIds(id) {
      const result = new Set();
      function walk(parentId) {
        for (const child of childrenOf(parentId)) {
          result.add(child.id);
          walk(child.id);
        }
      }
      walk(id);
      return result;
    }
    function statusMarker(row) {
      if (row.is_group) return { glyph: '', cls: '' };
      if (row.is_checked || row.status === 'CHECKED_OK') return { glyph: '✓', cls: 'good' };
      if (row.status === 'IN_PROGRESS') return { glyph: '▶', cls: 'progress' };
      if (row.status === 'FAILED') return { glyph: '!', cls: 'bad' };
      if (row.status === 'BLOCKED' || row.status === 'NOT_APPLICABLE') return { glyph: '⊘', cls: 'warn' };
      if (row.status === 'NEEDS_REVIEW') return { glyph: '?', cls: 'warn' };
      return { glyph: '', cls: '' };
    }
    function nextSortOrder(parentId) {
      const siblings = childrenOf(parentId);
      return siblings.length ? Math.max(...siblings.map((row) => row.sort_order ?? 0)) + 1 : 0;
    }
    function updateToolbar() {
      return;
    }
    function renderSelectors() {
      const previousAssessment = assessmentSelect.value;
      assessmentSelect.textContent = '';
      const assessmentPlaceholder = document.createElement('option');
      assessmentPlaceholder.value = '';
      assessmentPlaceholder.textContent = assessments.length ? 'Select assessment...' : 'No assessments';
      assessmentSelect.appendChild(assessmentPlaceholder);
      for (const item of assessments) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.title || item.id;
        assessmentSelect.appendChild(option);
      }
      assessmentSelect.value = currentAssessmentId || previousAssessment || '';

      assetSelect.textContent = '';
      const assetPlaceholder = document.createElement('option');
      assetPlaceholder.value = '';
      assetPlaceholder.textContent = assets.length ? 'Select asset...' : 'No assets';
      assetSelect.appendChild(assetPlaceholder);
      for (const item of assets) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name || item.id;
        assetSelect.appendChild(option);
      }
      assetSelect.value = currentAssetId || '';
      assetSelect.disabled = !currentAssessmentId || !assets.length;

      caseSelect.textContent = '';
      const casePlaceholder = document.createElement('option');
      casePlaceholder.value = '';
      casePlaceholder.textContent = cases.length ? 'Select case...' : 'No cases';
      caseSelect.appendChild(casePlaceholder);
      const createOption = document.createElement('option');
      createOption.value = CREATE_NEW_CASE_VALUE;
      createOption.textContent = 'Create new from current';
      createOption.disabled = !currentAssetId;
      caseSelect.appendChild(createOption);
      for (const item of sortedCases()) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.asset_id === currentAssetId ? (item.title || item.id) : (item.title || item.id) + ' · ' + caseAssetLabel(item);
        if (item.asset_id !== currentAssetId) option.style.color = 'var(--vscode-descriptionForeground)';
        caseSelect.appendChild(option);
      }
      caseSelect.value = activeCaseId || '';
      caseSelect.disabled = !currentAssessmentId || !cases.length;
    }
    function updateStats() {
      stats.style.display = showStatsFilter ? '' : 'none';
      if (!showStatsFilter) {
        stats.textContent = '';
        return;
      }
      const checks = rows.filter((row) => !row.is_group).length;
      const open = rows.filter(isOpen).length;
      const done = rows.filter((row) => !row.is_group && (row.is_checked || row.status === 'CHECKED_OK')).length;
      stats.textContent = '';
      for (const item of [
        ['all', 'All ' + rows.length],
        ['checks', 'Checks ' + checks],
        ['open', 'Open ' + open],
        ['done', 'Done ' + done]
      ]) {
        const button = document.createElement('button');
        button.className = 'stat-chip' + (activeStatsFilter === item[0] ? ' active' : '');
        button.type = 'button';
        button.dataset.filter = item[0];
        button.textContent = item[1];
        stats.appendChild(button);
      }
    }
    function renderTree() {
      tree.textContent = '';
      if (!rows.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No checks loaded.';
        tree.appendChild(empty);
        return;
      }
      const visibleSet = filteredIds();
      const fragment = document.createDocumentFragment();
      for (const root of visibleChildrenOf(null, visibleSet)) renderNode(root, 0, fragment, visibleSet);
      const rootDrop = document.createElement('div');
      rootDrop.className = 'drop-line';
      rootDrop.style.setProperty('--indent', '6px');
      rootDrop.dataset.dropParent = '';
      rootDrop.dataset.dropIndex = String(visibleChildrenOf(null, visibleSet).length);
      fragment.appendChild(rootDrop);
      tree.appendChild(fragment);
    }
    function renderNode(row, depth, fragment, visibleSet) {
      const siblings = visibleChildrenOf(row.parent_check_id || null, visibleSet);
      const index = siblings.findIndex((item) => item.id === row.id);
      const before = document.createElement('div');
      before.className = 'drop-line';
      before.style.setProperty('--indent', 6 + depth * 14 + 'px');
      before.dataset.dropParent = row.parent_check_id || '';
      before.dataset.dropIndex = String(Math.max(0, index));
      fragment.appendChild(before);

      const childCount = visibleChildrenOf(row.id, visibleSet).length;
      const marker = statusMarker(row);
      const item = document.createElement('div');
      item.className = 'row' + (selectedIds.has(row.id) ? ' selected' : '') + (row.id === draggingId ? ' is-dragging' : '');
      item.style.setProperty('--indent', 6 + depth * 14 + 'px');
      item.dataset.id = row.id;
      item.draggable = true;

      const expander = document.createElement('button');
      expander.className = 'expander' + (childCount ? '' : ' placeholder');
      expander.type = 'button';
      expander.dataset.action = 'toggle';
      expander.textContent = childCount ? (collapsedIds.has(row.id) ? '+' : '−') : '';
      expander.title = childCount ? (collapsedIds.has(row.id) ? 'Expand' : 'Collapse') : '';

      const checkcell = document.createElement('div');
      checkcell.className = 'checkcell';
      if (!row.is_group) {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = Boolean(row.is_checked || row.status === 'CHECKED_OK');
        checkbox.dataset.action = 'toggleChecked';
        checkcell.appendChild(checkbox);
      }

      const title = document.createElement('div');
      title.className = 'title' + (row.is_group ? ' group' : '');
      const glyph = document.createElement('span');
      glyph.className = 'marker ' + marker.cls;
      glyph.textContent = marker.glyph;
      title.appendChild(glyph);
      const caseLabel = linkedCasesLabel(row.id);
      if (caseLabel) {
        const prefix = document.createElement('span');
        prefix.className = 'case-prefix';
        prefix.textContent = 'Cases: ';
        title.appendChild(prefix);
        const linked = document.createElement('span');
        linked.className = 'linked-cases';
        linked.style.marginLeft = '0';
        linked.title = linkedCases(row.id).map((item) => item.title || item.id).join(' · ');
        for (const caseRow of linkedCasesButtons(row.id)) {
          const caseButton = document.createElement('button');
          caseButton.className = 'linked-case-button';
          caseButton.type = 'button';
          caseButton.dataset.action = 'openCase';
          caseButton.dataset.caseId = caseRow.id;
          caseButton.dataset.caseTitle = caseRow.title || caseRow.id;
          caseButton.dataset.assetId = caseRow.asset_id || '';
          caseButton.textContent = caseRow.title || caseRow.id;
          linked.appendChild(caseButton);
        }
        const hiddenCount = Math.max(0, linkedCases(row.id).length - linkedCasesButtons(row.id).length);
        if (hiddenCount) linked.appendChild(document.createTextNode(' +' + hiddenCount));
        title.appendChild(linked);
        title.appendChild(document.createTextNode('  '));
      }
      title.appendChild(document.createTextNode(rowTitle(row)));

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = row.is_group ? 'group' : (showPriority ? row.priority || 'MEDIUM' : '');

      item.append(expander, checkcell, title, meta);
      fragment.appendChild(item);
      if (childCount && !collapsedIds.has(row.id)) {
        for (const child of visibleChildrenOf(row.id, visibleSet)) renderNode(child, depth + 1, fragment, visibleSet);
      }
    }
    function renderDetail() {
      const selectedRows = selectedRowList();
      const row = byId(selectedId);
      updateToolbar();
      if (selectedRows.length > 1) {
        detail.innerHTML = '<div class="empty">' + selectedRows.length + ' checks selected.</div>';
        return;
      }
      if (!row) {
        detail.innerHTML = '<div class="empty">Select a check.</div>';
        return;
      }
      detail.textContent = '';
      const title = document.createElement('h3');
      title.className = 'detail-title';
      title.textContent = rowTitle(row);
      const grid = document.createElement('div');
      grid.className = 'detail-grid';
      const key = document.createElement('div');
      key.textContent = 'Cases';
      const value = document.createElement('div');
      value.className = 'detail-value';
      const linked = linkedCases(row.id);
      if (!linked.length) {
        value.textContent = '-';
      } else {
        linked.forEach((caseRow, index) => {
          if (index) value.appendChild(document.createTextNode(', '));
          const caseButton = document.createElement('button');
          caseButton.className = 'linked-case-button';
          caseButton.type = 'button';
          caseButton.dataset.action = 'openCase';
          caseButton.dataset.caseId = caseRow.id;
          caseButton.dataset.caseTitle = caseRow.title || caseRow.id;
          caseButton.dataset.assetId = caseRow.asset_id || '';
          caseButton.textContent = caseRow.title || caseRow.id;
          value.appendChild(caseButton);
        });
      }
      grid.append(key, value);
      const description = document.createElement('div');
      description.className = 'detail-value';
      description.textContent = text(row.description) || text(row.reason) || 'No description.';
      const actions = document.createElement('div');
      actions.className = 'detail-actions';
      detail.append(title, grid, description);
      detail.appendChild(actions);
    }
    function button(label, action) {
      const element = document.createElement('button');
      element.className = 'btn';
      element.type = 'button';
      element.dataset.action = action;
      element.textContent = label;
      return element;
    }
    function selectedRowList() {
      return Array.from(selectedIds).map((id) => byId(id)).filter(Boolean);
    }
    function syncSelectedClasses(previousIds) {
      for (const id of previousIds) {
        const element = tree.querySelector('[data-id="' + CSS.escape(id) + '"]');
        if (element) element.classList.remove('selected');
      }
      for (const id of selectedIds) {
        const element = tree.querySelector('[data-id="' + CSS.escape(id) + '"]');
        if (element) element.classList.add('selected');
      }
    }
    function visibleRowIds() {
      return Array.from(tree.querySelectorAll('.row[data-id]')).map((element) => element.dataset.id).filter(Boolean);
    }
    function scrollSelectedRowIntoView() {
      if (!selectedId) return;
      const element = tree.querySelector('[data-id="' + CSS.escape(selectedId) + '"]');
      element?.scrollIntoView({ block: 'nearest' });
    }
    function handleTreeKeyboard(event) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
        return;
      }
      if (backdrop.classList.contains('open') || caseBackdrop.classList.contains('open') || bulkBackdrop.classList.contains('open') || assessmentBackdrop.classList.contains('open') || assetBackdrop.classList.contains('open') || manageBackdrop.classList.contains('open') || confirmBackdrop.classList.contains('open') || settingsBackdrop.classList.contains('open')) {
        return;
      }
      const visible = visibleRowIds();
      if (!visible.length) return;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        event.stopPropagation();
        let index = visible.indexOf(selectedId);
        if (index < 0) index = event.key === 'ArrowDown' ? -1 : visible.length;
        const nextIndex = event.key === 'ArrowDown'
          ? Math.min(index + 1, visible.length - 1)
          : Math.max(index - 1, 0);
        const nextId = visible[nextIndex];
        if (nextId && nextId !== selectedId) {
          selectRow(nextId);
          scrollSelectedRowIntoView();
        }
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        const row = byId(selectedId);
        if (row && hasChildren(row.id)) {
          if (collapsedIds.has(row.id)) collapsedIds.delete(row.id); else collapsedIds.add(row.id);
          renderTree();
          scrollSelectedRowIntoView();
        }
      }
    }
    function selectRange(id) {
      const previous = new Set(selectedIds);
      const visible = visibleRowIds();
      const anchor = lastSelectedId && visible.includes(lastSelectedId) ? lastSelectedId : selectedId;
      const start = visible.indexOf(anchor);
      const end = visible.indexOf(id);
      if (start < 0 || end < 0) {
        selectRow(id);
        return;
      }
      selectedIds = new Set(visible.slice(Math.min(start, end), Math.max(start, end) + 1));
      selectedId = id;
      syncSelectedClasses(previous);
      renderDetail();
    }
    function selectRow(id) {
      if (selectedIds.size === 1 && selectedIds.has(id)) return;
      const previous = new Set(selectedIds);
      selectedId = id;
      lastSelectedId = id;
      selectedIds = new Set([id]);
      syncSelectedClasses(previous);
      renderDetail();
    }
    function selectCheckById(id) {
      const row = byId(id);
      if (!row) return;
      let parentId = row.parent_check_id || null;
      while (parentId) {
        collapsedIds.delete(parentId);
        parentId = byId(parentId)?.parent_check_id || null;
      }
      const previous = new Set(selectedIds);
      selectedId = id;
      lastSelectedId = id;
      selectedIds = new Set([id]);
      activeStatsFilter = 'all';
      saveViewState();
      renderAll();
      syncSelectedClasses(previous);
      const element = tree.querySelector('[data-id="' + CSS.escape(id) + '"]');
      if (element) element.scrollIntoView({ block: 'center' });
    }
    function openModal(kind, options) {
      const row = options && options.row ? options.row : null;
      const isEdit = kind === 'edit';
      modalKind = kind;
      modalRowId = row ? row.id : '';
      modalParentId = options && 'parentId' in options ? options.parentId : (row ? row.parent_check_id || null : null);
      modalIsGroup = Boolean(options && options.isGroup);
      if (kind === 'edit' && row) modalIsGroup = Boolean(row.is_group);
      document.getElementById('modalTitle').textContent = isEdit ? (modalIsGroup ? 'Edit Group' : 'Edit Check') : (modalIsGroup ? 'New Group' : 'New Check');
      titleInput.required = true;
      titleInput.value = isEdit && row ? rowTitle(row) : '';
      descriptionInput.value = isEdit && row ? text(row.description) : '';
      categoryInput.value = isEdit && row ? text(row.category) : '';
      typeInput.value = isEdit && row ? text(row.check_type) : '';
      priorityInput.value = isEdit && row ? text(row.priority || 'MEDIUM') : 'MEDIUM';
      editPriorityInput.value = isEdit && row ? text(row.priority || 'MEDIUM') : 'MEDIUM';
      statusInput.value = isEdit && row ? text(row.status || 'NOT_STARTED') : 'NOT_STARTED';
      checkedInput.checked = isEdit && row ? Boolean(row.is_checked || row.status === 'CHECKED_OK') : false;
      reasonInput.value = isEdit && row ? text(row.reason) : '';
      for (const element of form.querySelectorAll('[data-create-only]')) element.style.display = isEdit ? 'none' : '';
      for (const element of form.querySelectorAll('[data-edit-only]')) element.style.display = isEdit ? '' : 'none';
      for (const element of form.querySelectorAll('[data-check-only]')) {
        const createOnly = element.hasAttribute('data-create-only');
        const editOnly = element.hasAttribute('data-edit-only');
        element.style.display = modalIsGroup || (createOnly && isEdit) || (editOnly && !isEdit) ? 'none' : '';
      }
      renderModalCases(row);
      document.getElementById('addChildFromForm').style.display = isEdit ? '' : 'none';
      document.getElementById('addGroupFromForm').style.display = isEdit ? '' : 'none';
      backdrop.classList.add('open');
      (isEdit ? descriptionInput : titleInput).focus();
    }
    function closeModal() { backdrop.classList.remove('open'); }
    function closeCaseModal() { caseBackdrop.classList.remove('open'); caseModalRowId = ''; }
    function closeBulkModal() { bulkBackdrop.classList.remove('open'); bulkParentId = null; bulkText.value = ''; updateBulkCount(); }
    function closeAssessmentModal() { assessmentBackdrop.classList.remove('open'); }
    function closeAssetModal() { assetBackdrop.classList.remove('open'); assetMetadataError.textContent = ''; }
    function closeManageModal() { manageBackdrop.classList.remove('open'); manageAssetMetadataError.textContent = ''; }
    function closeConfirmModal() { confirmBackdrop.classList.remove('open'); pendingConfirm = null; }
    function openSettingsModal() {
      document.getElementById('showPriorityToggle').checked = showPriority;
      document.getElementById('showStatsFilterToggle').checked = showStatsFilter;
      document.getElementById('showCodeLensToggle').checked = codeLensEnabled;
      settingsBackdrop.classList.add('open');
    }
    function closeSettingsModal() { settingsBackdrop.classList.remove('open'); }
    function requestConfirm(message, onConfirm) {
      pendingConfirm = onConfirm;
      confirmMessage.textContent = message;
      confirmBackdrop.classList.add('open');
      document.getElementById('confirmOk').focus();
    }
    function closeContextMenu() { contextMenu.hidden = true; contextMenu.textContent = ''; }
    function menuItem(label, action, options) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'menu-item' + (options && options.danger ? ' danger' : '') + (options && options.active ? ' active' : '');
      item.dataset.action = action;
      item.textContent = label;
      return item;
    }
    function menuSeparator() {
      const item = document.createElement('div');
      item.className = 'menu-separator';
      return item;
    }
    function openContextMenu(event, row) {
      event.preventDefault();
      if (!selectedIds.has(row.id)) selectRow(row.id);
      contextMenu.textContent = '';
      contextMenu.append(
        menuItem('Edit', 'edit'),
        menuItem(linkedCases(row.id).length ? 'Edit case mapping' : 'Map to cases', 'mapCases'),
        menuSeparator(),
        menuItem('+ Check', 'addChild'),
        menuItem('+ Group', 'addGroup'),
        menuItem('Add checks in bulk', 'bulkAdd'),
        menuSeparator(),
      );
      if (!row.is_group) {
        for (const status of STATUSES) {
          const marker = statusMarker({ status, is_checked: status === 'CHECKED_OK' });
          contextMenu.appendChild(menuItem((marker.glyph ? marker.glyph + ' ' : '  ') + status, 'status:' + status, { active: row.status === status }));
        }
        contextMenu.appendChild(menuSeparator());
      }
      contextMenu.appendChild(menuItem(row.is_group ? 'Convert to check' : 'Convert to group', 'toggleGroup'));
      contextMenu.appendChild(menuSeparator());
      contextMenu.appendChild(menuItem(selectedIds.has(row.id) && selectedIds.size > 1 ? 'Delete selected (' + selectedIds.size + ')' : (row.is_group ? 'Delete group' : 'Delete check'), 'delete', { danger: true }));
      const width = 220;
      contextMenu.style.left = Math.min(event.clientX, window.innerWidth - width - 4) + 'px';
      contextMenu.style.top = Math.min(event.clientY, window.innerHeight - 260) + 'px';
      contextMenu.hidden = false;
    }
    function handleContextAction(action) {
      const row = byId(selectedId);
      if (!row) return;
      if (action === 'edit') openModal('edit', { row });
      if (action === 'addChild') openModal('create', { parentId: row.id, isGroup: false });
      if (action === 'bulkAdd') openBulkModal(row.id);
      if (action === 'addGroup') openModal('create', { parentId: row.id, isGroup: true });
      if (action === 'mapCases') openCaseModal(row);
      if (action === 'delete') deleteSelected();
      if (action === 'toggleGroup') toggleGroup(row);
      if (action.indexOf('status:') === 0) setStatus(row.id, action.slice('status:'.length));
    }
    function toggleGroup(row) {
      vscode.postMessage({ type: 'updateCheck', id: row.id, payload: { is_group: !row.is_group, is_checked: row.is_group ? Boolean(row.is_checked) : false, check_type: row.is_group ? row.check_type || null : null } });
    }
    function openCaseModal(row) {
      caseModalRowId = row.id;
      document.getElementById('caseModalTitle').textContent = 'Map To Cases: ' + rowTitle(row);
      caseList.textContent = '';
      const selectedCases = new Set(linkedCases(row.id).map((item) => item.id));
      if (!cases.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No cases available.';
        caseList.appendChild(empty);
      }
      for (const item of cases) {
        const label = document.createElement('label');
        label.className = 'case-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = item.id;
        checkbox.checked = selectedCases.has(item.id);
        const textNode = document.createElement('span');
        textNode.textContent = item.title || item.id;
        label.append(checkbox, textNode);
        caseList.appendChild(label);
      }
      caseBackdrop.classList.add('open');
    }
    function renderModalCases(row) {
      modalCaseList.textContent = '';
      if (modalKind !== 'edit' || !row) return;
      const selectedCases = new Set(linkedCases(row.id).map((item) => item.id));
      if (!cases.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No cases available.';
        modalCaseList.appendChild(empty);
        return;
      }
      for (const item of cases) {
        const label = document.createElement('label');
        label.className = 'case-option';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = item.id;
        checkbox.checked = selectedCases.has(item.id);
        const textNode = document.createElement('span');
        textNode.textContent = item.title || item.id;
        label.append(checkbox, textNode);
        modalCaseList.appendChild(label);
      }
    }
    function selectedModalCaseIds() {
      return Array.from(modalCaseList.querySelectorAll('input[type="checkbox"]')).filter((input) => input.checked).map((input) => input.value);
    }
    function openAssessmentModal() {
      assessmentTitleInput.value = '';
      assessmentDescriptionInput.value = '';
      assessmentBackdrop.classList.add('open');
      assessmentTitleInput.focus();
    }
    function openCreateAssetModal() {
      if (!currentAssessmentId) return;
      assetModalMode = 'create';
      document.getElementById('assetModalTitle').textContent = 'Create Asset';
      assetNameInput.value = '';
      assetTypeInput.value = 'REPOSITORY';
      assetTypeInput.disabled = false;
      assetLocatorInput.value = '';
      assetProjectPathInput.value = '';
      assetVersionInput.value = '';
      assetMetadataInput.value = '{}';
      assetMetadataError.textContent = '';
      assetSubmit.textContent = 'Create asset';
      assetBackdrop.classList.add('open');
      assetNameInput.focus();
    }
    function openAssetModal() {
      const asset = assets.find((item) => item.id === currentAssetId);
      if (!asset) return;
      assetModalMode = 'edit';
      document.getElementById('assetModalTitle').textContent = 'Asset Settings: ' + (asset.name || asset.id);
      assetNameInput.value = asset.name || '';
      assetTypeInput.value = asset.type || 'OTHER';
      assetTypeInput.disabled = true;
      assetLocatorInput.value = asset.locator || '';
      assetProjectPathInput.value = projectBasePaths[asset.id] || '';
      assetVersionInput.value = asset.version_ref || '';
      assetMetadataInput.value = JSON.stringify(asset.metadata || {}, null, 2);
      assetMetadataError.textContent = '';
      assetSubmit.textContent = 'Save asset';
      assetBackdrop.classList.add('open');
      assetLocatorInput.focus();
    }
    function parseBulkChecksInput(value) {
      return value.split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean);
    }
    function updateBulkCount() {
      bulkCount.textContent = 'Will add: ' + parseBulkChecksInput(bulkText.value).length;
    }
    function openBulkModal(parentId) {
      bulkParentId = parentId || null;
      const parent = bulkParentId ? byId(bulkParentId) : null;
      bulkTarget.textContent = parent ? 'Target: children of ' + rowTitle(parent) : 'Target: root';
      bulkText.value = '';
      updateBulkCount();
      bulkBackdrop.classList.add('open');
      bulkText.focus();
    }
    function parseAssetMetadata() {
      const raw = assetMetadataInput.value.trim();
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Metadata must be a JSON object.');
        return parsed;
      } catch (error) {
        assetMetadataError.textContent = error instanceof Error ? error.message : String(error);
        return null;
      }
    }
    function parseJsonTextarea(input, errorElement) {
      const raw = input.value.trim();
      if (!raw) return {};
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Metadata must be a JSON object.');
        return parsed;
      } catch (error) {
        errorElement.textContent = error instanceof Error ? error.message : String(error);
        return null;
      }
    }
    function descendantsOf(id) {
      const result = [];
      function walk(parentId) {
        for (const child of childrenOf(parentId)) {
          result.push(child);
          walk(child.id);
        }
      }
      walk(id);
      return result;
    }
    function selectManagedAssessment(id) {
      manageAssessmentId = id || '';
      const item = assessments.find((row) => row.id === manageAssessmentId);
      manageAssessmentTitle.value = item?.title || '';
      manageAssessmentDescription.value = item?.description || '';
      manageAssessmentDelete.disabled = !item;
      if (manageAssessmentId && manageAssessmentId !== currentAssessmentId) {
        manageAssetId = '';
        vscode.postMessage({ type: 'setAssessment', assessmentId: manageAssessmentId });
      }
      renderManageSelectors();
    }
    function selectManagedAsset(id) {
      manageAssetMode = id ? 'edit' : 'create';
      manageAssetId = id || '';
      const item = assets.find((row) => row.id === manageAssetId);
      manageAssetName.value = item?.name || '';
      manageAssetType.value = item?.type || 'REPOSITORY';
      manageAssetType.disabled = Boolean(item);
      manageAssetLocator.value = item?.locator || '';
      manageAssetProjectPath.value = item ? (projectBasePaths[item.id] || '') : '';
      manageAssetVersion.value = item?.version_ref || '';
      manageAssetMetadata.value = JSON.stringify(item?.metadata || {}, null, 2);
      manageAssetDelete.disabled = !item;
      manageAssetMetadataError.textContent = '';
      renderManageSelectors();
    }
    function renderManageSelectors() {
      manageAssessmentSelect.textContent = '';
      const newAssessmentOption = document.createElement('option');
      newAssessmentOption.value = '';
      newAssessmentOption.textContent = 'New assessment...';
      manageAssessmentSelect.appendChild(newAssessmentOption);
      for (const item of assessments) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.title || item.id;
        manageAssessmentSelect.appendChild(option);
      }
      manageAssessmentSelect.value = manageAssessmentId;

      manageAssetSelect.textContent = '';
      const newAssetOption = document.createElement('option');
      newAssetOption.value = '';
      newAssetOption.textContent = 'New asset...';
      manageAssetSelect.appendChild(newAssetOption);
      for (const item of assets) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name || item.id;
        manageAssetSelect.appendChild(option);
      }
      manageAssetSelect.value = manageAssetId;
      manageAssetSelect.disabled = !manageAssessmentId;
    }
    function openManageModal() {
      manageAssessmentId = currentAssessmentId || assessments[0]?.id || '';
      manageAssetId = currentAssetId || assets[0]?.id || '';
      selectManagedAssessment(manageAssessmentId);
      selectManagedAsset(manageAssetId);
      manageBackdrop.classList.add('open');
    }
    function formPayload(parentId, isGroup) {
      const status = isGroup ? 'NOT_STARTED' : statusInput.value;
      return {
        title: titleInput.value.trim(),
        description: descriptionInput.value.trim(),
        category: categoryInput.value.trim() || null,
        check_type: isGroup ? null : (typeInput.value.trim() || null),
        priority: isGroup ? 'MEDIUM' : priorityInput.value,
        status,
        reason: isGroup ? null : (reasonInput.value.trim() || null),
        is_checked: isGroup ? false : Boolean(checkedInput.checked || status === 'CHECKED_OK'),
        is_group: isGroup,
        parent_check_id: parentId,
        sort_order: nextSortOrder(parentId),
        source: 'OTHER'
      };
    }
    function updatePayload(isGroup) {
      return {
        title: titleInput.value.trim(),
        description: descriptionInput.value.trim(),
        priority: isGroup ? 'MEDIUM' : editPriorityInput.value,
      };
    }
    function setStatus(id, status) {
      vscode.postMessage({ type: 'updateCheck', id, payload: { status, is_checked: status === 'CHECKED_OK' } });
    }
    function setStatusSelected(status) {
      for (const row of selectedRowList()) {
        if (!row.is_group) setStatus(row.id, status);
      }
    }
    function deleteSelected() {
      const selectedRows = selectedRowList();
      if (!selectedRows.length) return;
      const selectedSet = new Set(selectedRows.map((row) => row.id));
      const roots = selectedRows.filter((row) => !row.parent_check_id || !selectedSet.has(row.parent_check_id));
      const nestedIds = new Set();
      for (const row of roots) {
        for (const nested of descendantsOf(row.id)) nestedIds.add(nested.id);
      }
      const message = roots.length === 1
        ? (nestedIds.size
          ? 'Delete "' + rowTitle(roots[0]) + '" and ' + nestedIds.size + ' nested row' + (nestedIds.size === 1 ? '' : 's') + '?'
          : 'Delete "' + rowTitle(roots[0]) + '"?')
        : 'Delete ' + roots.length + ' selected rows and ' + nestedIds.size + ' nested row' + (nestedIds.size === 1 ? '' : 's') + '?';
      requestConfirm(message, () => {
        for (const row of roots) vscode.postMessage({ type: 'deleteCheck', id: row.id });
        selectedId = '';
        selectedIds = new Set();
      });
    }
    function selectedParentForCreate() {
      return selectedId && byId(selectedId) ? selectedId : null;
    }
    function moveRow(movedId, targetParentId, targetIndex) {
      const moved = byId(movedId);
      if (!moved) return;
      if (targetParentId === movedId || descendantIds(movedId).has(targetParentId)) return;
      const oldParent = moved.parent_check_id || null;
      let nextRows = rows.map((row) => Object.assign({}, row));
      const movedCopy = nextRows.find((row) => row.id === movedId);
      movedCopy.parent_check_id = targetParentId || null;
      function siblings(parentId) { return nextRows.filter((row) => (row.parent_check_id || null) === parentId && row.id !== movedId).sort(compareRows); }
      const targetSiblings = siblings(targetParentId || null);
      targetSiblings.splice(Math.max(0, Math.min(targetIndex, targetSiblings.length)), 0, movedCopy);
      const oldSiblings = oldParent === (targetParentId || null) ? targetSiblings : siblings(oldParent);
      const updates = [];
      oldSiblings.forEach((row, index) => { if ((row.sort_order ?? 0) !== index || (row.parent_check_id || null) !== oldParent) updates.push({ id: row.id, payload: { sort_order: index, parent_check_id: oldParent } }); });
      targetSiblings.forEach((row, index) => { if ((row.sort_order ?? 0) !== index || (row.parent_check_id || null) !== (targetParentId || null)) updates.push({ id: row.id, payload: { sort_order: index, parent_check_id: targetParentId || null } }); });
      if (!updates.length) return;
      rows = nextRows;
      renderAll();
      vscode.postMessage({ type: 'moveChecks', updates });
    }
    function moveRows(movedIds, targetParentId, targetIndex) {
      const uniqueIds = Array.from(new Set(movedIds)).filter((id) => byId(id));
      if (!uniqueIds.length) return;
      const movingSet = new Set(uniqueIds);
      const roots = uniqueIds.filter((id) => {
        const row = byId(id);
        return row && (!row.parent_check_id || !movingSet.has(row.parent_check_id));
      });
      if (!roots.length) return;
      for (const id of roots) {
        if (targetParentId === id || descendantIds(id).has(targetParentId)) return;
      }
      let nextRows = rows.map((row) => Object.assign({}, row));
      const oldParents = new Set(roots.map((id) => byId(id)?.parent_check_id || null));
      roots.forEach((id) => {
        const copy = nextRows.find((row) => row.id === id);
        if (copy) copy.parent_check_id = targetParentId || null;
      });
      function siblings(parentId) { return nextRows.filter((row) => (row.parent_check_id || null) === parentId && !roots.includes(row.id)).sort(compareRows); }
      const targetSiblings = siblings(targetParentId || null);
      const movedCopies = roots.map((id) => nextRows.find((row) => row.id === id)).filter(Boolean);
      targetSiblings.splice(Math.max(0, Math.min(targetIndex, targetSiblings.length)), 0, ...movedCopies);
      const updates = [];
      for (const parentId of new Set([...oldParents, targetParentId || null])) {
        const ordered = parentId === (targetParentId || null) ? targetSiblings : siblings(parentId);
        ordered.forEach((row, index) => {
          if ((row.sort_order ?? 0) !== index || (row.parent_check_id || null) !== parentId) {
            updates.push({ id: row.id, payload: { sort_order: index, parent_check_id: parentId } });
          }
        });
      }
      if (!updates.length) return;
      rows = nextRows;
      renderAll();
      vscode.postMessage({ type: 'moveChecks', updates });
    }
    function showError(message) {
      const error = document.createElement('div');
      error.className = 'error';
      error.textContent = message;
      detail.textContent = '';
      detail.appendChild(error);
    }
    function renderAll() {
      renderSelectors();
      updateStats();
      renderTree();
      renderDetail();
    }

    tree.tabIndex = 0;
    tree.addEventListener('keydown', handleTreeKeyboard);
    tree.addEventListener('pointerdown', () => tree.focus());
    tree.addEventListener('click', (event) => {
      const target = event.target;
      const rowElement = target instanceof Element ? target.closest('.row') : null;
      if (!rowElement) return;
      const id = rowElement.dataset.id;
      const row = byId(id);
      if (!row) return;
      const action = target instanceof Element ? target.dataset.action : '';
      if (action === 'openCase' && target instanceof HTMLElement) {
        event.preventDefault();
        event.stopPropagation();
        vscode.postMessage({ type: 'selectCase', id: target.dataset.caseId || '', assetId: target.dataset.assetId || null, payload: { title: target.dataset.caseTitle || 'Case' } });
        return;
      }
      if (action === 'toggle') {
        if (collapsedIds.has(id)) collapsedIds.delete(id); else collapsedIds.add(id);
        renderTree();
        return;
      }
      if (action === 'toggleChecked') return;
      if (event.shiftKey) selectRange(id); else selectRow(id);
    });
    tree.addEventListener('dblclick', (event) => {
      const rowElement = event.target instanceof Element ? event.target.closest('.row') : null;
      if (!rowElement || !rowElement.dataset.id) return;
      const row = byId(rowElement.dataset.id);
      if (row) openModal('edit', { row });
    });
    tree.addEventListener('contextmenu', (event) => {
      const rowElement = event.target instanceof Element ? event.target.closest('.row') : null;
      if (!rowElement || !rowElement.dataset.id) return;
      const row = byId(rowElement.dataset.id);
      if (row) openContextMenu(event, row);
    });
    tree.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.dataset.action !== 'toggleChecked') return;
      const rowElement = target.closest('.row');
      if (!rowElement || !rowElement.dataset.id) return;
      const status = target.checked ? 'CHECKED_OK' : 'NOT_STARTED';
      setStatus(rowElement.dataset.id, status);
    });
    tree.addEventListener('dragstart', (event) => {
      const rowElement = event.target instanceof Element ? event.target.closest('.row') : null;
      if (!rowElement || !rowElement.dataset.id) return;
      draggingIds = selectedIds.has(rowElement.dataset.id) && selectedIds.size > 1 ? Array.from(selectedIds) : [rowElement.dataset.id];
      draggingId = rowElement.dataset.id;
      event.dataTransfer.setData('text/plain', JSON.stringify(draggingIds));
      rowElement.classList.add('is-dragging');
    });
    tree.addEventListener('dragover', (event) => {
      const drop = event.target instanceof Element ? event.target.closest('.drop-line') : null;
      if (!drop || !draggingId) return;
      event.preventDefault();
      for (const line of tree.querySelectorAll('.drop-line.is-active')) line.classList.remove('is-active');
      for (const row of tree.querySelectorAll('.row.drop-inside')) row.classList.remove('drop-inside');
      drop.classList.add('is-active');
    });
    tree.addEventListener('dragover', (event) => {
      const rowElement = event.target instanceof Element ? event.target.closest('.row') : null;
      if (!rowElement || !draggingId || rowElement.dataset.id === draggingId) return;
      event.preventDefault();
      for (const line of tree.querySelectorAll('.drop-line.is-active')) line.classList.remove('is-active');
      for (const row of tree.querySelectorAll('.row.drop-inside')) row.classList.remove('drop-inside');
      rowElement.classList.add('drop-inside');
    });
    tree.addEventListener('drop', (event) => {
      const drop = event.target instanceof Element ? event.target.closest('.drop-line') : null;
      const rowElement = event.target instanceof Element ? event.target.closest('.row') : null;
      if (!draggingId) return;
      event.preventDefault();
      if (drop) {
        const parentId = drop.dataset.dropParent || null;
        const index = Number(drop.dataset.dropIndex || '0');
        moveRows(draggingIds.length ? draggingIds : [draggingId], parentId, index);
      } else if (rowElement && rowElement.dataset.id && rowElement.dataset.id !== draggingId) {
        moveRows(draggingIds.length ? draggingIds : [draggingId], rowElement.dataset.id, childrenOf(rowElement.dataset.id).length);
      }
      draggingId = '';
      draggingIds = [];
    });
    tree.addEventListener('dragend', () => {
      draggingId = '';
      draggingIds = [];
      for (const line of tree.querySelectorAll('.drop-line.is-active')) line.classList.remove('is-active');
      for (const row of tree.querySelectorAll('.row.drop-inside')) row.classList.remove('drop-inside');
      for (const row of tree.querySelectorAll('.row.is-dragging')) row.classList.remove('is-dragging');
    });
    detail.addEventListener('click', (event) => {
      const target = event.target;
      const action = target instanceof Element ? target.dataset.action : '';
      if (action === 'openCase' && target instanceof HTMLElement) {
        vscode.postMessage({ type: 'selectCase', id: target.dataset.caseId || '', assetId: target.dataset.assetId || null, payload: { title: target.dataset.caseTitle || 'Case' } });
        return;
      }
      const row = byId(selectedId);
      if (!row) return;
      if (action === 'edit') openModal('edit', { row });
      if (action === 'mapCases') openCaseModal(row);
    });
    assessmentSelect.addEventListener('change', () => {
      selectedId = '';
      selectedIds = new Set();
      vscode.postMessage({ type: 'setAssessment', assessmentId: assessmentSelect.value });
    });
    assetSelect.addEventListener('change', () => {
      selectedId = '';
      selectedIds = new Set();
      vscode.postMessage({ type: 'setAsset', assetId: assetSelect.value });
    });
    caseSelect.addEventListener('change', () => {
      const value = caseSelect.value;
      if (!value) return;
      if (value === CREATE_NEW_CASE_VALUE) {
        vscode.postMessage({ type: 'createCase' });
        caseSelect.value = activeCaseId || '';
        return;
      }
      const item = cases.find((row) => row.id === value);
      if (!item) return;
      vscode.postMessage({ type: 'selectCase', id: item.id, assetId: item.asset_id || null, payload: { title: item.title || item.id } });
    });
    stats.addEventListener('click', (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest('button[data-filter]') : null;
      if (!target) return;
      activeStatsFilter = target.dataset.filter || 'all';
      saveViewState();
      renderAll();
    });
    contextMenu.addEventListener('click', (event) => {
      const item = event.target instanceof Element ? event.target.closest('.menu-item') : null;
      if (!item || !item.dataset.action) return;
      const action = item.dataset.action;
      closeContextMenu();
      handleContextAction(action);
    });
    document.addEventListener('click', (event) => {
      if (!contextMenu.hidden && event.target instanceof Node && !contextMenu.contains(event.target)) closeContextMenu();
    });
    document.getElementById('manageScope').addEventListener('click', openManageModal);
    manageAssessmentSelect.addEventListener('change', () => selectManagedAssessment(manageAssessmentSelect.value));
    manageAssetSelect.addEventListener('change', () => selectManagedAsset(manageAssetSelect.value));
    document.getElementById('newCheck').addEventListener('click', () => openModal('create', { parentId: selectedParentForCreate(), isGroup: false }));
    document.getElementById('newGroup').addEventListener('click', () => openModal('create', { parentId: selectedParentForCreate(), isGroup: true }));
    document.getElementById('newCase').addEventListener('click', () => vscode.postMessage({ type: 'createCase' }));
    document.getElementById('refresh').addEventListener('click', () => vscode.postMessage({ type: 'refresh' }));
    document.getElementById('checksSettings').addEventListener('click', openSettingsModal);
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('caseModalClose').addEventListener('click', closeCaseModal);
    document.getElementById('bulkModalClose').addEventListener('click', closeBulkModal);
    document.getElementById('assessmentModalClose').addEventListener('click', closeAssessmentModal);
    document.getElementById('assetModalClose').addEventListener('click', closeAssetModal);
    document.getElementById('manageModalClose').addEventListener('click', closeManageModal);
    document.getElementById('confirmModalClose').addEventListener('click', closeConfirmModal);
    document.getElementById('settingsModalClose').addEventListener('click', closeSettingsModal);
    document.getElementById('confirmCancel').addEventListener('click', closeConfirmModal);
    document.getElementById('confirmOk').addEventListener('click', () => {
      const action = pendingConfirm;
      closeConfirmModal();
      if (action) action();
    });
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) closeModal(); });
    caseBackdrop.addEventListener('click', (event) => { if (event.target === caseBackdrop) closeCaseModal(); });
    bulkBackdrop.addEventListener('click', (event) => { if (event.target === bulkBackdrop) closeBulkModal(); });
    assessmentBackdrop.addEventListener('click', (event) => { if (event.target === assessmentBackdrop) closeAssessmentModal(); });
    assetBackdrop.addEventListener('click', (event) => { if (event.target === assetBackdrop) closeAssetModal(); });
    manageBackdrop.addEventListener('click', (event) => { if (event.target === manageBackdrop) closeManageModal(); });
    confirmBackdrop.addEventListener('click', (event) => { if (event.target === confirmBackdrop) closeConfirmModal(); });
    settingsBackdrop.addEventListener('click', (event) => { if (event.target === settingsBackdrop) closeSettingsModal(); });
    document.getElementById('showPriorityToggle').addEventListener('change', (event) => {
      showPriority = Boolean(event.target.checked);
      saveViewState();
      renderTree();
    });
    document.getElementById('showStatsFilterToggle').addEventListener('change', (event) => {
      showStatsFilter = Boolean(event.target.checked);
      if (!showStatsFilter) activeStatsFilter = 'all';
      saveViewState();
      renderAll();
    });
    document.getElementById('showCodeLensToggle').addEventListener('change', (event) => {
      codeLensEnabled = Boolean(event.target.checked);
      vscode.postMessage({ type: 'setCodeLensEnabled', payload: { enabled: codeLensEnabled } });
    });
    const codeLensHotkeyHelp = document.getElementById('codeLensHotkeyHelp');
    const codeLensHotkeyPopover = document.getElementById('codeLensHotkeyPopover');
    codeLensHotkeyHelp?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isOpen = codeLensHotkeyPopover?.classList.toggle('is-open');
      codeLensHotkeyHelp.classList.toggle('is-open', Boolean(isOpen));
    });
    document.addEventListener('click', (event) => {
      if (!codeLensHotkeyPopover?.classList.contains('is-open')) {
        return;
      }
      const target = event.target;
      if (target instanceof Node && codeLensHotkeyHelp?.contains(target)) {
        return;
      }
      if (target instanceof Node && codeLensHotkeyPopover.contains(target)) {
        return;
      }
      codeLensHotkeyPopover.classList.remove('is-open');
      codeLensHotkeyHelp?.classList.remove('is-open');
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (backdrop.classList.contains('open')) closeModal();
      if (caseBackdrop.classList.contains('open')) closeCaseModal();
      if (bulkBackdrop.classList.contains('open')) closeBulkModal();
      if (assessmentBackdrop.classList.contains('open')) closeAssessmentModal();
      if (assetBackdrop.classList.contains('open')) closeAssetModal();
      if (manageBackdrop.classList.contains('open')) closeManageModal();
      if (confirmBackdrop.classList.contains('open')) closeConfirmModal();
      if (settingsBackdrop.classList.contains('open')) closeSettingsModal();
      closeContextMenu();
    });
    document.getElementById('addChildFromForm').addEventListener('click', () => { const row = byId(modalRowId); if (row) openModal('create', { parentId: row.id, isGroup: false }); });
    document.getElementById('addGroupFromForm').addEventListener('click', () => { const row = byId(modalRowId); if (row) openModal('create', { parentId: row.id, isGroup: true }); });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!titleInput.value.trim()) return;
      if (modalKind === 'edit' && modalRowId) {
        vscode.postMessage({ type: 'updateCheck', id: modalRowId, payload: updatePayload(modalIsGroup) });
        vscode.postMessage({ type: 'mapCases', id: modalRowId, caseIds: selectedModalCaseIds() });
      } else {
        vscode.postMessage({ type: 'createCheck', payload: formPayload(modalParentId, modalIsGroup) });
      }
      closeModal();
    });
    bulkText.addEventListener('input', updateBulkCount);
    bulkForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const titles = parseBulkChecksInput(bulkText.value);
      if (!titles.length) return;
      const parentId = bulkParentId || null;
      const startOrder = nextSortOrder(parentId);
      vscode.postMessage({
        type: 'createChecksBulk',
        payloads: titles.map((title, index) => ({
          title,
          description: '',
          category: null,
          check_type: null,
          priority: 'MEDIUM',
          status: 'NOT_STARTED',
          reason: null,
          is_checked: false,
          is_group: false,
          parent_check_id: parentId,
          sort_order: startOrder + index,
          source: 'OTHER'
        }))
      });
      closeBulkModal();
    });
    caseForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!caseModalRowId) return;
      const caseIds = Array.from(caseList.querySelectorAll('input[type="checkbox"]')).filter((input) => input.checked).map((input) => input.value);
      vscode.postMessage({ type: 'mapCases', id: caseModalRowId, caseIds });
      closeCaseModal();
    });
    assessmentForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!assessmentTitleInput.value.trim()) return;
      if (duplicateAssessmentTitle(assessmentTitleInput.value, '')) {
        showError('Assessment with this title already exists.');
        return;
      }
      vscode.postMessage({ type: 'createAssessment', payload: { title: assessmentTitleInput.value.trim(), description: assessmentDescriptionInput.value.trim() } });
      closeAssessmentModal();
    });
    assetForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!assetNameInput.value.trim()) return;
      if (assetModalMode === 'create' && duplicateAssetName(assetNameInput.value, '')) {
        assetMetadataError.textContent = 'Asset with this name already exists.';
        return;
      }
      assetMetadataError.textContent = '';
      const metadata = parseAssetMetadata();
      if (metadata === null) return;
      const payload = {
        name: assetNameInput.value.trim(),
        locator: assetLocatorInput.value.trim() || null,
        version_ref: assetVersionInput.value.trim() || null,
        metadata
      };
      if (assetModalMode === 'create') {
        vscode.postMessage({ type: 'createAsset', payload: Object.assign({ type: assetTypeInput.value, projectBasePath: assetProjectPathInput.value.trim() }, payload) });
      } else if (currentAssetId) {
        vscode.postMessage({ type: 'updateAsset', assetId: currentAssetId, payload });
        vscode.postMessage({ type: 'setProjectBasePath', assetId: currentAssetId, projectBasePath: assetProjectPathInput.value.trim() });
      }
      closeAssetModal();
    });
    manageAssessmentNew.addEventListener('click', () => {
      manageAssessmentId = '';
      manageAssessmentTitle.value = '';
      manageAssessmentDescription.value = '';
      manageAssessmentDelete.disabled = true;
      renderManageSelectors();
      manageAssessmentTitle.focus();
    });
    manageAssessmentDelete.addEventListener('click', () => {
      const item = assessments.find((row) => row.id === manageAssessmentId);
      if (!item) return;
      requestConfirm('Delete assessment "' + (item.title || item.id) + '" and all nested data?', () => {
        vscode.postMessage({ type: 'deleteAssessment', assessmentId: item.id });
        closeManageModal();
      });
    });
    manageAssessmentForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!manageAssessmentTitle.value.trim()) return;
      if (duplicateAssessmentTitle(manageAssessmentTitle.value, manageAssessmentId)) {
        showError('Assessment with this title already exists.');
        return;
      }
      const payload = { title: manageAssessmentTitle.value.trim(), description: manageAssessmentDescription.value.trim() };
      if (manageAssessmentId) {
        vscode.postMessage({ type: 'updateAssessment', assessmentId: manageAssessmentId, payload });
      } else {
        vscode.postMessage({ type: 'createAssessment', payload });
      }
      closeManageModal();
    });
    manageAssetNew.addEventListener('click', () => {
      selectManagedAsset('');
      manageAssetName.focus();
    });
    manageAssetDelete.addEventListener('click', () => {
      const item = assets.find((row) => row.id === manageAssetId);
      if (!item) return;
      requestConfirm('Delete asset "' + (item.name || item.id) + '"? Linked records will be kept but detached from this asset.', () => {
        vscode.postMessage({ type: 'deleteAsset', assetId: item.id });
        closeManageModal();
      });
    });
    manageAssetForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!manageAssetName.value.trim()) return;
      if (duplicateAssetName(manageAssetName.value, manageAssetId)) {
        manageAssetMetadataError.textContent = 'Asset with this name already exists.';
        return;
      }
      manageAssetMetadataError.textContent = '';
      const metadata = parseJsonTextarea(manageAssetMetadata, manageAssetMetadataError);
      if (metadata === null) return;
      const payload = {
        name: manageAssetName.value.trim(),
        locator: manageAssetLocator.value.trim() || null,
        version_ref: manageAssetVersion.value.trim() || null,
        metadata
      };
      if (manageAssetMode === 'create') {
        vscode.postMessage({ type: 'createAsset', payload: Object.assign({ type: manageAssetType.value, projectBasePath: manageAssetProjectPath.value.trim() }, payload) });
      } else if (manageAssetId) {
        vscode.postMessage({ type: 'updateAsset', assetId: manageAssetId, payload });
        vscode.postMessage({ type: 'setProjectBasePath', assetId: manageAssetId, projectBasePath: manageAssetProjectPath.value.trim() });
      }
      closeManageModal();
    });
    window.addEventListener('message', (event) => {
      const message = event.data || {};
      if (message.type === 'checks2Data') {
        rows = Array.isArray(message.rows) ? message.rows : [];
        cases = Array.isArray(message.cases) ? message.cases : [];
        relations = Array.isArray(message.relations) ? message.relations : [];
        assessments = Array.isArray(message.assessments) ? message.assessments : [];
        assets = Array.isArray(message.assets) ? message.assets : [];
        projectBasePaths = message.projectBasePaths && typeof message.projectBasePaths === 'object' ? message.projectBasePaths : {};
        currentAssessmentId = message.assessmentId || '';
        currentAssetId = message.assetId || '';
        activeCaseId = message.activeCaseId || '';
        activeCaseStatus = message.activeCaseStatus || '';
        codeLensEnabled = message.codeLensEnabled !== false;
        if (manageBackdrop.classList.contains('open')) {
          manageAssessmentId = currentAssessmentId || manageAssessmentId;
          manageAssetId = currentAssetId || assets[0]?.id || '';
          selectManagedAssessment(manageAssessmentId);
          selectManagedAsset(manageAssetId);
        }
        selectedIds = new Set(Array.from(selectedIds).filter((id) => rows.some((row) => row.id === id)));
        if (!rows.some((row) => row.id === selectedId)) selectedId = rows[0]?.id || '';
        if (!selectedIds.size && selectedId) selectedIds = new Set([selectedId]);
        renderAll();
        if (message.error) showError(message.error);
      }
      if (message.type === 'selectCheck' && message.id) {
        selectCheckById(message.id);
      }
      if (message.type === 'error') showError(message.error || 'Update failed.');
    });
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
    }
}
exports.Checks2Panel = Checks2Panel;

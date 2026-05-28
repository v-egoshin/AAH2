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
exports.ContextPanel = void 0;
const vscode = __importStar(require("vscode"));
const client_1 = require("../api/client");
const activeCase_1 = require("../state/activeCase");
const assessmentState_1 = require("../state/assessmentState");
function entityLabel(entity) {
    return entity?.title || entity?.name || entity?.kind || entity?.candidate_type || entity?.predicate || "Untitled";
}
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function nonce() {
    return Math.random().toString(36).slice(2);
}
class ContextPanel {
    constructor() {
        this.view = null;
        this.payload = null;
        this.allCases = [];
        this.loadingCases = false;
    }
    register(context) {
        context.subscriptions.push(vscode.window.registerWebviewViewProvider("appsecContext", this));
    }
    resolveWebviewView(view) {
        this.view = view;
        view.webview.options = { enableScripts: true };
        view.webview.html = this.renderHtml(view.webview);
        view.webview.onDidReceiveMessage(async (message) => {
            await this.handleMessage(message);
        });
        this.pushState();
    }
    setContextPayload(payload) {
        this.payload = payload;
        void this.ensureCasesLoaded();
        this.pushState();
    }
    getPayload() {
        return this.payload;
    }
    setRecentFilter(_value) {
        return;
    }
    clearRecentFilter() {
        return;
    }
    async ensureCasesLoaded() {
        if (this.loadingCases) {
            return;
        }
        try {
            this.loadingCases = true;
            const state = (0, assessmentState_1.readState)();
            const assessmentId = state.assessmentId;
            if (!assessmentId) {
                this.allCases = [];
                return;
            }
            const cases = await new client_1.WorkbenchApiClient(state).listCases();
            this.allCases = Array.isArray(cases) ? cases : [];
        }
        catch {
            this.allCases = [];
        }
        finally {
            this.loadingCases = false;
            this.pushState();
        }
    }
    currentTarget() {
        const ctx = this.payload?.context;
        if (!ctx?.file || !ctx.start_line) {
            return null;
        }
        return {
            file: ctx.file,
            startLine: ctx.start_line,
            endLine: ctx.end_line ?? ctx.start_line,
            title: ctx.file,
            locator: `${ctx.file}:${ctx.start_line}`,
        };
    }
    findEntity(id) {
        const groups = [
            ...(this.payload?.candidates ?? []),
            ...(this.payload?.marks ?? []),
            ...(this.payload?.relations ?? []),
            ...(this.payload?.cases ?? []),
            ...(this.payload?.checks ?? []),
            ...(this.payload?.evidence ?? []),
            ...(this.payload?.findings ?? []),
            ...this.allCases,
        ];
        return groups.find((item) => item.id === id) ?? null;
    }
    async handleMessage(message) {
        const target = this.currentTarget();
        switch (message.type) {
            case "refresh":
                await vscode.commands.executeCommand("appsecWorkbench.refreshContext");
                return;
            case "mark":
                if (message.kind === "SOURCE") {
                    await vscode.commands.executeCommand("appsecWorkbench.markSource", target);
                }
                else if (message.kind === "SINK") {
                    await vscode.commands.executeCommand("appsecWorkbench.markSink", target);
                }
                else if (message.kind === "GUARD") {
                    await vscode.commands.executeCommand("appsecWorkbench.markGuard", target);
                }
                else if (message.kind === "TRANSFORM") {
                    await vscode.commands.executeCommand("appsecWorkbench.markTransform", target);
                }
                return;
            case "markAny":
                await vscode.commands.executeCommand("appsecWorkbench.markAny", target);
                return;
            case "createCheck":
                await vscode.commands.executeCommand("appsecWorkbench.createCheckFromSelection", target);
                return;
            case "createCase":
                await vscode.commands.executeCommand("appsecWorkbench.createCaseFromContext", target);
                return;
            case "addCurrentMarkToActiveCase":
                await vscode.commands.executeCommand("appsecWorkbench.addCurrentMarkToActiveCase");
                return;
            case "addCurrentCheckToActiveCase":
                await vscode.commands.executeCommand("appsecWorkbench.addCurrentCheckToActiveCase");
                return;
            case "addRecentMarkToActiveCase":
                if (typeof message.id === "string") {
                    await vscode.commands.executeCommand("appsecWorkbench.addRecentMarkToActiveCase", message.id);
                }
                return;
            case "acceptCandidate": {
                const entity = typeof message.id === "string" ? this.findEntity(message.id) : null;
                if (entity) {
                    await vscode.commands.executeCommand("appsecWorkbench.acceptCandidate", entity);
                }
                return;
            }
            case "rejectCandidate": {
                const entity = typeof message.id === "string" ? this.findEntity(message.id) : null;
                if (entity) {
                    await vscode.commands.executeCommand("appsecWorkbench.rejectCandidate", entity);
                }
                return;
            }
            case "openEntity": {
                const entity = typeof message.id === "string" ? this.findEntity(message.id) : null;
                if (entity) {
                    await vscode.commands.executeCommand("appsecWorkbench.openEntitySource", entity);
                }
                return;
            }
            case "removeMark":
                await vscode.commands.executeCommand("appsecWorkbench.removeCurrentMark", target);
                return;
            case "selectActiveCase": {
                const entity = typeof message.id === "string" ? this.findEntity(message.id) : null;
                if (entity) {
                    const candidate = entity;
                    const before = typeof candidate.context_before_lines === "number" ? candidate.context_before_lines : undefined;
                    const after = typeof candidate.context_after_lines === "number" ? candidate.context_after_lines : undefined;
                    const state = (0, assessmentState_1.readState)();
                    (0, activeCase_1.setActiveCase)({
                        id: entity.id,
                        title: entityLabel(entity),
                        assessmentId: state.assessmentId,
                        assetId: state.assetId,
                        contextBeforeLines: before,
                        contextAfterLines: after,
                    });
                    this.pushState();
                    await vscode.commands.executeCommand("appsecWorkbench.refreshContext");
                }
                return;
            }
            case "clearActiveCase":
                (0, activeCase_1.setActiveCase)(null);
                this.pushState();
                await vscode.commands.executeCommand("appsecWorkbench.refreshContext");
                return;
            case "recentAction":
                if (typeof message.action === "string" && typeof message.id === "string") {
                    await vscode.commands.executeCommand("appsecWorkbench.applyRecentMarkAction", message.action, message.id, target);
                }
                return;
            case "setCheckStatus":
                if (typeof message.status === "string") {
                    await vscode.commands.executeCommand("appsecWorkbench.setCheckStatus", message.status);
                }
                return;
            case "convertFinding":
                await vscode.commands.executeCommand("appsecWorkbench.convertCheckToFinding");
                return;
            default:
                return;
        }
    }
    pushState() {
        this.view?.webview.postMessage({
            type: "state",
            state: {
                payload: this.payload,
                activeCase: (0, activeCase_1.getActiveCase)(),
                cases: this.allCases,
            },
        });
    }
    renderHtml(webview) {
        const n = nonce();
        const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; style-src 'unsafe-inline'; script-src 'nonce-${n}';`;
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    :root { color-scheme: light dark; }
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-sideBar-background); padding: 10px; }
    .panel { display: grid; gap: 10px; }
    .field { display: grid; gap: 6px; }
    .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.75; }
    select {
      width: 100%;
      box-sizing: border-box;
      padding: 7px 8px;
      background: var(--vscode-dropdown-background);
      color: var(--vscode-dropdown-foreground);
      border: 1px solid var(--vscode-dropdown-border, var(--vscode-panel-border));
      border-radius: 6px;
    }
  </style>
</head>
<body>
  <div id="app"></div>
  <script nonce="${n}">
    const vscode = acquireVsCodeApi();
    const state = { payload: null, activeCase: null, cases: [] };
    const app = document.getElementById("app");

    function esc(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function label(entity) {
      return entity?.title || entity?.name || entity?.kind || entity?.candidate_type || entity?.predicate || "Untitled";
    }

    function action(type, extra = {}) {
      vscode.postMessage({ type, ...extra });
    }

    function render() {
      const active = document.activeElement instanceof HTMLSelectElement ? {
        id: document.activeElement.id,
      } : null;
      const currentActiveCaseId = state.activeCase?.id || "";
      app.innerHTML = [
        '<div class="panel">',
          '<div class="field">',
            '<label class="label" for="activeCaseSelect">Case</label>',
            '<select id="activeCaseSelect">',
              '<option value="">Select case...</option>',
              '<option value="__create_new__">Create new from current</option>',
              state.cases.map((item) => '<option value="' + esc(item.id) + '"' + (item.id === currentActiveCaseId ? ' selected' : '') + '>' + esc(label(item) + ' [' + (item.status || 'OPEN') + ']') + '</option>').join(''),
            '</select>',
          '</div>',
        '</div>',
      ].join('');

      const activeCaseSelect = document.getElementById('activeCaseSelect');
      if (activeCaseSelect) {
        activeCaseSelect.addEventListener('change', (event) => {
          const id = event.target.value || '';
          if (!id) {
            return;
          }
          if (id === '__create_new__') {
            action('createCase');
            event.target.value = currentActiveCaseId;
            return;
          }
          action('selectActiveCase', { id });
        });
      }

      if (active?.id) {
        const next = document.getElementById(active.id);
        if (next instanceof HTMLSelectElement) {
          next.focus();
        }
      }
    }

    window.addEventListener('message', (event) => {
      if (event.data?.type === 'state') {
        Object.assign(state, event.data.state || {});
        render();
      }
    });

    render();
  </script>
</body>
</html>`;
    }
}
exports.ContextPanel = ContextPanel;

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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const assessment_1 = require("./commands/assessment");
const mark_1 = require("./commands/mark");
const client_1 = require("./api/client");
const log_1 = require("./log");
const assessmentState_1 = require("./state/assessmentState");
const activeCase_1 = require("./state/activeCase");
const recentMarks_1 = require("./state/recentMarks");
const checks2Panel_1 = require("./views/checks2Panel");
const contextPanel_1 = require("./views/contextPanel");
const linkedEntitiesPanel_1 = require("./views/linkedEntitiesPanel");
const assetPath_1 = require("./lib/assetPath");
const markDecorations_1 = require("./views/markDecorations");
const markDescriptionWidget_1 = require("./views/markDescriptionWidget");
function parseEntityTarget(entity) {
    const locator = entity.locator || "";
    const match = locator.match(/^(.*?)(?::(\d+))?(?::(\d+))?$/);
    if (!match || !match[1]) {
        return null;
    }
    return {
        file: match[1],
        line: match[2] ? Number(match[2]) : 1,
        column: match[3] ? Number(match[3]) : 1,
    };
}
function activate(context) {
    (0, log_1.log)("Extension activated");
    (0, assessmentState_1.configureAssessmentStateStorage)(context.workspaceState);
    (0, activeCase_1.configureActiveCaseStorage)(context.workspaceState);
    const panel = new contextPanel_1.ContextPanel();
    panel.register(context);
    const checksPanel = new checks2Panel_1.Checks2Panel(context.extensionUri);
    checksPanel.register(context);
    const linkedEntitiesPanel = new linkedEntitiesPanel_1.LinkedEntitiesPanel(context.extensionUri);
    linkedEntitiesPanel.register(context);
    const recentMarksPanel = new recentMarks_1.RecentMarksPanel();
    const markDecorations = new markDecorations_1.MarkDecorations(context);
    context.subscriptions.push({ dispose: () => markDecorations.dispose() });
    const codeLensProvider = new mark_1.SelectionActionCodeLensProvider();
    (0, markDescriptionWidget_1.initializeMarkDescriptionController)(context);
    context.subscriptions.push({ dispose: () => (0, markDescriptionWidget_1.disposeMarkDescriptionEditor)() });
    (0, assessment_1.registerAssessmentCommands)(context);
    (0, mark_1.registerMarkCommands)(context, codeLensProvider, recentMarksPanel);
    let refreshTimer;
    let inFlightRefreshKey = "";
    let lastAppliedRefreshKey = "";
    let refreshSequence = 0;
    const runRefresh = async (force = false) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            (0, log_1.log)("Refresh skipped: no active editor");
            return;
        }
        const state = (0, assessmentState_1.readState)();
        if (!state.assessmentId) {
            (0, log_1.log)("Refresh skipped: assessmentId is empty");
            return;
        }
        const file = (0, assetPath_1.relativeFilePathFromUri)(editor.document.uri);
        const line = editor.selection.active.line + 1;
        const refreshKey = `${file}:${line}`;
        if (!force && (refreshKey === inFlightRefreshKey || refreshKey === lastAppliedRefreshKey)) {
            (0, log_1.log)(`Refresh skipped: duplicate ${refreshKey}`);
            return;
        }
        const seq = ++refreshSequence;
        inFlightRefreshKey = refreshKey;
        const api = new client_1.WorkbenchApiClient(state);
        (0, log_1.log)(`Refresh review context for ${refreshKey}`);
        try {
            const payload = await api.getReviewContext(file, line);
            if (seq !== refreshSequence) {
                (0, log_1.log)(`Refresh ignored: stale response for ${refreshKey}`);
                return;
            }
            codeLensProvider.setContextPayload(payload);
            panel.setContextPayload(payload);
            markDecorations.apply(editor, payload);
            recentMarksPanel.refresh();
            codeLensProvider.refresh();
            lastAppliedRefreshKey = refreshKey;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            (0, log_1.log)(`Refresh failed for ${refreshKey}: ${message}`);
        }
        finally {
            if (inFlightRefreshKey === refreshKey) {
                inFlightRefreshKey = "";
            }
        }
    };
    const scheduleRefresh = (force = false, delayMs = 180) => {
        if (refreshTimer) {
            clearTimeout(refreshTimer);
        }
        refreshTimer = setTimeout(() => {
            refreshTimer = undefined;
            void runRefresh(force);
        }, delayMs);
    };
    const refresh = async () => {
        await runRefresh(true);
    };
    context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.refreshContext", refresh));
    context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.refreshLinkedEntities", () => linkedEntitiesPanel.refreshConfig()));
    context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.selectCheckInChecks", (checkId) => checksPanel.selectCheck(checkId)));
    context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.showLogs", () => (0, log_1.showLogs)()));
    context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.setRecentMarkFilter", async () => {
        const value = await vscode.window.showInputBox({
            prompt: "Filter recent marks",
            placeHolder: "source, sink, locator, title...",
            value: "",
        });
        if (value === undefined) {
            return;
        }
        panel.setRecentFilter(value);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.clearRecentMarkFilter", async () => {
        panel.clearRecentFilter();
    }));
    context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.openEntitySource", async (entity) => {
        const target = parseEntityTarget(entity);
        if (!target) {
            return;
        }
        const uri = vscode.Uri.file(vscode.workspace.workspaceFolders?.[0] ? `${vscode.workspace.workspaceFolders[0].uri.fsPath}/${target.file}` : target.file);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc);
        const position = new vscode.Position(Math.max(0, target.line - 1), Math.max(0, target.column - 1));
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }));
    context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(() => {
        (0, log_1.log)("Selection changed");
        codeLensProvider.onSelectionTargetChanged(vscode.window.activeTextEditor ? (0, mark_1.getSelectionTarget)(vscode.window.activeTextEditor) : null);
        codeLensProvider.refresh();
        scheduleRefresh(false, 180);
    }));
    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
        (0, log_1.log)("Active editor changed");
        codeLensProvider.onSelectionTargetChanged(vscode.window.activeTextEditor ? (0, mark_1.getSelectionTarget)(vscode.window.activeTextEditor) : null);
        codeLensProvider.refresh();
        scheduleRefresh(true, 60);
    }));
}
function deactivate() { }

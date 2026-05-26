import * as vscode from "vscode";
import { registerAssessmentCommands } from "./commands/assessment";
import { getSelectionTarget, registerMarkCommands, SelectionActionCodeLensProvider } from "./commands/mark";
import { ReviewEntity, WorkbenchApiClient } from "./api/client";
import { getMarkKindCatalogSnapshot, refreshMarkKindCatalogFromApi } from "./state/markKindCatalog";
import { log, showLogs } from "./log";
import { configureAssessmentStateStorage, readState } from "./state/assessmentState";
import { configureActiveCaseStorage } from "./state/activeCase";
import { RecentMarksPanel } from "./state/recentMarks";
import { Checks2Panel } from "./views/checks2Panel";
import { ContextPanel } from "./views/contextPanel";
import { LinkedEntitiesPanel } from "./views/linkedEntitiesPanel";
import { relativeFilePathFromUri } from "./lib/assetPath";
import { MarkDecorations } from "./views/markDecorations";
import { disposeMarkDescriptionEditor, initializeMarkDescriptionController } from "./views/markDescriptionWidget";

function parseEntityTarget(entity: ReviewEntity) {
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

export function activate(context: vscode.ExtensionContext) {
  log("Extension activated");
  configureAssessmentStateStorage(context.workspaceState);
  configureActiveCaseStorage(context.workspaceState);
  const panel = new ContextPanel();
  panel.register(context);
  const checksPanel = new Checks2Panel(context.extensionUri);
  checksPanel.register(context);
  const linkedEntitiesPanel = new LinkedEntitiesPanel(context.extensionUri);
  linkedEntitiesPanel.register(context);
  const recentMarksPanel = new RecentMarksPanel();
  const markDecorations = new MarkDecorations(context);
  context.subscriptions.push({ dispose: () => markDecorations.dispose() });

  const codeLensProvider = new SelectionActionCodeLensProvider();

  const syncMarkKindCatalog = async () => {
    try {
      const api = new WorkbenchApiClient(readState());
      await refreshMarkKindCatalogFromApi(api);
      markDecorations.rebuildFromCatalog(getMarkKindCatalogSnapshot());
      codeLensProvider.refresh();
      linkedEntitiesPanel.refreshConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Mark kind catalog sync skipped: ${message}`);
    }
  };

  void syncMarkKindCatalog();

  initializeMarkDescriptionController(context);
  context.subscriptions.push({ dispose: () => disposeMarkDescriptionEditor() });

  registerAssessmentCommands(context);
  registerMarkCommands(context, codeLensProvider, recentMarksPanel);

  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let inFlightRefreshKey = "";
  let lastAppliedRefreshKey = "";
  let refreshSequence = 0;

  const runRefresh = async (force = false) => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      log("Refresh skipped: no active editor");
      return;
    }
    const state = readState();
    if (!state.assessmentId) {
      log("Refresh skipped: assessmentId is empty");
      return;
    }
    const file = relativeFilePathFromUri(editor.document.uri);
    const line = editor.selection.active.line + 1;
    const refreshKey = `${file}:${line}`;
    if (!force && (refreshKey === inFlightRefreshKey || refreshKey === lastAppliedRefreshKey)) {
      log(`Refresh skipped: duplicate ${refreshKey}`);
      return;
    }

    const seq = ++refreshSequence;
    inFlightRefreshKey = refreshKey;
    const api = new WorkbenchApiClient(state);
    log(`Refresh review context for ${refreshKey}`);
    try {
      const payload = await api.getReviewContext(file, line);
      if (seq !== refreshSequence) {
        log(`Refresh ignored: stale response for ${refreshKey}`);
        return;
      }
      codeLensProvider.setContextPayload(payload);
      panel.setContextPayload(payload);
      markDecorations.apply(editor, payload);
      recentMarksPanel.refresh();
      codeLensProvider.refresh();
      lastAppliedRefreshKey = refreshKey;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Refresh failed for ${refreshKey}: ${message}`);
    } finally {
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
  context.subscriptions.push(
    vscode.commands.registerCommand("appsecWorkbench.refreshMarkKindCatalog", async () => {
      await syncMarkKindCatalog();
      await refresh();
    }),
  );
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.refreshLinkedEntities", () => linkedEntitiesPanel.refreshConfig()));
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.selectCheckInChecks", (checkId: string) => checksPanel.selectCheck(checkId)));
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.showLogs", () => showLogs()));
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
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.openEntitySource", async (entity: ReviewEntity) => {
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
    log("Selection changed");
    codeLensProvider.onSelectionTargetChanged(vscode.window.activeTextEditor ? getSelectionTarget(vscode.window.activeTextEditor) : null);
    codeLensProvider.refresh();
    scheduleRefresh(false, 180);
  }));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => {
    log("Active editor changed");
    codeLensProvider.onSelectionTargetChanged(vscode.window.activeTextEditor ? getSelectionTarget(vscode.window.activeTextEditor) : null);
    codeLensProvider.refresh();
    scheduleRefresh(true, 60);
  }));
}

export function deactivate() {}

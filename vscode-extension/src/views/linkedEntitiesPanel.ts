import * as vscode from "vscode";

import { WorkbenchApiClient } from "../api/client";
import { getActiveCase, setActiveCase } from "../state/activeCase";
import { readState } from "../state/assessmentState";
import { loadCaseGraphData, type CaseGraphDataBundle } from "./linkedEntitiesGraphData";
import {
  createCheckFromNode,
  movePartOfRelation,
  toggleMarksDeadEnd,
  updateRelationDescription,
} from "./linkedEntitiesMutations";

function nonce() {
  return Math.random().toString(36).slice(2);
}

function parseLocator(locator: string) {
  const match = locator.match(/^(.*?)(?::(\d+))?(?::(\d+))?$/);
  if (!match?.[1]) {
    return null;
  }
  return {
    file: match[1],
    line: match[2] ? Number(match[2]) : 1,
    column: match[3] ? Number(match[3]) : 1,
  };
}

async function openLocator(locator: string, projectBasePath?: string) {
  const target = parseLocator(locator);
  if (!target) {
    return;
  }
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  const relativePath = target.file.replace(/^\//, "");
  const absolutePath = target.file.startsWith("/")
    ? target.file
    : projectBasePath
      ? `${projectBasePath.replace(/\/$/, "")}/${relativePath}`
      : workspaceRoot
        ? `${workspaceRoot}/${relativePath}`
        : target.file;
  const uri = vscode.Uri.file(absolutePath);
  const doc = await vscode.workspace.openTextDocument(uri);
  const existingEditor = vscode.window.visibleTextEditors.find((item) => item.document.uri.toString() === uri.toString());
  const editor = await vscode.window.showTextDocument(doc, {
    viewColumn: existingEditor?.viewColumn ?? vscode.ViewColumn.Active,
    preserveFocus: true,
    selection: new vscode.Selection(
      new vscode.Position(Math.max(0, target.line - 1), Math.max(0, target.column - 1)),
      new vscode.Position(Math.max(0, target.line - 1), Math.max(0, target.column - 1)),
    ),
  });
  const position = new vscode.Position(Math.max(0, target.line - 1), Math.max(0, target.column - 1));
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
}

function apiOrigin(apiBaseUrl: string) {
  try {
    return new URL(apiBaseUrl).origin;
  } catch {
    return "";
  }
}

function activeEditorLocator() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return null;
  }
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  const file = workspaceRoot && editor.document.uri.fsPath.startsWith(`${workspaceRoot}/`)
    ? editor.document.uri.fsPath.slice(workspaceRoot.length + 1)
    : editor.document.uri.fsPath;
  return {
    file,
    startLine: Math.min(editor.selection.start.line, editor.selection.end.line) + 1,
    endLine: Math.max(editor.selection.start.line, editor.selection.end.line) + 1,
  };
}

export class LinkedEntitiesPanel implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | null = null;
  private configVersion = 0;
  private onSidebarFocusChange: ((focused: boolean) => void) | undefined;
  private onCaseScopedDecorationsChange: ((enabled: boolean) => void) | undefined;
  private caseScopedDecorations = false;

  constructor(private readonly extensionUri: vscode.Uri) {}

  setSidebarFocusHandler(handler: (focused: boolean) => void) {
    this.onSidebarFocusChange = handler;
  }

  setCaseScopedDecorationsHandler(handler: (enabled: boolean) => void) {
    this.onCaseScopedDecorationsChange = handler;
  }

  register(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider("appsecLinkedEntities", this, {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }),
    );
  }

  resolveWebviewView(webviewView: vscode.WebviewView) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "dist", "webview-linked-entities")],
    };
    webviewView.webview.html = this.renderHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(async (message: {
      type?: string;
      requestId?: string;
      action?: string;
      payload?: Record<string, unknown>;
      locator?: string;
      assetId?: string | null;
      enabled?: boolean;
      id?: string;
      title?: string;
      status?: string;
    }) => {
      switch (message.type) {
        case "ready":
          void this.pushConfig();
          return;
        case "reloadGraph":
          void this.pushConfig();
          return;
        case "panelFocus":
          this.onSidebarFocusChange?.(true);
          return;
        case "panelBlur":
          this.onSidebarFocusChange?.(false);
          return;
        case "mutate":
          if (typeof message.requestId === "string" && typeof message.action === "string") {
            await this.handleMutate(webviewView.webview, message.requestId, message.action, message.payload ?? {});
          }
          return;
        case "openLocator":
          if (typeof message.locator === "string") {
            const state = readState();
            const projectBasePaths = this.readProjectPathsFromWorkspace();
            const basePath = message.assetId ? projectBasePaths[message.assetId] : projectBasePaths[state.assetId];
            await openLocator(message.locator, basePath);
          }
          return;
        case "relationsChanged":
          await vscode.commands.executeCommand("appsecWorkbench.refreshContext");
          void this.pushConfig();
          return;
        case "updateCaseStatus":
          if (typeof message.id === "string" && message.id && typeof message.status === "string" && message.status) {
            await this.createApiClient().updateCase(message.id, { status: message.status });
            void this.pushConfig();
            await vscode.commands.executeCommand("appsecWorkbench.refreshContext");
          }
          return;
        case "selectCheck":
          if (typeof message.id === "string" && message.id) {
            await vscode.commands.executeCommand("appsecWorkbench.selectCheckInChecks", message.id);
          }
          return;
        case "setCaseScopedDecorations":
          this.caseScopedDecorations = Boolean(message.enabled);
          this.onCaseScopedDecorationsChange?.(this.caseScopedDecorations);
          this.view?.webview.postMessage({ type: "caseScopedDecorations", caseScopedDecorations: this.caseScopedDecorations });
          return;
        default:
          return;
      }
    });
    void this.pushConfig();
  }

  refreshConfig() {
    void this.pushConfig();
  }

  refreshActiveLocator() {
    this.view?.webview.postMessage({
      type: "activeLocator",
      activeLocator: activeEditorLocator(),
    });
  }

  private postMutateResult(webview: vscode.Webview, requestId: string, ok: boolean, error?: string) {
    webview.postMessage({
      type: "mutateResult",
      requestId,
      ok,
      error,
    });
  }

  private async handleMutate(
    webview: vscode.Webview,
    requestId: string,
    action: string,
    payload: Record<string, unknown>,
  ) {
    try {
      const client = this.createApiClient();
      const activeCase = getActiveCase();
      switch (action) {
        case "movePartOf": {
          const subjectType = String(payload.subjectType ?? "");
          const subjectId = String(payload.subjectId ?? "");
          const objectType = String(payload.objectType ?? "");
          const objectId = String(payload.objectId ?? "");
          const relations = Array.isArray(payload.relations) ? payload.relations as Parameters<typeof movePartOfRelation>[1] : [];
          if (!subjectType || !subjectId || !objectType || !objectId) {
            throw new Error("Invalid movePartOf payload");
          }
          await movePartOfRelation(client, relations, subjectType, subjectId, objectType, objectId);
          break;
        }
        case "updateDescription": {
          const relationId = String(payload.relationId ?? "");
          const entityType = String(payload.entityType ?? "");
          const entityId = String(payload.entityId ?? "");
          const properties = payload.properties && typeof payload.properties === "object"
            ? payload.properties as Record<string, unknown>
            : {};
          const note = payload.note === null || typeof payload.note === "string" ? payload.note as string | null : null;
          if (!relationId) {
            throw new Error("Invalid updateDescription payload");
          }
          await updateRelationDescription(client, relationId, entityType, entityId, properties, note);
          break;
        }
        case "updateDisplayName": {
          const relationId = String(payload.relationId ?? "");
          const properties = payload.properties && typeof payload.properties === "object"
            ? payload.properties as Record<string, unknown>
            : {};
          if (!relationId) {
            throw new Error("Invalid updateDisplayName payload");
          }
          await client.updateRelation(relationId, { properties });
          break;
        }
        case "deleteRelation": {
          const relationId = String(payload.relationId ?? "");
          if (!relationId) {
            throw new Error("Invalid deleteRelation payload");
          }
          await client.deleteRelation(relationId);
          break;
        }
        case "createCheckFromNode": {
          const caseId = String(payload.caseId ?? activeCase?.id ?? "");
          const entityType = String(payload.entityType ?? "");
          const entityId = String(payload.entityId ?? "");
          const label = String(payload.label ?? "");
          const userDescription = String(payload.userDescription ?? "");
          if (!caseId || !entityType || !entityId) {
            throw new Error("Invalid createCheckFromNode payload");
          }
          await createCheckFromNode(client, caseId, entityType, entityId, label, userDescription);
          break;
        }
        case "toggleDeadEnd": {
          const markIds = Array.isArray(payload.markIds)
            ? payload.markIds.filter((item): item is string => typeof item === "string" && Boolean(item))
            : [];
          const isDeadEnd = Boolean(payload.isDeadEnd);
          if (!markIds.length) {
            throw new Error("Invalid toggleDeadEnd payload");
          }
          await toggleMarksDeadEnd(client, markIds, isDeadEnd);
          break;
        }
        default:
          throw new Error(`Unknown mutation action: ${action}`);
      }
      await vscode.commands.executeCommand("appsecWorkbench.refreshContext");
      void this.pushConfig();
      this.postMutateResult(webview, requestId, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.postMutateResult(webview, requestId, false, message);
    }
  }

  private readProjectPathsFromWorkspace(): Record<string, string> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
      const value = vscode.workspace.getConfiguration("appsecWorkbench", folder.uri).get<Record<string, string>>("projectBasePathByAsset");
      if (value && typeof value === "object") {
        return value;
      }
    }
    return {};
  }

  private createApiClient(state = readState()) {
    return new WorkbenchApiClient({
      apiBaseUrl: state.apiBaseUrl,
      assessmentId: state.assessmentId,
      assetId: state.assetId,
      authToken: state.authToken,
    });
  }

  private async loadGraphData(client: WorkbenchApiClient): Promise<{ graphData?: CaseGraphDataBundle; graphError?: string }> {
    try {
      const graphData = await loadCaseGraphData(client);
      return { graphData };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { graphError: message };
    }
  }

  private async buildConfig() {
    const state = readState();
    const projectBasePaths = this.readProjectPathsFromWorkspace();
    const base = {
      apiBaseUrl: state.apiBaseUrl,
      authToken: state.authToken,
      assessmentId: "",
      assetId: "",
      caseId: null as string | null,
      caseTitle: null as string | null,
      caseScopedDecorations: this.caseScopedDecorations,
      activeLocator: activeEditorLocator(),
      projectBasePaths,
      loadError: undefined as string | undefined,
      graphData: undefined as CaseGraphDataBundle | undefined,
      graphError: undefined as string | undefined,
    };
    if (!state.assessmentId.trim()) {
      return { ...base, loadError: "Set appsecWorkbench.assessmentId in settings.", configVersion: ++this.configVersion };
    }
    const client = this.createApiClient(state);
    try {
      const resolved = await client.resolveIds();
      const graph = await this.loadGraphData(client);
      const cases = (graph.graphData?.rows ?? [])
        .map((row) => row as { id?: string; title?: string; status?: string; asset_id?: string | null })
        .filter((row): row is { id: string; title: string; status?: string; asset_id?: string | null } => Boolean(row.id && row.title))
        .map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          asset_id: row.asset_id ?? null,
        }));
      const activeCase = getActiveCase();
      const scopedActiveCase = activeCase?.id
        && activeCase.assessmentId === resolved.assessmentId
        && cases.some((row) => row.id === activeCase.id)
        ? activeCase
        : null;
      if (activeCase?.id && !scopedActiveCase) {
        setActiveCase(null);
      }
      return {
        ...base,
        assessmentId: resolved.assessmentId,
        assetId: resolved.assetId,
        caseId: scopedActiveCase?.id ?? null,
        caseTitle: scopedActiveCase?.title ?? null,
        caseStatus: cases.find((row) => row.id === scopedActiveCase?.id)?.status ?? null,
        cases,
        graphData: graph.graphData,
        graphError: graph.graphError,
        configVersion: ++this.configVersion,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ...base, loadError: message, configVersion: ++this.configVersion };
    }
  }

  private async pushConfig() {
    if (!this.view) {
      return;
    }
    const config = await this.buildConfig();
    this.view.webview.postMessage({
      type: "config",
      config,
    });
  }

  private renderHtml(webview: vscode.Webview) {
    const bundleRoot = vscode.Uri.joinPath(this.extensionUri, "dist", "webview-linked-entities");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(bundleRoot, "assets", "index.js"));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(bundleRoot, "assets", "index.css"));
    const cspSource = webview.cspSource;
    const bootstrapNonce = nonce();
    const state = readState();
    const connectOrigins = [
      cspSource,
      apiOrigin(state.apiBaseUrl),
      "http://localhost:8000",
      "http://127.0.0.1:8000",
      "https:",
    ].filter(Boolean).join(" ");
    const csp = [
      `default-src 'none'`,
      `connect-src ${connectOrigins}`,
      `img-src ${cspSource} https: data:`,
      `style-src ${cspSource} 'unsafe-inline'`,
      `font-src ${cspSource}`,
      `script-src ${cspSource} 'nonce-${bootstrapNonce}'`,
    ].join("; ");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="stylesheet" href="${styleUri}">
  <title>Linked Entities</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${bootstrapNonce}">
    window.addEventListener("error", (event) => {
      const root = document.getElementById("root");
      if (root && !root.textContent) {
        root.innerHTML = "<p style=\\"color:var(--vscode-errorForeground);padding:8px\\">Failed to load Linked Entities UI.</p>";
      }
      console.error("Linked Entities webview error", event.error ?? event.message);
    });
  </script>
  <script type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

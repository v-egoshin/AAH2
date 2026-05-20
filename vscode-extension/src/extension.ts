import * as vscode from "vscode";
import { WorkbenchApiClient } from "./api/client";
import { registerCandidateCommands } from "./commands/candidate";
import { registerMarkCommands } from "./commands/mark";
import { readState } from "./state/assessmentState";
import { ContextPanel } from "./views/contextPanel";

export function activate(context: vscode.ExtensionContext) {
  const panel = new ContextPanel();
  panel.register(context);

  registerMarkCommands(context);
  registerCandidateCommands(context);

  const refresh = async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const state = readState();
    if (!state.assessmentId || !state.assetId) return;
    const api = new WorkbenchApiClient(state);
    const file = vscode.workspace.asRelativePath(editor.document.uri);
    const line = editor.selection.active.line + 1;
    const payload = await api.getReviewContext(file, line);
    panel.setContextPayload(payload);
  };

  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.refreshContext", refresh));
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(() => void refresh()));
}

export function deactivate() {}

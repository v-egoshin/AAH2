import * as vscode from 'vscode';
import { WorkbenchApiClient } from './api/client';
import { registerCandidateCommands } from './commands/candidate';
import { registerMarkCommands } from './commands/mark';
import { registerCheckCommands } from './commands/check';
import { registerEvidenceCommands } from './commands/evidence';
import { readState } from './state/assessmentState';
import { ContextPanel } from './views/contextPanel';
import { applyMarkDecorations } from './decorations/markDecorations';
import { AppSecCodeLensProvider } from './codelens/appsecCodeLens';

let latestSummary = 'AppSec: no context';

export function activate(context: vscode.ExtensionContext) {
  const panel = new ContextPanel();
  panel.register(context);
  registerMarkCommands(context);
  registerCandidateCommands(context);
  registerCheckCommands(context);
  registerEvidenceCommands(context);

  context.subscriptions.push(vscode.languages.registerCodeLensProvider({ scheme: 'file' }, new AppSecCodeLensProvider(() => latestSummary)));

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
    latestSummary = `AppSec: ${payload?.marks?.length ?? 0} marks, ${payload?.candidates?.length ?? 0} candidates`;
    applyMarkDecorations(editor, payload?.marks || []);
  };

  context.subscriptions.push(vscode.commands.registerCommand('appsecWorkbench.refreshContext', refresh));
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(() => void refresh()));
}

export function deactivate() {}

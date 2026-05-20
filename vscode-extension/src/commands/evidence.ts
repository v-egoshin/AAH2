import * as vscode from 'vscode';
import { readState } from '../state/assessmentState';

export function registerEvidenceCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand('appsecWorkbench.attachEvidenceFromSelection', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const state = readState();
    const text = editor.document.getText(editor.selection);
    const file = vscode.workspace.asRelativePath(editor.document.uri);
    const start = editor.selection.start.line + 1;
    const end = editor.selection.end.line + 1;
    await fetch(`${state.apiBaseUrl}/assessments/${state.assessmentId}/evidence`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title: 'Code snippet evidence', evidence_type:'CODE_SNIPPET', summary:'Selected code', content:text, properties:{file,start_line:start,end_line:end}})});
    vscode.window.showInformationMessage('AppSec: evidence attached');
  }));
}

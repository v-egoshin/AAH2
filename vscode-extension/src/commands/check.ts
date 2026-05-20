import * as vscode from 'vscode';
import { readState } from '../state/assessmentState';

export function registerCheckCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand('appsecWorkbench.createCheck', async () => {
    const title = await vscode.window.showInputBox({ prompt: 'Check title' });
    if (!title) return;
    const state = readState();
    await fetch(`${state.apiBaseUrl}/assessments/${state.assessmentId}/checks`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title, status: 'NOT_STARTED', priority:'MEDIUM' })});
    vscode.window.showInformationMessage('AppSec: check created');
  }));
}

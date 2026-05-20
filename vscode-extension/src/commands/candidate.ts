import * as vscode from 'vscode';
import { WorkbenchApiClient } from '../api/client';
import { readState } from '../state/assessmentState';

export function registerCandidateCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('appsecWorkbench.acceptCandidate', async () => {
      const mode = await vscode.window.showQuickPick(['Accept', 'Reject', 'Merge'], { placeHolder: 'Candidate action' });
      if (!mode) return;
      const id = await vscode.window.showInputBox({ prompt: 'Candidate ID' });
      if (!id) return;
      const api = new WorkbenchApiClient(readState());

      if (mode === 'Accept') await api.acceptCandidate(id);
      if (mode === 'Reject') await fetch(`${readState().apiBaseUrl}/candidates/${id}/reject`, { method: 'POST' });
      if (mode === 'Merge') {
        const target = await vscode.window.showInputBox({ prompt: 'Target candidate ID' });
        if (!target) return;
        await fetch(`${readState().apiBaseUrl}/candidates/${id}/merge?target_candidate_id=${target}`, { method: 'POST' });
      }
      vscode.window.showInformationMessage(`AppSec: ${mode} done`);
    })
  );
}

import * as vscode from "vscode";
import { WorkbenchApiClient } from "../api/client";
import { readState } from "../state/assessmentState";

export function registerCandidateCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("appsecWorkbench.acceptCandidate", async () => {
      const id = await vscode.window.showInputBox({ prompt: "Candidate ID to accept" });
      if (!id) return;
      const api = new WorkbenchApiClient(readState());
      await api.acceptCandidate(id);
      vscode.window.showInformationMessage(`AppSec: candidate ${id} accepted`);
    })
  );
}

import * as vscode from "vscode";
import { WorkbenchApiClient } from "../api/client";
import { readState, updateAssessmentState } from "../state/assessmentState";

export function registerAssessmentCommands(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("appsecWorkbench.createAssessment", async () => {
      const title = await vscode.window.showInputBox({ prompt: "Assessment title" });
      if (!title) return;

      const trimmedTitle = title.trim();
      if (!trimmedTitle) return;

      const api = new WorkbenchApiClient(readState());
      const existing = await api.findAssessmentByName(trimmedTitle);

      if (existing) {
        await updateAssessmentState({ assessmentId: existing.id });
        vscode.window.showInformationMessage(`AppSec: using existing assessment ${existing.title} (${existing.id})`);
        return;
      }

      const description = (await vscode.window.showInputBox({ prompt: "Assessment description", value: "" })) ?? "";
      const created = await api.createAssessment({ title: trimmedTitle, description });
      await updateAssessmentState({ assessmentId: created.id });

      vscode.window.showInformationMessage(`AppSec: assessment created: ${created.title} (${created.id})`);
    })
  );
}

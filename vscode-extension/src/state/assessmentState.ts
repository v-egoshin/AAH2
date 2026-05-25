import * as vscode from "vscode";

let workspaceState: vscode.Memento | undefined;

export type ExtensionState = {
  assessmentId: string;
  assetId: string;
  apiBaseUrl: string;
  authToken: string;
  selectionActionPopupEnabled: boolean;
  debugLogs: boolean;
};

export function configureAssessmentStateStorage(state: vscode.Memento) {
  workspaceState = state;
}

export async function updateAssessmentState(values: Partial<Pick<ExtensionState, "assessmentId" | "assetId" | "authToken" | "selectionActionPopupEnabled">>) {
  await Promise.all(Object.entries(values).map(([key, value]) => workspaceState?.update(key, value)));
}

export function readState(): ExtensionState {
  const cfg = vscode.workspace.getConfiguration("appsecWorkbench");
  return {
    apiBaseUrl: cfg.get<string>("apiBaseUrl", "http://localhost:8000/api"),
    assessmentId: workspaceState?.get<string>("assessmentId", "") ?? "",
    assetId: workspaceState?.get<string>("assetId", "") ?? "",
    authToken: workspaceState?.get<string>("authToken", "") ?? "",
    selectionActionPopupEnabled: workspaceState?.get<boolean>("selectionActionPopupEnabled", true) ?? true,
    debugLogs: cfg.get<boolean>("debugLogs", false),
  };
}

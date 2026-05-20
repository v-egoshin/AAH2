import * as vscode from "vscode";

export type ExtensionState = {
  assessmentId: string;
  assetId: string;
  apiBaseUrl: string;
  authToken: string;
};

export function readState(): ExtensionState {
  const cfg = vscode.workspace.getConfiguration("appsecWorkbench");
  return {
    apiBaseUrl: cfg.get<string>("apiBaseUrl", "http://localhost:8000/api"),
    assessmentId: cfg.get<string>("assessmentId", ""),
    assetId: cfg.get<string>("assetId", ""),
    authToken: cfg.get<string>("authToken", ""),
  };
}

import * as vscode from "vscode";

const channel = vscode.window.createOutputChannel("AppSec Workbench");

export function log(message: string) {
  const enabled = vscode.workspace.getConfiguration("appsecWorkbench").get<boolean>("debugLogs", false);
  if (!enabled) {
    return;
  }
  channel.appendLine(message);
}

export function showLogs() {
  channel.show(true);
}

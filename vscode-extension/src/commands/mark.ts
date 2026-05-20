import * as vscode from "vscode";
import { WorkbenchApiClient } from "../api/client";
import { readState } from "../state/assessmentState";

export function registerMarkCommands(context: vscode.ExtensionContext) {
  const register = (cmd: string, kind: "SOURCE" | "SINK" | "GUARD" | "TRANSFORM") => {
    context.subscriptions.push(
      vscode.commands.registerCommand(cmd, async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const state = readState();
        const api = new WorkbenchApiClient(state);
        const line = editor.selection.active.line + 1;
        const file = vscode.workspace.asRelativePath(editor.document.uri);
        const title = await vscode.window.showInputBox({ prompt: `Title for ${kind} mark` });
        if (!title) return;
        await api.createMark(kind, {
          title,
          object_payload: {
            type: "CALLSITE",
            kind: `${kind}_MANUAL`,
            name: title,
            locator: `${file}:${line}`,
            range: { file, start_line: line, end_line: line },
          },
        });
        vscode.window.showInformationMessage(`AppSec: ${kind} mark created`);
      })
    );
  };

  register("appsecWorkbench.markSource", "SOURCE");
  register("appsecWorkbench.markSink", "SINK");
  register("appsecWorkbench.markGuard", "GUARD");
  register("appsecWorkbench.markTransform", "TRANSFORM");
}

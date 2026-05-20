import * as vscode from "vscode";

export class ContextPanel {
  private provider: vscode.TreeDataProvider<vscode.TreeItem>;
  private emitter = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  private items: vscode.TreeItem[] = [];

  constructor() {
    this.provider = {
      getTreeItem: (element) => element,
      getChildren: () => this.items,
      onDidChangeTreeData: this.emitter.event,
    };
  }

  register(context: vscode.ExtensionContext) {
    const view = vscode.window.createTreeView("appsecContext", { treeDataProvider: this.provider });
    context.subscriptions.push(view);
  }

  setContextPayload(payload: any) {
    this.items = [
      new vscode.TreeItem(`Objects: ${payload?.objects?.length ?? 0}`),
      new vscode.TreeItem(`Marks: ${payload?.marks?.length ?? 0}`),
      new vscode.TreeItem(`Candidates: ${payload?.candidates?.length ?? 0}`),
      new vscode.TreeItem(`Checks: ${payload?.checks?.length ?? 0}`),
    ];
    this.emitter.fire(undefined);
  }
}

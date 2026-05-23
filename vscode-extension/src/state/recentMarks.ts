import * as vscode from "vscode";

import { ReviewEntity } from "../api/client";

export type RecentMarkEntry = ReviewEntity & {
  label: string;
  locator: string;
};

const LIMIT = 12;
let entries: RecentMarkEntry[] = [];

function entityLabel(entity: ReviewEntity) {
  return entity.title || entity.name || entity.kind || "Untitled";
}

export function pushRecentMark(entity: ReviewEntity) {
  if (!entity.id || !entity.locator) {
    return;
  }
  const entry: RecentMarkEntry = {
    ...entity,
    label: entityLabel(entity),
    locator: entity.locator,
  };
  entries = [entry, ...entries.filter((item) => item.id !== entity.id)].slice(0, LIMIT);
}

export function getRecentMarks(kind?: string) {
  return kind ? entries.filter((entry) => entry.kind === kind) : entries;
}

export function getRecentMarkById(id: string) {
  return entries.find((entry) => entry.id === id) ?? null;
}

class RecentMarkItem extends vscode.TreeItem {
  constructor(readonly entry: RecentMarkEntry) {
    super(`[${entry.kind ?? "MARK"}] ${entry.label}`, vscode.TreeItemCollapsibleState.None);
    this.description = entry.locator;
    this.tooltip = `${entry.label}\n${entry.locator}`;
    this.command = {
      command: "appsecWorkbench.openEntitySource",
      title: "Open Source",
      arguments: [entry],
    };
  }
}

export class RecentMarksPanel implements vscode.TreeDataProvider<vscode.TreeItem> {
  private emitter = new vscode.EventEmitter<vscode.TreeItem | undefined>();

  readonly onDidChangeTreeData = this.emitter.event;

  register(context: vscode.ExtensionContext) {
    const view = vscode.window.createTreeView("appsecRecentMarks", { treeDataProvider: this });
    context.subscriptions.push(view);
  }

  refresh() {
    this.emitter.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem) {
    return element;
  }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    if (!entries.length) {
      return [new vscode.TreeItem("No recent marks yet", vscode.TreeItemCollapsibleState.None)];
    }
    return entries.map((entry) => new RecentMarkItem(entry));
  }
}

import * as vscode from "vscode";

const REVIEWED_FILES_KEY = "appsecWorkbench.reviewedFiles";

function normalizeUri(uri: vscode.Uri) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  const fsPath = uri.fsPath;
  return workspaceRoot && fsPath.startsWith(`${workspaceRoot}/`)
    ? fsPath.slice(workspaceRoot.length + 1)
    : fsPath;
}

export class ReviewedFilesProvider implements vscode.FileDecorationProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this.emitter.event;

  constructor(private readonly workspaceState: vscode.Memento) {}

  isReviewed(uri: vscode.Uri) {
    return this.read().has(normalizeUri(uri));
  }

  async markReviewed(uri: vscode.Uri) {
    const uris = await this.collectFileUris(uri);
    const next = this.read();
    for (const item of uris) {
      next.add(normalizeUri(item));
    }
    await this.write(next);
    this.emitter.fire(uris);
  }

  async clearReviewed(uri: vscode.Uri) {
    const uris = await this.collectFileUris(uri);
    const next = this.read();
    for (const item of uris) {
      next.delete(normalizeUri(item));
    }
    await this.write(next);
    this.emitter.fire(uris);
  }

  provideFileDecoration(uri: vscode.Uri): vscode.ProviderResult<vscode.FileDecoration> {
    if (!this.isReviewed(uri)) {
      return undefined;
    }
    return {
      badge: "R",
      tooltip: "AppSec: reviewed",
      color: new vscode.ThemeColor("charts.green"),
    };
  }

  private read() {
    return new Set(this.workspaceState.get<string[]>(REVIEWED_FILES_KEY, []));
  }

  private async write(value: Set<string>) {
    await this.workspaceState.update(REVIEWED_FILES_KEY, [...value].sort());
  }

  private async collectFileUris(uri: vscode.Uri): Promise<vscode.Uri[]> {
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.type !== vscode.FileType.Directory) {
        return [uri];
      }
      const result: vscode.Uri[] = [];
      const walk = async (folder: vscode.Uri) => {
        const entries = await vscode.workspace.fs.readDirectory(folder);
        for (const [name, type] of entries) {
          const child = vscode.Uri.joinPath(folder, name);
          if (type === vscode.FileType.Directory) {
            await walk(child);
          } else if (type === vscode.FileType.File) {
            result.push(child);
          }
        }
      };
      await walk(uri);
      return result;
    } catch {
      return [uri];
    }
  }
}

export function resolveCommandUri(candidate?: vscode.Uri) {
  if (candidate instanceof vscode.Uri) {
    return candidate;
  }
  return vscode.window.activeTextEditor?.document.uri ?? null;
}

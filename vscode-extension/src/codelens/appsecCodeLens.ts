import * as vscode from 'vscode';

export class AppSecCodeLensProvider implements vscode.CodeLensProvider {
  constructor(private getSummary: (line: number) => string) {}
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];
    for (let i = 0; i < Math.min(document.lineCount, 200); i += 20) {
      lenses.push(new vscode.CodeLens(new vscode.Range(i, 0, i, 0), { title: this.getSummary(i + 1), command: 'appsecWorkbench.refreshContext' }));
    }
    return lenses;
  }
}

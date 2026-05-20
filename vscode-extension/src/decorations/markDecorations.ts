import * as vscode from 'vscode';

export function applyMarkDecorations(editor: vscode.TextEditor, marks: any[]) {
  const source = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(16,185,129,0.2)' });
  const guard = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(59,130,246,0.2)' });
  const transform = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(168,85,247,0.2)' });
  const sink = vscode.window.createTextEditorDecorationType({ backgroundColor: 'rgba(239,68,68,0.2)' });
  const map: Record<string, vscode.Range[]> = { SINK: [], SOURCE: [], GUARD: [], TRANSFORM: [] };
  for (const m of marks || []) {
    const line = ((m as any).metadata?.start_line || 1) - 1;
    if (line >= 0 && line < editor.document.lineCount && map[m.kind]) map[m.kind].push(new vscode.Range(line, 0, line, 0));
  }
  editor.setDecorations(source, map.SOURCE);
  editor.setDecorations(guard, map.GUARD);
  editor.setDecorations(transform, map.TRANSFORM);
  editor.setDecorations(sink, map.SINK);
}

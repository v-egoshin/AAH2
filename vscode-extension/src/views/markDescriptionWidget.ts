import * as vscode from "vscode";

// Раньше использовался inline-виджет vscode.comments для ввода описания, но VS Code
// не синхронизирует текст inline-редактора обратно в Comment.body — наша title-кнопка
// "Save" не имела доступа к введённому тексту. Перешли на vscode.window.showInputBox:
// API простое, обрабатывает Enter/Escape сам и не требует синхронизации состояния.

let activeInputResolve: ((reason: "save" | "cancel") => void) | null = null;

export function isMarkDescriptionEditorActive(): boolean {
  return activeInputResolve !== null;
}

/** Совместимость со старым API: явный сброс больше не нужен. */
export async function hideMarkDescriptionEditor(): Promise<void> {
  activeInputResolve = null;
}

/** Совместимость со старым API: input-box сам закрывается при смене фокуса. */
export function hideMarkDescriptionEditorIfCursorMoved(): void {
}

export function initializeMarkDescriptionController(_context: vscode.ExtensionContext): void {
  // Команды saveMarkDescription/cancelMarkDescription больше не нужны — input-box
  // обрабатывает подтверждение и отмену самостоятельно. Оставляем no-op регистрацию,
  // чтобы команды из package.json не приводили к ошибке "command not found".
  _context.subscriptions.push(
    vscode.commands.registerCommand("appsecWorkbench.saveMarkDescription", () => {}),
    vscode.commands.registerCommand("appsecWorkbench.cancelMarkDescription", () => {}),
  );
}

export function disposeMarkDescriptionEditor(): void {
  activeInputResolve = null;
}

export function showMarkDescriptionEditor(
  editor: vscode.TextEditor,
  line: number,
  initialValue: string,
  markId: string,
  onSave: (text: string) => Promise<void>,
  onCancel: () => void,
): void {
  void (async () => {
    if (activeInputResolve) {
      activeInputResolve("cancel");
      activeInputResolve = null;
    }

    const position = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );

    let resolved = false;
    const completion = new Promise<"save" | "cancel">((resolve) => {
      activeInputResolve = (reason) => {
        if (resolved) return;
        resolved = true;
        resolve(reason);
      };
    });
    void completion;

    const value = await vscode.window.showInputBox({
      prompt: `Описание для mark ${markId.slice(0, 8)}`,
      placeHolder: "Опишите, почему отмечена эта строка",
      value: initialValue,
      ignoreFocusOut: true,
    });

    activeInputResolve = null;

    if (typeof value !== "string") {
      onCancel();
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      void vscode.window.showWarningMessage("AppSec: описание не может быть пустым.");
      onCancel();
      return;
    }
    try {
      await onSave(trimmed);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`AppSec: не удалось сохранить описание: ${message}`);
    }
  })();
}

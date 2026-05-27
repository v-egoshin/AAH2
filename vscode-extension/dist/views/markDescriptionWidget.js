"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMarkDescriptionEditorActive = isMarkDescriptionEditorActive;
exports.hideMarkDescriptionEditor = hideMarkDescriptionEditor;
exports.hideMarkDescriptionEditorIfCursorMoved = hideMarkDescriptionEditorIfCursorMoved;
exports.initializeMarkDescriptionController = initializeMarkDescriptionController;
exports.disposeMarkDescriptionEditor = disposeMarkDescriptionEditor;
exports.showMarkDescriptionEditor = showMarkDescriptionEditor;
const vscode = __importStar(require("vscode"));
// Раньше использовался inline-виджет vscode.comments для ввода описания, но VS Code
// не синхронизирует текст inline-редактора обратно в Comment.body — наша title-кнопка
// "Save" не имела доступа к введённому тексту. Перешли на vscode.window.showInputBox:
// API простое, обрабатывает Enter/Escape сам и не требует синхронизации состояния.
let activeInputResolve = null;
function isMarkDescriptionEditorActive() {
    return activeInputResolve !== null;
}
/** Совместимость со старым API: явный сброс больше не нужен. */
async function hideMarkDescriptionEditor() {
    activeInputResolve = null;
}
/** Совместимость со старым API: input-box сам закрывается при смене фокуса. */
function hideMarkDescriptionEditorIfCursorMoved() {
}
function initializeMarkDescriptionController(_context) {
    // Команды saveMarkDescription/cancelMarkDescription больше не нужны — input-box
    // обрабатывает подтверждение и отмену самостоятельно. Оставляем no-op регистрацию,
    // чтобы команды из package.json не приводили к ошибке "command not found".
    _context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.saveMarkDescription", () => { }), vscode.commands.registerCommand("appsecWorkbench.cancelMarkDescription", () => { }));
}
function disposeMarkDescriptionEditor() {
    activeInputResolve = null;
}
function showMarkDescriptionEditor(editor, line, initialValue, markId, onSave, onCancel) {
    void (async () => {
        if (activeInputResolve) {
            activeInputResolve("cancel");
            activeInputResolve = null;
        }
        const position = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        let resolved = false;
        const completion = new Promise((resolve) => {
            activeInputResolve = (reason) => {
                if (resolved)
                    return;
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            void vscode.window.showErrorMessage(`AppSec: не удалось сохранить описание: ${message}`);
        }
    })();
}

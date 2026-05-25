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
exports.hasActiveMarkDescriptionDraft = hasActiveMarkDescriptionDraft;
exports.shouldCancelDraftForEditor = shouldCancelDraftForEditor;
exports.startInlineMarkDescription = startInlineMarkDescription;
exports.commitInlineMarkDescription = commitInlineMarkDescription;
exports.cancelInlineMarkDescription = cancelInlineMarkDescription;
exports.registerInlineMarkDescriptionCommands = registerInlineMarkDescriptionCommands;
const vscode = __importStar(require("vscode"));
const MARKER = "appsec-desc:";
const CONTEXT_KEY = "appsecWorkbench.markDescriptionDraft";
let activeDraft = null;
function inlineSuffix(languageId) {
    const hashLanguages = new Set([
        "python",
        "shellscript",
        "yaml",
        "dockerfile",
        "ruby",
        "r",
        "perl",
        "powershell",
        "terraform",
        "hcl",
    ]);
    if (hashLanguages.has(languageId)) {
        return ` # ${MARKER} `;
    }
    return ` // ${MARKER} `;
}
async function setDraftContext(active) {
    await vscode.commands.executeCommand("setContext", CONTEXT_KEY, active);
}
function descriptionFromLine(lineText, suffixStart) {
    const tail = lineText.slice(suffixStart);
    const markerIndex = tail.indexOf(MARKER);
    if (markerIndex < 0) {
        return "";
    }
    return tail.slice(markerIndex + MARKER.length).trim();
}
async function restoreDraftLine() {
    if (!activeDraft) {
        return;
    }
    const { editor, line, originalLineText } = activeDraft;
    const current = editor.document.lineAt(line).text;
    if (current !== originalLineText) {
        await editor.edit((edit) => {
            edit.replace(new vscode.Range(line, 0, line, current.length), originalLineText);
        });
    }
}
async function clearDraft() {
    activeDraft = null;
    await setDraftContext(false);
}
function hasActiveMarkDescriptionDraft() {
    return activeDraft !== null;
}
function shouldCancelDraftForEditor(editor) {
    if (!activeDraft || !editor) {
        return false;
    }
    if (editor.document.uri.toString() !== activeDraft.editor.document.uri.toString()) {
        return true;
    }
    if (editor !== activeDraft.editor) {
        return true;
    }
    const line = editor.selection.active.line;
    return line !== activeDraft.line;
}
async function startInlineMarkDescription(editor, line, initialValue, onSave) {
    await cancelInlineMarkDescription();
    const lineText = editor.document.lineAt(line).text;
    const suffix = inlineSuffix(editor.document.languageId);
    const insertText = `${suffix}${initialValue}`;
    const suffixStart = lineText.length;
    const updatedLine = `${lineText}${insertText}`;
    const applied = await editor.edit((edit) => {
        edit.replace(new vscode.Range(line, 0, line, lineText.length), updatedLine);
    });
    if (!applied) {
        return;
    }
    const cursorColumn = updatedLine.length;
    editor.selection = new vscode.Selection(new vscode.Position(line, cursorColumn), new vscode.Position(line, cursorColumn));
    editor.revealRange(new vscode.Range(line, suffixStart, line, cursorColumn), vscode.TextEditorRevealType.InCenter);
    activeDraft = {
        editor,
        line,
        originalLineText: lineText,
        suffixStart,
        onSave,
    };
    await setDraftContext(true);
}
async function commitInlineMarkDescription() {
    if (!activeDraft) {
        return false;
    }
    const { editor, line, suffixStart, onSave } = activeDraft;
    const lineText = editor.document.lineAt(line).text;
    const note = descriptionFromLine(lineText, suffixStart);
    if (!note) {
        vscode.window.showWarningMessage(`AppSec: add text after ${MARKER}`);
        return false;
    }
    const session = activeDraft;
    await restoreDraftLine();
    await clearDraft();
    await onSave(note);
    return session !== null;
}
async function cancelInlineMarkDescription() {
    if (!activeDraft) {
        return;
    }
    await restoreDraftLine();
    await clearDraft();
}
function registerInlineMarkDescriptionCommands(context) {
    context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.commitMarkDescription", async () => commitInlineMarkDescription()));
    context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.cancelMarkDescription", async () => cancelInlineMarkDescription()));
}

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
exports.MarkDescriptionComment = void 0;
exports.initializeMarkDescriptionController = initializeMarkDescriptionController;
exports.hideMarkDescriptionEditor = hideMarkDescriptionEditor;
exports.isMarkDescriptionEditorActive = isMarkDescriptionEditorActive;
exports.hideMarkDescriptionEditorIfCursorMoved = hideMarkDescriptionEditorIfCursorMoved;
exports.showMarkDescriptionEditor = showMarkDescriptionEditor;
exports.disposeMarkDescriptionEditor = disposeMarkDescriptionEditor;
const vscode = __importStar(require("vscode"));
const CONTROLLER_ID = "appsec-mark-description";
const CONTEXT_ACTIVE = "appsecWorkbench.markDescriptionActive";
class MarkDescriptionComment {
    constructor(body, mode, author, parent) {
        this.body = body;
        this.mode = mode;
        this.author = author;
        this.parent = parent;
        this.savedBody = body;
    }
}
exports.MarkDescriptionComment = MarkDescriptionComment;
let controller = null;
let descriptionAnchor = null;
let activeSession = null;
function commentBodyText(body) {
    return typeof body === "string" ? body : body.value;
}
function anchorRange(document, line) {
    const lineText = document.lineAt(line);
    return new vscode.Range(line, 0, line, lineText.text.length);
}
async function setDescriptionInputActive(active) {
    await vscode.commands.executeCommand("setContext", CONTEXT_ACTIVE, active);
}
function getActiveDraftText() {
    if (!activeSession) {
        return "";
    }
    const comment = activeSession.thread.comments[0];
    if (!comment) {
        return "";
    }
    return commentBodyText(comment.body);
}
function draftTextFromComment(comment) {
    if (comment && activeSession && comment.parent === activeSession.thread) {
        return commentBodyText(comment.body);
    }
    return getActiveDraftText();
}
function draftTextFromReply(reply) {
    if (!reply || !activeSession || reply.thread !== activeSession.thread) {
        return "";
    }
    return reply.text;
}
function resolveDraftText(comment, reply) {
    const fromReply = draftTextFromReply(reply).trim();
    if (fromReply) {
        return fromReply;
    }
    return draftTextFromComment(comment).trim();
}
function isDescriptionDirty(comment, reply) {
    if (!activeSession) {
        return false;
    }
    return resolveDraftText(comment, reply) !== activeSession.initialBody;
}
function getController() {
    if (!controller) {
        controller = vscode.comments.createCommentController(CONTROLLER_ID, "AppSec Mark Description");
        controller.commentingRangeProvider = {
            provideCommentingRanges: (document) => {
                const anchor = descriptionAnchor ?? activeSession?.anchor;
                if (!anchor || anchor.uri.toString() !== document.uri.toString()) {
                    return [];
                }
                return [anchorRange(document, anchor.line)];
            },
        };
        controller.options = {
            prompt: "Mark description",
            placeHolder: "Describe why this line is marked…",
        };
    }
    return controller;
}
async function saveMarkDescriptionFromSession(comment, reply) {
    if (!activeSession) {
        return;
    }
    if (comment && comment.parent !== activeSession.thread) {
        return;
    }
    if (reply && reply.thread !== activeSession.thread) {
        return;
    }
    const text = resolveDraftText(comment, reply);
    if (!text) {
        void vscode.window.showWarningMessage("AppSec: enter a description before saving.");
        return;
    }
    const session = activeSession;
    await hideMarkDescriptionEditor();
    await session.onSave(text);
}
async function cancelMarkDescriptionFromSession(comment, reply) {
    if (!activeSession) {
        return;
    }
    if (comment && comment.parent !== activeSession.thread) {
        return;
    }
    if (reply && reply.thread !== activeSession.thread) {
        return;
    }
    if (isDescriptionDirty(comment, reply)) {
        const choice = await vscode.window.showWarningMessage("Отменить описание? Несохранённый текст будет потерян.", { modal: true }, "Отменить", "Продолжить ввод");
        if (choice !== "Отменить") {
            return;
        }
    }
    const session = activeSession;
    await hideMarkDescriptionEditor();
    session.onCancel();
}
function initializeMarkDescriptionController(context) {
    const commentController = getController();
    context.subscriptions.push(commentController);
    context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.saveMarkDescription", async (arg) => {
        if (arg && "thread" in arg && "text" in arg) {
            await saveMarkDescriptionFromSession(undefined, arg);
            return;
        }
        await saveMarkDescriptionFromSession(arg);
    }));
    context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.cancelMarkDescription", async (comment) => {
        await cancelMarkDescriptionFromSession(comment);
    }));
}
async function hideMarkDescriptionEditor() {
    if (activeSession) {
        activeSession.thread.dispose();
    }
    activeSession = null;
    descriptionAnchor = null;
    await setDescriptionInputActive(false);
}
function isMarkDescriptionEditorActive() {
    return activeSession !== null || descriptionAnchor !== null;
}
/** Intentionally no-op: dismiss only via Save/Cancel/explicit commands while typing. */
function hideMarkDescriptionEditorIfCursorMoved() {
}
function showMarkDescriptionEditor(editor, line, initialValue, markId, onSave, onCancel) {
    void (async () => {
        await hideMarkDescriptionEditor();
        const position = new vscode.Position(line, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        const uri = editor.document.uri;
        const range = anchorRange(editor.document, line);
        descriptionAnchor = { uri, line };
        await setDescriptionInputActive(true);
        const thread = getController().createCommentThread(uri, range, []);
        thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
        thread.canReply = false;
        thread.contextValue = `mark-desc:${markId}`;
        thread.label = "Mark description";
        const comment = new MarkDescriptionComment(initialValue, vscode.CommentMode.Editing, { name: "AppSec" }, thread);
        thread.comments = [comment];
        activeSession = {
            markId,
            anchor: descriptionAnchor,
            thread,
            initialBody: initialValue.trim(),
            onSave,
            onCancel,
        };
    })();
}
function disposeMarkDescriptionEditor() {
    void hideMarkDescriptionEditor();
    if (controller) {
        controller.dispose();
        controller = null;
    }
}

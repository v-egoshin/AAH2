import * as vscode from "vscode";

const CONTROLLER_ID = "appsec-mark-description";
const CONTEXT_ACTIVE = "appsecWorkbench.markDescriptionActive";

export class MarkDescriptionComment implements vscode.Comment {
  savedBody: string | vscode.MarkdownString;

  constructor(
    public body: string | vscode.MarkdownString,
    public mode: vscode.CommentMode,
    public author: vscode.CommentAuthorInformation,
    public parent: vscode.CommentThread,
  ) {
    this.savedBody = body;
  }
}

type DescriptionAnchor = {
  uri: vscode.Uri;
  line: number;
};

type ActiveSession = {
  markId: string;
  anchor: DescriptionAnchor;
  thread: vscode.CommentThread;
  initialBody: string;
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
};

let controller: vscode.CommentController | null = null;
let descriptionAnchor: DescriptionAnchor | null = null;
let activeSession: ActiveSession | null = null;

function commentBodyText(body: string | vscode.MarkdownString): string {
  return typeof body === "string" ? body : body.value;
}

function anchorRange(document: vscode.TextDocument, line: number): vscode.Range {
  const lineText = document.lineAt(line);
  return new vscode.Range(line, 0, line, lineText.text.length);
}

async function setDescriptionInputActive(active: boolean) {
  await vscode.commands.executeCommand("setContext", CONTEXT_ACTIVE, active);
}

function getActiveDraftText(): string {
  if (!activeSession) {
    return "";
  }
  const comment = activeSession.thread.comments[0];
  if (!comment) {
    return "";
  }
  return commentBodyText(comment.body);
}

function draftTextFromComment(comment?: MarkDescriptionComment): string {
  if (comment && activeSession && comment.parent === activeSession.thread) {
    return commentBodyText(comment.body);
  }
  return getActiveDraftText();
}

function draftTextFromReply(reply?: vscode.CommentReply): string {
  if (!reply || !activeSession || reply.thread !== activeSession.thread) {
    return "";
  }
  return reply.text;
}

function resolveDraftText(comment?: MarkDescriptionComment, reply?: vscode.CommentReply): string {
  const fromReply = draftTextFromReply(reply).trim();
  if (fromReply) {
    return fromReply;
  }
  return draftTextFromComment(comment).trim();
}

function isDescriptionDirty(comment?: MarkDescriptionComment, reply?: vscode.CommentReply): boolean {
  if (!activeSession) {
    return false;
  }
  return resolveDraftText(comment, reply) !== activeSession.initialBody;
}

function getController(): vscode.CommentController {
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

async function saveMarkDescriptionFromSession(
  comment?: MarkDescriptionComment,
  reply?: vscode.CommentReply,
) {
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

async function cancelMarkDescriptionFromSession(
  comment?: MarkDescriptionComment,
  reply?: vscode.CommentReply,
) {
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
    const choice = await vscode.window.showWarningMessage(
      "Отменить описание? Несохранённый текст будет потерян.",
      { modal: true },
      "Отменить",
      "Продолжить ввод",
    );
    if (choice !== "Отменить") {
      return;
    }
  }
  const session = activeSession;
  await hideMarkDescriptionEditor();
  session.onCancel();
}

export function initializeMarkDescriptionController(context: vscode.ExtensionContext): void {
  const commentController = getController();
  context.subscriptions.push(commentController);

  context.subscriptions.push(vscode.commands.registerCommand(
    "appsecWorkbench.saveMarkDescription",
    async (arg?: MarkDescriptionComment | vscode.CommentReply) => {
      if (arg && "thread" in arg && "text" in arg) {
        await saveMarkDescriptionFromSession(undefined, arg);
        return;
      }
      await saveMarkDescriptionFromSession(arg as MarkDescriptionComment | undefined);
    },
  ));

  context.subscriptions.push(vscode.commands.registerCommand(
    "appsecWorkbench.cancelMarkDescription",
    async (comment?: MarkDescriptionComment) => {
      await cancelMarkDescriptionFromSession(comment);
    },
  ));
}

export async function hideMarkDescriptionEditor(): Promise<void> {
  if (activeSession) {
    activeSession.thread.dispose();
  }
  activeSession = null;
  descriptionAnchor = null;
  await setDescriptionInputActive(false);
}

export function isMarkDescriptionEditorActive(): boolean {
  return activeSession !== null || descriptionAnchor !== null;
}

/** Intentionally no-op: dismiss only via Save/Cancel/explicit commands while typing. */
export function hideMarkDescriptionEditorIfCursorMoved(): void {
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
    await hideMarkDescriptionEditor();

    const position = new vscode.Position(line, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(
      new vscode.Range(position, position),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );

    const uri = editor.document.uri;
    const range = anchorRange(editor.document, line);
    descriptionAnchor = { uri, line };
    await setDescriptionInputActive(true);

    const thread = getController().createCommentThread(uri, range, []);
    thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    thread.canReply = false;
    thread.contextValue = `mark-desc:${markId}`;
    thread.label = "Mark description";

    const comment = new MarkDescriptionComment(
      initialValue,
      vscode.CommentMode.Editing,
      { name: "AppSec" },
      thread,
    );
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

export function disposeMarkDescriptionEditor(): void {
  void hideMarkDescriptionEditor();
  if (controller) {
    controller.dispose();
    controller = null;
  }
}

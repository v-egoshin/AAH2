import * as vscode from "vscode";

import { ReviewContextResponse, ReviewEntity, WorkbenchApiClient } from "../api/client";
import { log } from "../log";
import { getActiveCase } from "../state/activeCase";
import { readState } from "../state/assessmentState";
import { getRecentMarkById, getRecentMarks, pushRecentMark, RecentMarkEntry, RecentMarksPanel } from "../state/recentMarks";
import { relativeFilePathFromUri } from "../lib/assetPath";
import { enabledMarkKindsSorted, getMarkKindCatalogSnapshot } from "../state/markKindCatalog";
import { showMarkDescriptionEditor } from "../views/markDescriptionWidget";

type CheckStatus = "NOT_STARTED" | "IN_PROGRESS" | "CHECKED_OK" | "CHECKED_WEAK" | "FAILED" | "NOT_APPLICABLE" | "BLOCKED";

export type SelectionTarget = {
  file: string;
  startLine: number;
  endLine: number;
  title: string;
  locator: string;
  selectedText: string;
  selectionStartOffset: number;
  selectionEndOffset: number;
};

type SelectionActionItem = vscode.QuickPickItem & {
  run?: () => Promise<void>;
};

type FollowUpState = {
  target: SelectionTarget;
  kind: string;
};

type RecentMarkActionItem = vscode.QuickPickItem & {
  action: "case" | "add_to_case";
  recent: RecentMarkEntry;
};

function normalizeTitle(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 120);
}

function entityLabel(entity?: ReviewEntity | null): string {
  if (!entity) {
    return "Untitled";
  }
  return entity.title || entity.name || entity.kind || entity.candidate_type || entity.predicate || "Untitled";
}

function isPayloadForTarget(payload: ReviewContextResponse | null, target: SelectionTarget) {
  return payload?.context?.file === target.file && payload?.context?.start_line === target.startLine;
}

function getScopedPayload(provider: SelectionActionCodeLensProvider, target: SelectionTarget) {
  const payload = provider.getContextPayload();
  return isPayloadForTarget(payload, target) ? payload : null;
}

function markKindCodeLensTitle(kindKey?: string | null): string {
  const k = (kindKey ?? "").toUpperCase();
  if (!k) {
    return "Mark";
  }
  const row = [...getMarkKindCatalogSnapshot()].find((entry) => entry.kind_key.toUpperCase() === k);
  return row?.display_label ?? kindKey ?? "Mark";
}

function candidateKind(candidate: ReviewEntity): string | null {
  const payload = candidate.proposed_payload;
  const rawKind = typeof payload?.kind === "string" ? payload.kind : undefined;
  if (!rawKind) {
    return null;
  }
  const k = rawKind.toUpperCase();
  return k === "SOURCE" || k === "SINK" || k === "GUARD" || k === "TRANSFORM" ? k : null;
}

function matchingCandidateForKind(payload: ReviewContextResponse | null, kind: string) {
  return (payload?.candidates ?? []).find((candidate) => candidate.candidate_type === "MARK" && candidateKind(candidate) === kind);
}

function currentMarkForKind(payload: ReviewContextResponse | null, kind: string) {
  return (payload?.marks ?? []).find((mark) => (mark.kind ?? "").toUpperCase() === kind);
}

function markMatchesSelection(mark: ReviewEntity, objects: ReviewEntity[], target: SelectionTarget): boolean {
  if (sameLocation(target, mark)) {
    return true;
  }
  if (mark.object_id) {
    const object = objects.find((item) => item.id === mark.object_id);
    if (object && sameLocation(target, object)) {
      return true;
    }
  }
  return false;
}

function currentMark(payload: ReviewContextResponse | null, explicitTarget?: SelectionTarget | null): ReviewEntity | undefined {
  const marks = payload?.marks;
  if (!marks?.length) {
    return undefined;
  }
  const target = explicitTarget ?? payloadContextTarget(payload);
  if (!target) {
    return marks[0];
  }
  const objects = payload?.objects ?? [];
  return marks.find((mark) => markMatchesSelection(mark, objects, target)) ?? marks[0];
}

function payloadContextTarget(payload: ReviewContextResponse | null): SelectionTarget | null {
  const file = payload?.context?.file;
  const startLine = payload?.context?.start_line;
  if (!file || typeof startLine !== "number") {
    return null;
  }
  const endLine = typeof payload?.context?.end_line === "number" ? payload.context.end_line : startLine;
  return {
    file,
    startLine,
    endLine,
    title: "",
    locator: `${file}:${startLine}`,
    selectedText: "",
    selectionStartOffset: 0,
    selectionEndOffset: 0,
  };
}

function currentCheck(payload: ReviewContextResponse | null) {
  const target = payloadContextTarget(payload);
  if (!payload?.checks?.length) {
    return undefined;
  }
  if (!target) {
    return payload.checks[0];
  }
  return payload.checks.find((check) => sameLocation(target, check));
}

function currentCase(payload: ReviewContextResponse | null) {
  return payload?.cases?.[0];
}

function isEntityInCase(
  payload: ReviewContextResponse | null,
  entityType: string,
  entityId: string,
  caseId: string,
) {
  return (payload?.relations ?? []).some((relation) =>
    relation.predicate === "PART_OF"
    && (
      (relation.subject_type === entityType && relation.subject_id === entityId && relation.object_type === "CASE" && relation.object_id === caseId)
      || (relation.object_type === entityType && relation.object_id === entityId && relation.subject_type === "CASE" && relation.subject_id === caseId)
    ));
}

function sameLocation(target: SelectionTarget, entity: ReviewEntity) {
  if (entity.locator && entity.locator.startsWith(target.file)) {
    return true;
  }
  const range = entity.range;
  return range?.file === target.file
    && (range.start_line ?? target.startLine) <= target.endLine
    && (range.end_line ?? range.start_line ?? target.endLine) >= target.startLine;
}

function getContextObject(target: SelectionTarget, payload: ReviewContextResponse | null) {
  return (payload?.objects ?? []).find((item) => sameLocation(target, item));
}

function oppositeKind(kind: string): string | null {
  if (kind === "SOURCE") {
    return "SINK";
  }
  if (kind === "SINK") {
    return "SOURCE";
  }
  return null;
}

function getRecentOppositeMark(kind: string) {
  const opposite = oppositeKind(kind);
  return opposite ? getRecentMarks(opposite)[0] : null;
}

function isSelectionTarget(value: unknown): value is SelectionTarget {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SelectionTarget>;
  return typeof candidate.file === "string"
    && typeof candidate.startLine === "number"
    && typeof candidate.endLine === "number"
    && typeof candidate.title === "string"
    && typeof candidate.locator === "string";
}

function editorForUri(uri: vscode.Uri | undefined) {
  if (!uri) {
    return vscode.window.activeTextEditor;
  }
  return vscode.window.visibleTextEditors.find((item) => item.document.uri.toString() === uri.toString())
    ?? (vscode.window.activeTextEditor?.document.uri.toString() === uri.toString() ? vscode.window.activeTextEditor : undefined);
}

function targetFromEditorLine(editor: vscode.TextEditor, line: number): SelectionTarget | null {
  const boundedLine = Math.max(0, Math.min(line, editor.document.lineCount - 1));
  const documentLine = editor.document.lineAt(boundedLine);
  const text = documentLine.text.trim() ? documentLine.text : editor.document.getText(documentLine.range);
  const title = normalizeTitle(text || `Line ${boundedLine + 1}`);
  if (!title) {
    return null;
  }
  const file = relativeFilePathFromUri(editor.document.uri);
  return {
    file,
    startLine: boundedLine + 1,
    endLine: boundedLine + 1,
    title,
    locator: `${file}:${boundedLine + 1}`,
    selectedText: text,
    selectionStartOffset: editor.document.offsetAt(documentLine.range.start),
    selectionEndOffset: editor.document.offsetAt(documentLine.range.end),
  };
}

function targetFromEditorRange(editor: vscode.TextEditor, range: vscode.Range) {
  editor.selection = new vscode.Selection(range.start, range.end);
  return getSelectionTarget(editor) ?? targetFromEditorLine(editor, range.start.line);
}

function selectionTargetFromCommandArgs(args: unknown[]): SelectionTarget | undefined {
  for (const arg of args) {
    if (isSelectionTarget(arg)) {
      return arg;
    }
  }

  const uri = args.find((arg): arg is vscode.Uri => arg instanceof vscode.Uri);
  const range = args.find((arg): arg is vscode.Range => arg instanceof vscode.Range);
  const position = args.find((arg): arg is vscode.Position => arg instanceof vscode.Position);
  const editor = editorForUri(uri);
  if (editor && range) {
    return targetFromEditorRange(editor, range) ?? undefined;
  }
  if (editor && position) {
    return targetFromEditorLine(editor, position.line) ?? undefined;
  }

  for (const arg of args) {
    if (!arg || typeof arg !== "object") {
      continue;
    }
    const record = arg as Record<string, unknown>;
    const nestedUri = record.uri instanceof vscode.Uri
      ? record.uri
      : record.resource instanceof vscode.Uri
        ? record.resource
        : undefined;
    const nestedEditor = editorForUri(nestedUri) ?? editor;
    const nestedRange = record.range instanceof vscode.Range
      ? record.range
      : record.selection instanceof vscode.Range
        ? record.selection
        : undefined;
    if (nestedEditor && nestedRange) {
      return targetFromEditorRange(nestedEditor, nestedRange) ?? undefined;
    }
    const rawLine = typeof record.lineNumber === "number"
      ? record.lineNumber
      : typeof record.line === "number"
        ? record.line
        : undefined;
    if (nestedEditor && typeof rawLine === "number") {
      return targetFromEditorLine(nestedEditor, rawLine > 0 ? rawLine - 1 : rawLine) ?? undefined;
    }
  }

  return undefined;
}

function getCurrentMarkForTarget(provider: SelectionActionCodeLensProvider, target?: SelectionTarget): ReviewEntity | undefined {
  const payload = target ? getScopedPayload(provider, target) : provider.getContextPayload();
  return currentMark(payload, target);
}

function objectPayloadFromTarget(
  kind: string,
  target: SelectionTarget,
  contextSnippet?: string,
  contextStartLine?: number,
  contextEndLine?: number,
  highlightStartOffset?: number,
  highlightEndOffset?: number,
) {
  return {
    type: "CODE",
    kind: `${kind}_MANUAL`,
    name: target.title,
    locator: target.locator,
    range: { file: target.file, start_line: target.startLine, end_line: target.endLine },
    properties: {
      selected_text: target.selectedText,
      context_snippet: contextSnippet,
      context_start_line: contextStartLine,
      context_end_line: contextEndLine,
      context_highlight_start_offset: highlightStartOffset,
      context_highlight_end_offset: highlightEndOffset,
    },
    source: "MANUAL_JSON",
  };
}

export function getSelectionTarget(editor: vscode.TextEditor): SelectionTarget | null {
  const selection = editor.selection;
  const file = relativeFilePathFromUri(editor.document.uri);

  let text = editor.document.getText(selection);
  let range: vscode.Range = selection;

  if (!text.trim()) {
    const line = editor.document.lineAt(selection.active.line);
    if (line.text.trim()) {
      text = line.text;
      range = line.range;
    } else {
      const wordRange = editor.document.getWordRangeAtPosition(selection.active);
      if (!wordRange) {
        return null;
      }
      text = editor.document.getText(wordRange);
      if (text.trim().length < 2) {
        return null;
      }
      range = wordRange;
    }
  }

  const title = normalizeTitle(text);
  if (!title) {
    return null;
  }

  return {
    file,
    startLine: range.start.line + 1,
    endLine: range.end.line + 1,
    title,
    locator: `${file}:${range.start.line + 1}`,
    selectedText: text,
    selectionStartOffset: editor.document.offsetAt(range.start),
    selectionEndOffset: editor.document.offsetAt(range.end),
  };
}

function symbolContainsRange(range: vscode.Range, startLine: number, endLine: number) {
  return range.start.line <= startLine && range.end.line >= endLine;
}

function pickTightestContainer(symbols: readonly vscode.DocumentSymbol[], startLine: number, endLine: number): vscode.Range | null {
  let best: vscode.Range | null = null;
  const eligibleKinds = new Set([
    vscode.SymbolKind.Method,
    vscode.SymbolKind.Function,
    vscode.SymbolKind.Constructor,
  ]);
  const visit = (items: readonly vscode.DocumentSymbol[]) => {
    for (const symbol of items) {
      if (symbolContainsRange(symbol.range, startLine, endLine)) {
        if (eligibleKinds.has(symbol.kind)) {
          if (!best || (symbol.range.end.line - symbol.range.start.line) < (best.end.line - best.start.line)) {
            best = symbol.range;
          }
        }
        if (symbol.children.length) {
          visit(symbol.children);
        }
      }
    }
  };
  visit(symbols);
  return best;
}

async function getMarkContext(editor: vscode.TextEditor, target: SelectionTarget) {
  const padding = 10;
  const startLine = target.startLine - 1;
  const endLine = target.endLine - 1;
  let lowerBound = 0;
  let upperBound = editor.document.lineCount - 1;

  try {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[] | vscode.SymbolInformation[]>(
      "vscode.executeDocumentSymbolProvider",
      editor.document.uri,
    );
    if (symbols && symbols.length && "range" in symbols[0]) {
      const range = pickTightestContainer(symbols as vscode.DocumentSymbol[], startLine, endLine);
      if (range) {
        lowerBound = range.start.line;
        upperBound = range.end.line;
      }
    }
  } catch {
    // Best-effort only; fall back to file bounds.
  }

  const contextStart = Math.max(lowerBound, startLine - padding);
  const contextEnd = Math.min(upperBound, endLine + padding);
  const snippetRange = new vscode.Range(contextStart, 0, contextEnd, editor.document.lineAt(contextEnd).text.length);
  const snippetStartOffset = editor.document.offsetAt(snippetRange.start);
  const snippetEndOffset = editor.document.offsetAt(snippetRange.end);
  const highlightStartOffset = Math.max(0, Math.min(snippetEndOffset - snippetStartOffset, target.selectionStartOffset - snippetStartOffset));
  const highlightEndOffset = Math.max(
    highlightStartOffset,
    Math.min(snippetEndOffset - snippetStartOffset, target.selectionEndOffset - snippetStartOffset),
  );
  return {
    contextSnippet: editor.document.getText(snippetRange),
    contextStartLine: contextStart + 1,
    contextEndLine: contextEnd + 1,
    highlightStartOffset,
    highlightEndOffset,
  };
}

async function refreshContext(provider: SelectionActionCodeLensProvider) {
  await vscode.commands.executeCommand("appsecWorkbench.refreshContext");
  await vscode.commands.executeCommand("appsecWorkbench.refreshLinkedEntities");
  provider.refresh();
}

async function linkEntityToActiveCase(api: WorkbenchApiClient, entityType: "MARK" | "CHECK" | "EVIDENCE" | "FINDING", entityId: string) {
  const activeCase = getActiveCase();
  if (!activeCase?.id) {
    return;
  }
  await api.createRelation({
    subject_type: entityType,
    subject_id: entityId,
    predicate: "PART_OF",
    object_type: "CASE",
    object_id: activeCase.id,
  });
}

async function addCurrentMarkToActiveCase(provider: SelectionActionCodeLensProvider) {
  const payload = provider.getContextPayload();
  const target = payloadContextTarget(payload);
  const mark = currentMark(payload, target);
  if (!mark) {
    vscode.window.showWarningMessage("AppSec: no current mark on this line");
    return;
  }
  const activeCase = getActiveCase();
  if (!activeCase?.id) {
    vscode.window.showWarningMessage("AppSec: set Active Case first");
    return;
  }
  if (isEntityInCase(payload, "MARK", mark.id, activeCase.id)) {
    vscode.window.showInformationMessage(`AppSec: ${entityLabel(mark)} is already in case ${activeCase.title}`);
    return;
  }
  const api = new WorkbenchApiClient(readState());
  await linkEntityToActiveCase(api, "MARK", mark.id);
  vscode.window.showInformationMessage(`AppSec: added ${entityLabel(mark)} to case ${activeCase.title}`);
  await refreshContext(provider);
}

async function addCurrentCheckToActiveCase(provider: SelectionActionCodeLensProvider) {
  const payload = provider.getContextPayload();
  const check = currentCheck(payload);
  if (!check) {
    vscode.window.showWarningMessage("AppSec: no current check on this line");
    return;
  }
  const activeCase = getActiveCase();
  if (!activeCase?.id) {
    vscode.window.showWarningMessage("AppSec: set Active Case first");
    return;
  }
  if (isEntityInCase(payload, "CHECK", check.id, activeCase.id)) {
    vscode.window.showInformationMessage(`AppSec: ${entityLabel(check)} is already in case ${activeCase.title}`);
    return;
  }
  const api = new WorkbenchApiClient(readState());
  await linkEntityToActiveCase(api, "CHECK", check.id);
  vscode.window.showInformationMessage(`AppSec: added ${entityLabel(check)} to case ${activeCase.title}`);
  await refreshContext(provider);
}

async function addRecentMarkToActiveCase(provider: SelectionActionCodeLensProvider, recentId: string) {
  const recent = getRecentMarkById(recentId);
  if (!recent) {
    vscode.window.showWarningMessage("AppSec: recent mark no longer exists");
    return;
  }
  const activeCase = getActiveCase();
  if (!activeCase?.id) {
    vscode.window.showWarningMessage("AppSec: set Active Case first");
    return;
  }
  if (isEntityInCase(provider.getContextPayload(), "MARK", recent.id, activeCase.id)) {
    vscode.window.showInformationMessage(`AppSec: ${entityLabel(recent)} is already in case ${activeCase.title}`);
    return;
  }
  const api = new WorkbenchApiClient(readState());
  await linkEntityToActiveCase(api, "MARK", recent.id);
  vscode.window.showInformationMessage(`AppSec: added ${entityLabel(recent)} to case ${activeCase.title}`);
  await refreshContext(provider);
}

async function acceptCandidate(candidate: ReviewEntity, provider: SelectionActionCodeLensProvider) {
  const api = new WorkbenchApiClient(readState());
  await api.acceptCandidate(candidate.id);
  const kind = candidateKind(candidate);
  vscode.window.showInformationMessage(`AppSec: accepted ${kind ?? candidate.candidate_type ?? "candidate"}`);
  await refreshContext(provider);
  if (kind) {
    const createdMark = currentMarkForKind(provider.getContextPayload(), kind);
    if (createdMark) {
      pushRecentMark({ ...createdMark, locator: createdMark.locator ?? String(candidate.proposed_payload?.locator ?? candidate.locator ?? ""), title: entityLabel(createdMark) });
      const payload = provider.getContextPayload();
      const target = payload?.context?.file && payload?.context?.start_line
          ? {
              file: payload.context.file,
              startLine: payload.context.start_line,
              endLine: payload.context.end_line ?? payload.context.start_line,
              title: entityLabel(createdMark),
              locator: createdMark.locator ?? `${payload.context.file}:${payload.context.start_line}`,
              selectedText: entityLabel(createdMark),
              selectionStartOffset: 0,
              selectionEndOffset: entityLabel(createdMark).length,
            }
          : null;
      if (target) {
        provider.setFollowUp({ target, kind });
        provider.refresh();
      }
    }
  }
}

async function rejectCandidate(candidate: ReviewEntity, provider: SelectionActionCodeLensProvider) {
  const api = new WorkbenchApiClient(readState());
  await api.rejectCandidate(candidate.id);
  vscode.window.showInformationMessage("AppSec: candidate rejected");
  await refreshContext(provider);
}

async function createMark(kind: string, provider: SelectionActionCodeLensProvider, forcePrompt = false, explicitEditor?: vscode.TextEditor, explicitTarget?: SelectionTarget) {
  const editor = explicitEditor ?? vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const target = explicitTarget ?? getSelectionTarget(editor);
  if (!target) {
    vscode.window.showErrorMessage("AppSec: select text or place the cursor on a symbol first");
    return;
  }

  const contextPayload = getScopedPayload(provider, target);
  const existing = currentMarkForKind(contextPayload, kind);
  if (existing) {
    pushRecentMark({ ...existing, locator: existing.locator ?? target.locator, title: entityLabel(existing) });
    vscode.window.showInformationMessage(`AppSec: ${kind} already marked here`);
    return;
  }

  const title = forcePrompt
    ? await vscode.window.showInputBox({ prompt: `Title for ${kind} mark`, value: target.title })
    : target.title;

  if (!title) {
    return;
  }

  const api = new WorkbenchApiClient(readState());
  const object = getContextObject(target, contextPayload);
  const markContext = await getMarkContext(editor, target);
  const objectProperties: Record<string, unknown> = {
    selected_text: target.selectedText,
    context_snippet: markContext.contextSnippet,
    context_start_line: markContext.contextStartLine,
    context_end_line: markContext.contextEndLine,
    context_highlight_start_offset: markContext.highlightStartOffset,
    context_highlight_end_offset: markContext.highlightEndOffset,
  };
  const objectPayload = {
    ...objectPayloadFromTarget(
      kind,
      target,
      markContext.contextSnippet,
      markContext.contextStartLine,
      markContext.contextEndLine,
      markContext.highlightStartOffset,
      markContext.highlightEndOffset,
    ),
    name: title,
    properties: objectProperties,
  };
  const mark = await api.createMark(kind, {
    title,
    note: "",
    object_id: object?.id,
    object_payload: objectPayload,
  });
  await linkEntityToActiveCase(api, "MARK", mark.id);
  pushRecentMark({ ...mark, kind, locator: object?.locator ?? target.locator, title });
  provider.setFollowUp({ target, kind });
  provider.refresh();
  vscode.window.showInformationMessage(`AppSec: ${kind} marked`);
  await refreshContext(provider);
}

async function toggleCurrentMarkDeadEnd(provider: SelectionActionCodeLensProvider, explicitTarget?: SelectionTarget) {
  const editor = vscode.window.activeTextEditor;
  const target = explicitTarget ?? (editor ? getSelectionTarget(editor) : null);
  const payload = target ? getScopedPayload(provider, target) : provider.getContextPayload();
  const mark = currentMark(payload, target);
  if (!mark) {
    vscode.window.showWarningMessage("AppSec: no current mark on this line");
    return;
  }
  const nextValue = !mark.is_dead_end;
  const api = new WorkbenchApiClient(readState());
  await api.updateMark(mark.id, { is_dead_end: nextValue });
  vscode.window.showInformationMessage(nextValue ? "AppSec: marked as dead end" : "AppSec: dead-end mark removed");
  await refreshContext(provider);
}

async function setMarkDescriptionFromSelection(
  provider: SelectionActionCodeLensProvider,
  explicitTarget?: SelectionTarget,
) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const target = explicitTarget ?? getSelectionTarget(editor);
  if (!target) {
    vscode.window.showWarningMessage("AppSec: no selection target on this line");
    return;
  }
  const mark = currentMark(getScopedPayload(provider, target), target);
  if (!mark) {
    vscode.window.showWarningMessage("AppSec: no mark on this line");
    return;
  }
  showMarkDescriptionEditor(
    editor,
    target.startLine - 1,
    mark.note ?? "",
    mark.id,
    async (text) => {
      const api = new WorkbenchApiClient(readState());
      await api.updateMark(mark.id, { note: text });
      await refreshContext(provider);
    },
    () => {},
  );
}

type ApiRelationRow = {
  id: string;
  predicate?: string;
  subject_type?: string;
  subject_id?: string;
  object_type?: string;
  object_id?: string;
  properties?: Record<string, unknown>;
};

function findMarkCasePartOfRelation(rows: ApiRelationRow[], markId: string, caseId: string): ApiRelationRow | undefined {
  return rows.find((r) =>
    r.predicate === "PART_OF"
    && (
      (
        r.subject_type?.toUpperCase() === "MARK"
        && r.subject_id === markId
        && r.object_type?.toUpperCase() === "CASE"
        && r.object_id === caseId
      )
      || (
        r.subject_type?.toUpperCase() === "CASE"
        && r.subject_id === caseId
        && r.object_type?.toUpperCase() === "MARK"
        && r.object_id === markId
      )
    ),
  );
}

async function setMarkRelationDisplayName(provider: SelectionActionCodeLensProvider, explicitTarget?: SelectionTarget) {
  const editor = vscode.window.activeTextEditor;
  const target = explicitTarget ?? (editor ? getSelectionTarget(editor) : null);
  if (!target) {
    vscode.window.showWarningMessage("AppSec: no selection target on this line");
    return;
  }
  const scoped = getScopedPayload(provider, target);
  const mark = currentMark(scoped, target);
  if (!mark?.id) {
    vscode.window.showWarningMessage("AppSec: no mark on this line");
    return;
  }
  const activeCase = getActiveCase();
  if (!activeCase?.id) {
    vscode.window.showWarningMessage("AppSec: set Active Case first");
    return;
  }
  const api = new WorkbenchApiClient(readState());
  const raw = await api.getRelations();
  const relations = (Array.isArray(raw) ? raw : []) as ApiRelationRow[];
  const relation = findMarkCasePartOfRelation(relations, mark.id, activeCase.id);
  if (!relation) {
    vscode.window.showWarningMessage("AppSec: mark is not linked to active case (no PART_OF)");
    return;
  }
  const properties = { ...(relation.properties ?? {}) } as Record<string, unknown>;
  const current = String(properties.display_name ?? "").trim();
  const value = await vscode.window.showInputBox({
    prompt: "Display name for this mark in Linked Entities (edge to active case)",
    value: current,
    validateInput: (text) => (text.trim().length > 200 ? "Max 200 characters" : undefined),
  });
  if (value === undefined) {
    return;
  }
  const trimmed = value.trim();
  if (trimmed) {
    properties.display_name = trimmed;
  } else {
    delete properties.display_name;
  }
  await api.updateRelation(relation.id, { properties });
  vscode.window.showInformationMessage("AppSec: display name updated");
  await refreshContext(provider);
  await vscode.commands.executeCommand("appsecWorkbench.refreshLinkedEntities");
}

async function removeCurrentMark(provider: SelectionActionCodeLensProvider, explicitTarget?: SelectionTarget) {
  const editor = vscode.window.activeTextEditor;
  const target = explicitTarget ?? (editor ? getSelectionTarget(editor) : null);
  const payload = target ? getScopedPayload(provider, target) : provider.getContextPayload();
  const mark = currentMark(payload, target);
  if (!mark) {
    vscode.window.showWarningMessage("AppSec: no current mark on this line");
    return;
  }
  const confirmation = await vscode.window.showWarningMessage(
    `Remove mark "${entityLabel(mark)}"?`,
    { modal: true },
    "Remove",
  );
  if (confirmation !== "Remove") {
    return;
  }
  const api = new WorkbenchApiClient(readState());
  await api.deleteMark(mark.id);
  vscode.window.showInformationMessage("AppSec: mark removed");
  await refreshContext(provider);
}

function suggestedCheckTitle(target: SelectionTarget, payload: ReviewContextResponse | null) {
  const mark = currentMark(payload, target);
  if (mark?.kind === "SINK") {
    const source = getRecentMarks("SOURCE")[0];
    return source ? `${entityLabel(source)} cannot reach ${entityLabel(mark)}` : `User-controlled input cannot reach ${entityLabel(mark)}`;
  }
  if (mark?.kind === "SOURCE") {
    const sink = getRecentMarks("SINK")[0];
    return sink ? `${entityLabel(mark)} cannot reach ${entityLabel(sink)}` : `Review source flow from ${entityLabel(mark)}`;
  }
  if (mark?.kind === "GUARD") {
    return `${entityLabel(mark)} cannot be bypassed`;
  }
  return `Review ${target.title}`;
}

async function createCheckFromSelection(provider: SelectionActionCodeLensProvider, editor?: vscode.TextEditor, explicitTarget?: SelectionTarget) {
  const targetEditor = editor ?? vscode.window.activeTextEditor;
  const target = explicitTarget ?? (targetEditor ? getSelectionTarget(targetEditor) : null);
  if (!target) {
    return;
  }
  const payload = getScopedPayload(provider, target);
  const title = await vscode.window.showInputBox({ prompt: "Check title", value: suggestedCheckTitle(target, payload) });
  if (!title) {
    return;
  }
  const api = new WorkbenchApiClient(readState());
  const check = await api.createCheck({
    title,
    description: "",
    category: "CODE_REVIEW",
    check_type: "MANUAL",
    priority: "MEDIUM",
    status: "NOT_STARTED",
    source: "MANUAL_JSON",
  });
  await linkEntityToActiveCase(api, "CHECK", check.id);

  const mark = currentMark(payload, target);
  if (mark) {
    await api.createRelation({
      subject_type: "CHECK",
      subject_id: check.id,
      predicate: "CHECKS",
      object_type: "MARK",
      object_id: mark.id,
    });
  }
  const reviewCase = currentCase(payload);
  if (reviewCase) {
    await api.createRelation({
      subject_type: "CHECK",
      subject_id: check.id,
      predicate: "PART_OF",
      object_type: "CASE",
      object_id: reviewCase.id,
    });
  }
  vscode.window.showInformationMessage("AppSec: check created");
  await refreshContext(provider);
}

async function createCaseFromContext(provider: SelectionActionCodeLensProvider, editor?: vscode.TextEditor, explicitTarget?: SelectionTarget) {
  const targetEditor = editor ?? vscode.window.activeTextEditor;
  const target = explicitTarget ?? (targetEditor ? getSelectionTarget(targetEditor) : null);
  if (!target) {
    return;
  }
  const payload = getScopedPayload(provider, target);
  const mark = currentMark(payload, target);
  const recentOpposite = mark?.kind ? getRecentOppositeMark(mark.kind) : null;
  const autoTitle = mark && recentOpposite
    ? `Possible ${entityLabel(mark.kind === "SOURCE" ? mark : recentOpposite)} -> ${entityLabel(mark.kind === "SINK" ? mark : recentOpposite)}`
    : `Possible ${mark ? entityLabel(mark) : target.title}`;
  const title = await vscode.window.showInputBox({ prompt: "Case title", value: autoTitle });
  if (!title) {
    return;
  }

  const api = new WorkbenchApiClient(readState());
  let createdCase;
  try {
    createdCase = await api.createCase({
      title,
      description: `Created from ${target.locator}`,
      confidence: "MEDIUM",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`AppSec: не удалось создать case: ${message}`);
    return;
  }

  const marksToAttach = [mark, recentOpposite].filter((item): item is ReviewEntity => Boolean(item));
  for (const entry of marksToAttach) {
    await api.createRelation({
      subject_type: "MARK",
      subject_id: entry.id,
      predicate: "PART_OF",
      object_type: "CASE",
      object_id: createdCase.id,
    });
  }

  vscode.window.showInformationMessage("AppSec: case created");
  await refreshContext(provider);
}

async function createCaseWithRecent(provider: SelectionActionCodeLensProvider, target: SelectionTarget, mark: ReviewEntity, recent: RecentMarkEntry) {
  const api = new WorkbenchApiClient(readState());
  const source = mark.kind === "SOURCE" ? mark : recent;
  const sink = mark.kind === "SINK" ? mark : recent;
  let createdCase;
  try {
    createdCase = await api.createCase({
      title: `Possible ${entityLabel(source)} -> ${entityLabel(sink)}`,
      description: `Created from ${target.locator}`,
      confidence: "MEDIUM",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`AppSec: не удалось создать case: ${message}`);
    return;
  }
  for (const entry of [mark, recent]) {
    await api.createRelation({
      subject_type: "MARK",
      subject_id: entry.id,
      predicate: "PART_OF",
      object_type: "CASE",
      object_id: createdCase.id,
    });
  }
  vscode.window.showInformationMessage(`AppSec: case created for ${entityLabel(source)} -> ${entityLabel(sink)}`);
  await refreshContext(provider);
}

async function addRecentToCurrentCase(provider: SelectionActionCodeLensProvider, target: SelectionTarget, recent: RecentMarkEntry) {
  const reviewCase = currentCase(getScopedPayload(provider, target));
  if (!reviewCase) {
    vscode.window.showWarningMessage("AppSec: no current case on this line");
    return;
  }
  const api = new WorkbenchApiClient(readState());
  await api.createRelation({
    subject_type: "MARK",
    subject_id: recent.id,
    predicate: "PART_OF",
    object_type: "CASE",
    object_id: reviewCase.id,
  });
  vscode.window.showInformationMessage(`AppSec: added ${entityLabel(recent)} to case ${entityLabel(reviewCase)}`);
  await refreshContext(provider);
}

async function showRecentMarkActions(provider: SelectionActionCodeLensProvider, explicitTarget?: SelectionTarget) {
  const editor = vscode.window.activeTextEditor;
  const target = explicitTarget ?? (editor ? getSelectionTarget(editor) : null);
  if (!target) {
    return;
  }
  const scopedPayload = getScopedPayload(provider, target);
  const mark = currentMark(scopedPayload, target);
  if (!mark) {
    vscode.window.showWarningMessage("AppSec: current line needs a mark first");
    return;
  }

  const recents = getRecentMarks()
    .filter((entry) => entry.id !== mark.id)
    .filter((entry) => entry.kind !== "GUARD" && entry.kind !== "TRANSFORM" ? true : true)
    .slice(0, 10);
  if (!recents.length) {
    vscode.window.showWarningMessage("AppSec: no recent marks available");
    return;
  }

  const items: RecentMarkActionItem[] = [];
  for (const recent of recents) {
    if ((mark.kind === "SOURCE" && recent.kind === "SINK") || (mark.kind === "SINK" && recent.kind === "SOURCE")) {
      items.push({
        label: `Create Case with [${recent.kind}] ${recent.label}`,
        detail: recent.locator,
        action: "case",
        recent,
      });
    }
    if (currentCase(scopedPayload)) {
      items.push({
        label: `Add [${recent.kind}] ${recent.label} to current Case`,
        detail: recent.locator,
        action: "add_to_case",
        recent,
      });
    }
  }

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `Recent actions for ${entityLabel(mark)}`,
    ignoreFocusOut: true,
    matchOnDetail: true,
  });
  if (!picked) {
    return;
  }
  if (picked.action === "case") {
    await createCaseWithRecent(provider, target, mark, picked.recent);
    return;
  }
  await addRecentToCurrentCase(provider, target, picked.recent);
}

async function applyRecentMarkAction(
  provider: SelectionActionCodeLensProvider,
  action: "case" | "add_to_case",
  recentId: string,
  explicitTarget?: SelectionTarget,
) {
  const editor = vscode.window.activeTextEditor;
  const target = explicitTarget ?? (editor ? getSelectionTarget(editor) : null);
  if (!target) {
    vscode.window.showWarningMessage("AppSec: no current code location selected");
    return;
  }
  const recent = getRecentMarkById(recentId);
  if (!recent) {
    vscode.window.showWarningMessage("AppSec: recent mark no longer exists");
    return;
  }
  const scopedPayload = getScopedPayload(provider, target);
  const mark = currentMark(scopedPayload, target);
  if (!mark) {
    vscode.window.showWarningMessage("AppSec: current line needs a mark first");
    return;
  }
  if (action === "case") {
    await createCaseWithRecent(provider, target, mark, recent);
    return;
  }
  await addRecentToCurrentCase(provider, target, recent);
}

async function attachEvidenceFromSelection(provider: SelectionActionCodeLensProvider, editor?: vscode.TextEditor, explicitTarget?: SelectionTarget) {
  const targetEditor = editor ?? vscode.window.activeTextEditor;
  const target = explicitTarget ?? (targetEditor ? getSelectionTarget(targetEditor) : null);
  if (!target) {
    return;
  }

  const payload = getScopedPayload(provider, target);
  const linkedCheck = currentCheck(payload);
  const linkedCase = currentCase(payload);
  const linkedMark = currentMark(payload, target);
  const title = await vscode.window.showInputBox({ prompt: "Evidence title", value: `Code snippet: ${target.file}:${target.startLine}-${target.endLine}` });
  if (!title) {
    return;
  }

  const linkTarget = linkedCheck
    ? [{ object_type: "CHECK", object_id: linkedCheck.id, predicate: "SUPPORTS" }]
    : linkedCase
      ? [{ object_type: "CASE", object_id: linkedCase.id, predicate: "SUPPORTS" }]
      : linkedMark
        ? [{ object_type: "MARK", object_id: linkedMark.id, predicate: "SUPPORTS" }]
        : [];

  const api = new WorkbenchApiClient(readState());
  const created = await api.createEvidence({
    title,
    evidence_type: "CODE_SNIPPET",
    summary: `Captured from ${target.locator}`,
    content: targetEditor?.document.getText(targetEditor.selection) || target.selectedText || target.title,
    confidence: "MEDIUM",
    source: "MANUAL_JSON",
    properties: { file: target.file, start_line: target.startLine, end_line: target.endLine },
    link_to: linkTarget,
  });
  const activeCase = getActiveCase();
  if (activeCase?.id && created?.evidence?.id && !linkTarget.some((item) => item.object_type === "CASE" && item.object_id === activeCase.id)) {
    await api.createRelation({
      subject_type: "EVIDENCE",
      subject_id: created.evidence.id,
      predicate: "SUPPORTS",
      object_type: "CASE",
      object_id: activeCase.id,
    });
  }
  vscode.window.showInformationMessage(`AppSec: evidence attached${linkTarget.length ? ` to ${linkTarget[0].object_type.toLowerCase()}` : ""}`);
  await refreshContext(provider);
}

async function setCheckStatus(provider: SelectionActionCodeLensProvider, status: CheckStatus) {
  const check = currentCheck(provider.getContextPayload());
  if (!check) {
    vscode.window.showWarningMessage("AppSec: no check is attached to the current line");
    return;
  }
  const needsReason = ["CHECKED_WEAK", "FAILED", "NOT_APPLICABLE", "BLOCKED"].includes(status);
  const reason = needsReason ? await vscode.window.showInputBox({ prompt: `Reason for ${status}`, value: check.reason || "" }) : undefined;
  if (needsReason && !reason) {
    return;
  }
  const api = new WorkbenchApiClient(readState());
  await api.updateCheckStatus(check.id, { status, reason });
  vscode.window.showInformationMessage(`AppSec: check set to ${status}`);
  await refreshContext(provider);
}

async function convertFailedCheckToFinding(provider: SelectionActionCodeLensProvider) {
  const check = currentCheck(provider.getContextPayload());
  if (!check || !check.status || !["FAILED", "CHECKED_WEAK"].includes(check.status)) {
    vscode.window.showWarningMessage("AppSec: current line has no failed or weak check");
    return;
  }
  const title = await vscode.window.showInputBox({ prompt: "Finding title", value: check.title || "Confirmed finding" });
  if (!title) {
    return;
  }
  const api = new WorkbenchApiClient(readState());
  const finding = await api.convertCheckToFinding(check.id, {
    title,
    severity: check.status === "FAILED" ? "HIGH" : "MEDIUM",
    finding_type: "CODE_REVIEW",
    description: `Derived from check: ${check.title}`,
    impact: "Security-sensitive behavior appears reachable and needs remediation.",
    recommendation: "Confirm exploitability, constrain the flow, and add regression coverage.",
  });
  await linkEntityToActiveCase(api, "FINDING", finding.id);
  vscode.window.showInformationMessage("AppSec: finding created from check");
  await refreshContext(provider);
}

export class SelectionActionCodeLensProvider implements vscode.CodeLensProvider {
  private readonly onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  private payload: ReviewContextResponse | null = null;
  private followUp: FollowUpState | null = null;

  readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

  refresh() {
    this.onDidChangeCodeLensesEmitter.fire();
  }

  setContextPayload(payload: ReviewContextResponse | null) {
    this.payload = payload;
  }

  getContextPayload() {
    return this.payload;
  }

  setFollowUp(followUp: FollowUpState | null) {
    this.followUp = followUp;
  }

  clearFollowUp() {
    this.followUp = null;
  }

  onSelectionTargetChanged(target: SelectionTarget | null) {
    if (!target || !this.followUp) {
      this.followUp = null;
      return;
    }
    if (this.followUp.target.file !== target.file || this.followUp.target.startLine !== target.startLine) {
      this.followUp = null;
    }
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const editor = vscode.window.visibleTextEditors.find((item) => item.document.uri.toString() === document.uri.toString())
      ?? vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== document.uri.toString()) {
      log(`CodeLens: skipped ${document.uri.toString()} because no matching visible editor`);
      return [];
    }

    const target = getSelectionTarget(editor);
    if (!target) {
      log(`CodeLens: no target for ${document.uri.toString()} at selection ${editor.selection.start.line}:${editor.selection.start.character}-${editor.selection.end.line}:${editor.selection.end.character}`);
      return [];
    }

    log(`CodeLens: rendering for ${document.uri.toString()} target=${target.title} line=${target.startLine}`);

    const range = new vscode.Range(target.startLine - 1, 0, target.startLine - 1, 0);
    const makeLens = (title: string, command: string, args: unknown[] = []) => new vscode.CodeLens(range, { title, command, arguments: args });
    const scopedPayload = getScopedPayload(this, target);
    const check = currentCheck(scopedPayload);
    const mark = currentMark(scopedPayload, target);
    const activeCase = getActiveCase();
    const markInActiveCase = activeCase?.id && mark ? isEntityInCase(scopedPayload, "MARK", mark.id, activeCase.id) : false;
    const checkInActiveCase = activeCase?.id && check ? isEntityInCase(scopedPayload, "CHECK", check.id, activeCase.id) : false;
    const sourceCandidate = matchingCandidateForKind(scopedPayload, "SOURCE");
    const sinkCandidate = matchingCandidateForKind(scopedPayload, "SINK");
    const guardCandidate = matchingCandidateForKind(scopedPayload, "GUARD");
    const transformCandidate = matchingCandidateForKind(scopedPayload, "TRANSFORM");
    const followUp = this.followUp && this.followUp.target.file === target.file && this.followUp.target.startLine === target.startLine
      ? this.followUp
      : null;

    if (followUp) {
      return [
        makeLens(`${markKindCodeLensTitle(followUp.kind)} marked`, "appsecWorkbench.dismissFollowUp"),
        makeLens("Set Description", "appsecWorkbench.setMarkDescriptionFromSelection", [target]),
        makeLens("Set display name", "appsecWorkbench.setMarkRelationDisplayName", [target]),
        makeLens(
          activeCase?.id
            ? (markInActiveCase ? `In Active Case: ${activeCase.title}` : `Add to Active Case: ${activeCase.title}`)
            : "Set Active Case first",
          markInActiveCase || !activeCase?.id ? "appsecWorkbench.refreshContext" : "appsecWorkbench.addCurrentMarkToActiveCase",
        ),
        makeLens("Remove Mark", "appsecWorkbench.removeCurrentMark", [target]),
        makeLens("Dismiss", "appsecWorkbench.dismissFollowUp"),
      ];
    }

    if (sinkCandidate || sourceCandidate || guardCandidate || transformCandidate) {
      const candidate = sinkCandidate || sourceCandidate || guardCandidate || transformCandidate;
      const kind = candidate ? candidateKind(candidate) : null;
      return [
        makeLens(`Accept ${kind ?? "Candidate"}${candidate?.source ? `: ${candidate.source}` : ""}`, "appsecWorkbench.acceptCandidate", [candidate]),
        makeLens("Reject", "appsecWorkbench.rejectCandidate", [candidate]),
      ];
    }

    if (check) {
      const lenses = [
        makeLens(`Check: ${check.status ?? "UNKNOWN"}`, "appsecWorkbench.refreshContext"),
        makeLens(
          activeCase?.id
            ? (checkInActiveCase ? `In Active Case: ${activeCase.title}` : `Add to Active Case: ${activeCase.title}`)
            : "Set Active Case first",
          checkInActiveCase || !activeCase?.id ? "appsecWorkbench.refreshContext" : "appsecWorkbench.addCurrentCheckToActiveCase",
        ),
        makeLens("OK", "appsecWorkbench.setCheckStatus", ["CHECKED_OK"]),
        makeLens("Weak", "appsecWorkbench.setCheckStatus", ["CHECKED_WEAK"]),
        makeLens("Failed", "appsecWorkbench.setCheckStatus", ["FAILED"]),
        makeLens("N/A", "appsecWorkbench.setCheckStatus", ["NOT_APPLICABLE"]),
      ];
      if (check.status === "FAILED" || check.status === "CHECKED_WEAK") {
        lenses.push(makeLens("Finding", "appsecWorkbench.convertCheckToFinding"));
      }
      return lenses;
    }

    if (mark) {
      return [
        makeLens(`${markKindCodeLensTitle(mark.kind)} marked`, "appsecWorkbench.refreshContext"),
        makeLens("Set Description", "appsecWorkbench.setMarkDescriptionFromSelection", [target]),
        makeLens("Set display name", "appsecWorkbench.setMarkRelationDisplayName", [target]),
        makeLens(
          activeCase?.id
            ? (markInActiveCase ? `In Active Case: ${activeCase.title}` : `Add to Active Case: ${activeCase.title}`)
            : "Set Active Case first",
          markInActiveCase || !activeCase?.id ? "appsecWorkbench.refreshContext" : "appsecWorkbench.addCurrentMarkToActiveCase",
        ),
        makeLens(mark.is_dead_end ? "Remove dead end" : "Dead end", "appsecWorkbench.toggleMarkDeadEnd", [target]),
        makeLens("Remove Mark", "appsecWorkbench.removeCurrentMark", [target]),
      ];
    }

    const catalogLenses = enabledMarkKindsSorted().map((entry) =>
      makeLens(entry.display_label, "appsecWorkbench.markWithKind", [entry.kind_key, target]),
    );
    return [...catalogLenses, makeLens("More…", "appsecWorkbench.showSelectionActions", [target])];
  }
}

async function showSelectionActions(provider: SelectionActionCodeLensProvider, editor?: vscode.TextEditor, explicitTarget?: SelectionTarget) {
  const targetEditor = editor ?? vscode.window.activeTextEditor;
  if (!targetEditor) {
    return;
  }

  const target = explicitTarget ?? getSelectionTarget(targetEditor);
  if (!target) {
    return;
  }

  const payload = getScopedPayload(provider, target);
  const mark = currentMark(payload, target);
  const check = currentCheck(payload);
  const candidate = matchingCandidateForKind(payload, "SINK")
    || matchingCandidateForKind(payload, "SOURCE")
    || matchingCandidateForKind(payload, "GUARD")
    || matchingCandidateForKind(payload, "TRANSFORM");

  const items: SelectionActionItem[] = [];
  if (candidate) {
    items.push({
      label: `Accept ${candidateKind(candidate) ?? candidate.candidate_type ?? "Candidate"}`,
      detail: candidate.source ? `From ${candidate.source}` : "Accept current suggestion",
      run: async () => acceptCandidate(candidate, provider),
    });
    items.push({
      label: "Reject",
      detail: "Dismiss this candidate",
      run: async () => rejectCandidate(candidate, provider),
    });
  } else if (!mark) {
    items.push(
      { label: "Mark", detail: `Use "${target.title}" as generic mark`, run: async () => createMark("NOTE", provider, false, targetEditor, target) },
      { label: "Source", detail: `Use "${target.title}" as title`, run: async () => createMark("SOURCE", provider, false, targetEditor, target) },
      { label: "Sink", detail: `Use "${target.title}" as title`, run: async () => createMark("SINK", provider, false, targetEditor, target) },
      { label: "Guard", detail: `Use "${target.title}" as title`, run: async () => createMark("GUARD", provider, false, targetEditor, target) },
      { label: "Transform", detail: `Use "${target.title}" as title`, run: async () => createMark("TRANSFORM", provider, false, targetEditor, target) },
    );
  }

  items.push(
    { label: "Create Case", detail: "Create an investigation shell from current context", run: async () => createCaseFromContext(provider, targetEditor, target) },
    { label: "Create Check", detail: "Create a code-adjacent review task", run: async () => createCheckFromSelection(provider, targetEditor, target) },
  );

  if (mark) {
    items.push({
      label: mark.is_dead_end ? "Remove dead-end mark" : "Mark as dead end",
      detail: "Toggle dead-end flow indicator",
      run: async () => toggleCurrentMarkDeadEnd(provider, target),
    });
    items.push({
      label: "Remove Mark",
      detail: "Delete the current mark and its direct relations",
      run: async () => removeCurrentMark(provider, target),
    });
  }

  if (check) {
    items.push(
      { label: "Set Check OK", detail: "Mark current check as checked and safe", run: async () => setCheckStatus(provider, "CHECKED_OK") },
      { label: "Set Check Weak", detail: "Mark current check as weakly validated", run: async () => setCheckStatus(provider, "CHECKED_WEAK") },
      { label: "Set Check Failed", detail: "Mark current check as failed", run: async () => setCheckStatus(provider, "FAILED") },
    );
    if (check.status === "FAILED" || check.status === "CHECKED_WEAK") {
      items.push({
        label: "Convert to Finding",
        detail: "Create a finding from the current failed/weak check",
        run: async () => convertFailedCheckToFinding(provider),
      });
    }
  }

  items.push({
    label: "Custom title…",
    detail: "Override the generated mark title",
    run: async () => {
      const customKind = await vscode.window.showQuickPick(
        enabledMarkKindsSorted().map((entry) => ({ label: entry.display_label, markKind: entry.kind_key })),
        { placeHolder: "Choose AppSec action", ignoreFocusOut: true },
      );
      if (!customKind?.markKind) {
        return;
      }
      await createMark(customKind.markKind as string, provider, true, targetEditor, target);
    },
  });

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: `AppSec actions for: ${target.title}`,
    ignoreFocusOut: true,
    matchOnDetail: true,
  });

  if (picked?.run) {
    await picked.run();
  }
}

export async function maybeShowSelectionPopup(provider: SelectionActionCodeLensProvider, editor?: vscode.TextEditor) {
  void provider;
  void editor;
}

export function registerMarkCommands(
  context: vscode.ExtensionContext,
  codeLensProvider: SelectionActionCodeLensProvider,
  recentMarksPanel: RecentMarksPanel,
) {
  const markCommand = (command: string, kind: string) => {
    context.subscriptions.push(vscode.commands.registerCommand(command, async (...args: unknown[]) => {
      const target = selectionTargetFromCommandArgs(args);
      await createMark(kind, codeLensProvider, false, undefined, target);
      recentMarksPanel.refresh();
    }));
  };

  markCommand("appsecWorkbench.markSource", "SOURCE");
  markCommand("appsecWorkbench.markSink", "SINK");
  markCommand("appsecWorkbench.markGuard", "GUARD");
  markCommand("appsecWorkbench.markTransform", "TRANSFORM");
  markCommand("appsecWorkbench.markNote", "NOTE");
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.markAny", async (...args: unknown[]) => {
    const target = selectionTargetFromCommandArgs(args);
    await createMark("NOTE", codeLensProvider, false, undefined, target);
    recentMarksPanel.refresh();
  }));

  context.subscriptions.push(
    vscode.commands.registerCommand("appsecWorkbench.markWithKind", async (kind?: string, target?: SelectionTarget) => {
      if (!kind || typeof kind !== "string") {
        vscode.window.showWarningMessage("AppSec: missing mark kind");
        return;
      }
      const resolvedTarget = target ?? selectionTargetFromCommandArgs([]);
      if (!resolvedTarget) {
        vscode.window.showWarningMessage("AppSec: missing selection target");
        return;
      }
      await createMark(kind.trim().toUpperCase(), codeLensProvider, false, undefined, resolvedTarget);
      recentMarksPanel.refresh();
    }),
  );

  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.acceptCandidate", async (candidate?: ReviewEntity) => {
    if (!candidate) {
      return;
    }
    await acceptCandidate(candidate, codeLensProvider);
    recentMarksPanel.refresh();
  }));
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.rejectCandidate", async (candidate?: ReviewEntity) => {
    if (!candidate) {
      return;
    }
    await rejectCandidate(candidate, codeLensProvider);
  }));
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.createCheckFromSelection", async (...args: unknown[]) => createCheckFromSelection(codeLensProvider, undefined, selectionTargetFromCommandArgs(args))));
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.attachEvidenceFromSelection", async (...args: unknown[]) => attachEvidenceFromSelection(codeLensProvider, undefined, selectionTargetFromCommandArgs(args))));
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.createCaseFromContext", async (...args: unknown[]) => createCaseFromContext(codeLensProvider, undefined, selectionTargetFromCommandArgs(args))));
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.removeCurrentMark", async (...args: unknown[]) => removeCurrentMark(codeLensProvider, selectionTargetFromCommandArgs(args))));
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.toggleMarkDeadEnd", async (...args: unknown[]) => toggleCurrentMarkDeadEnd(codeLensProvider, selectionTargetFromCommandArgs(args))));
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.setMarkDescriptionFromSelection", async (...args: unknown[]) => setMarkDescriptionFromSelection(codeLensProvider, selectionTargetFromCommandArgs(args))));
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.setMarkRelationDisplayName", async (...args: unknown[]) => setMarkRelationDisplayName(codeLensProvider, selectionTargetFromCommandArgs(args))));
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.addCurrentMarkToActiveCase", async () => addCurrentMarkToActiveCase(codeLensProvider)));
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.addCurrentCheckToActiveCase", async () => addCurrentCheckToActiveCase(codeLensProvider)));
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.addRecentMarkToActiveCase", async (recentId: string) => addRecentMarkToActiveCase(codeLensProvider, recentId)));
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.setCheckStatus", async (status: CheckStatus) => setCheckStatus(codeLensProvider, status)));
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.convertCheckToFinding", async () => convertFailedCheckToFinding(codeLensProvider)));
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.showRecentMarkActions", async (...args: unknown[]) => showRecentMarkActions(codeLensProvider, selectionTargetFromCommandArgs(args))));
  context.subscriptions.push(vscode.commands.registerCommand(
    "appsecWorkbench.applyRecentMarkAction",
    async (action: "case" | "add_to_case", recentId: string, target?: SelectionTarget) => applyRecentMarkAction(codeLensProvider, action, recentId, target)),
  );
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.dismissFollowUp", async () => {
    codeLensProvider.clearFollowUp();
    codeLensProvider.refresh();
  }));
  context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.showSelectionActions", async (...args: unknown[]) => showSelectionActions(codeLensProvider, undefined, selectionTargetFromCommandArgs(args))));
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      [
        { scheme: "file" },
        { scheme: "vscode-remote" },
        { scheme: "untitled" },
      ],
      codeLensProvider,
    ),
  );
}

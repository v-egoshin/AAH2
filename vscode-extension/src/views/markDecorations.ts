import * as vscode from "vscode";

import { ReviewContextResponse, ReviewEntity } from "../api/client";
import {
  getMarkKindCatalogSnapshot,
  glyphForStructuredKind,
  hexToRgbWithAlpha,
  type MarkKindCatalogRow,
} from "../state/markKindCatalog";
import { relativeFilePathFromUri } from "../lib/assetPath";
import {
  buildGutterHoverHighlightGroup,
  buildLineDecorationGroups,
  collectLineGutterContext,
  type GutterSpan,
  type LineGutterContext,
} from "./markGutterRails";

export type HoverLocator = {
  file: string;
  startLine: number;
  endLine: number;
};

export type HoverLocatorSync = (locator: HoverLocator | null) => void;

type DecorationBundle = {
  kind: string;
  decoration: vscode.TextEditorDecorationType;
};

const CHECK_COLOR = "#2563eb";
const HOVER_HIGHLIGHT_ALPHA = 0.16;

function normalizeHighlightColor(hex: string): string {
  const raw = hex.trim();
  const withHash = /^#/.test(raw) ? raw : `#${raw}`;
  return /^#[0-9A-Fa-f]{6}$/.test(withHash) ? withHash.toUpperCase() : "#475569";
}

function makeOverviewDecoration(kind: string, overviewColor: string): DecorationBundle {
  return {
    kind: kind.toUpperCase(),
    decoration: vscode.window.createTextEditorDecorationType({
      overviewRulerColor: overviewColor,
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    }),
  };
}

function collectObjectRanges(payload: ReviewContextResponse | null) {
  const byId = new Map<string, ReviewEntity>();
  for (const entity of [...(payload?.objects ?? []), ...(payload?.nearby_objects ?? [])]) {
    if (entity.id) {
      byId.set(entity.id, entity);
    }
  }
  return byId;
}

function collectEntities(entities: ReviewEntity[] | undefined) {
  const byId = new Map<string, ReviewEntity>();
  for (const entity of entities ?? []) {
    if (entity.id) {
      byId.set(entity.id, entity);
    }
  }
  return byId;
}

function rangeFromLines(startLine?: number, endLine?: number) {
  if (typeof startLine !== "number") {
    return null;
  }
  const start = Math.max(0, startLine - 1);
  const end = Math.max(start, (typeof endLine === "number" ? endLine : startLine) - 1);
  return new vscode.Range(start, 0, end, 0);
}

function rangeFromLocator(locator?: string | null) {
  if (!locator) {
    return null;
  }
  const match = locator.match(/:(\d+)(?::(\d+))?$/);
  if (!match) {
    return null;
  }
  return rangeFromLines(Number(match[1]), match[2] ? Number(match[2]) : Number(match[1]));
}

function rangeForMark(mark: ReviewEntity, objectsById: Map<string, ReviewEntity>) {
  const object = mark.object_id ? objectsById.get(mark.object_id) : undefined;
  const range = object?.range ?? mark.range;
  if (range?.file && typeof range.start_line === "number") {
    return rangeFromLines(range.start_line, range.end_line ?? range.start_line);
  }
  return rangeFromLocator(object?.locator ?? mark.locator);
}

function rangeForEvidence(evidence: ReviewEntity) {
  const properties = evidence.properties ?? {};
  const file = typeof properties.file === "string" ? properties.file : undefined;
  const startLine = typeof properties.start_line === "number" ? properties.start_line : undefined;
  if (file && startLine) {
    return rangeFromLines(startLine, typeof properties.end_line === "number" ? properties.end_line : startLine);
  }
  return rangeFromLocator(
    typeof properties.locator === "string"
      ? properties.locator
      : evidence.locator,
  );
}

function linkedCaseTitles(entityId: string, entityType: string, relations: ReviewEntity[], cases: ReviewEntity[]) {
  const relatedCaseIds = new Set<string>();
  const relatedCases: string[] = [];
  for (const relation of relations) {
    if (relation.predicate !== "PART_OF") {
      continue;
    }
    if (relation.subject_type === entityType && relation.subject_id === entityId && relation.object_type === "CASE" && relation.object_id) {
      relatedCaseIds.add(relation.object_id);
    }
    if (relation.object_type === entityType && relation.object_id === entityId && relation.subject_type === "CASE" && relation.subject_id) {
      relatedCaseIds.add(relation.subject_id);
    }
  }
  for (const caseId of relatedCaseIds) {
    const reviewCase = cases.find((item) => item.id === caseId);
    relatedCases.push(reviewCase?.title || reviewCase?.name || caseId);
  }
  return relatedCases;
}

function rangeForCheck(
  check: ReviewEntity,
  objectsById: Map<string, ReviewEntity>,
  marksById: Map<string, ReviewEntity>,
  evidenceById: Map<string, ReviewEntity>,
  relations: ReviewEntity[],
) {
  if (check.range?.file && typeof check.range.start_line === "number") {
    return rangeFromLines(check.range.start_line, check.range.end_line ?? check.range.start_line);
  }

  const directRange = rangeFromLocator(check.locator);
  if (directRange) {
    return directRange;
  }

  for (const relation of relations) {
    if (relation.predicate === "CHECKS") {
      let markId: string | undefined;
      if (relation.subject_type === "CHECK" && relation.subject_id === check.id && relation.object_type === "MARK") {
        markId = relation.object_id;
      }
      if (relation.object_type === "CHECK" && relation.object_id === check.id && relation.subject_type === "MARK") {
        markId = relation.subject_id;
      }
      if (markId) {
        const linkedMark = marksById.get(markId);
        if (linkedMark) {
          const linkedRange = rangeForMark(linkedMark, objectsById);
          if (linkedRange) {
            return linkedRange;
          }
        }
      }
    }
    if (relation.predicate === "SUPPORTS") {
      let evidenceId: string | undefined;
      if (relation.subject_type === "EVIDENCE" && relation.subject_id && relation.object_type === "CHECK" && relation.object_id === check.id) {
        evidenceId = relation.subject_id;
      }
      if (relation.object_type === "EVIDENCE" && relation.object_id && relation.subject_type === "CHECK" && relation.subject_id === check.id) {
        evidenceId = relation.object_id;
      }
      if (evidenceId) {
        const evidence = evidenceById.get(evidenceId);
        if (evidence) {
          const linkedRange = rangeForEvidence(evidence);
          if (linkedRange) {
            return linkedRange;
          }
        }
      }
    }
  }

  return null;
}

function markHover(
  mark: ReviewEntity,
  objectsById: Map<string, ReviewEntity>,
  relations: ReviewEntity[],
  cases: ReviewEntity[],
) {
  const object = mark.object_id ? objectsById.get(mark.object_id) : undefined;
  const label = mark.title || object?.name || mark.kind || "Mark";
  const added = mark.created_at ? new Date(mark.created_at).toLocaleString() : "unknown time";
  const relatedCases = linkedCaseTitles(mark.id, "MARK", relations, cases);
  const lines = [
    `**${mark.kind ?? "MARK"}**`,
    label,
    `Added: ${added}`,
  ];
  if (object?.locator || mark.locator) {
    lines.push(`Locator: ${object?.locator ?? mark.locator}`);
  }
  if (mark.note) {
    lines.push(`Note: ${mark.note}`);
  }
  if (relatedCases.length) {
    lines.push(`Cases: ${relatedCases.join(", ")}`);
  }
  const hover = new vscode.MarkdownString(lines.join("\n\n"));
  hover.isTrusted = true;
  return hover;
}

function checkHover(check: ReviewEntity, relations: ReviewEntity[], cases: ReviewEntity[]) {
  const lines = [
    `**CHECK**`,
    check.title || "Untitled check",
    `Status: ${check.status ?? "UNKNOWN"}`,
  ];
  if (check.description) {
    lines.push(`Description: ${check.description}`);
  }
  const relatedCases = linkedCaseTitles(check.id, "CHECK", relations, cases);
  if (relatedCases.length) {
    lines.push(`Cases: ${relatedCases.join(", ")}`);
  }
  const hover = new vscode.MarkdownString(lines.join("\n\n"));
  hover.isTrusted = true;
  return hover;
}

export class MarkDecorations {
  private bundles: DecorationBundle[] = [];
  private readonly dynamicGutterDecorations = new Map<string, vscode.TextEditorDecorationType>();
  private readonly dynamicGutterHoverDecorations = new Map<string, vscode.TextEditorDecorationType>();
  private readonly dynamicHighlightDecorations = new Map<string, vscode.TextEditorDecorationType>();
  private readonly gutterSvgCache = new Map<string, vscode.Uri>();
  private readonly catalogByKind = new Map<string, MarkKindCatalogRow>();
  private currentSpans: GutterSpan[] = [];
  private gutterContext: LineGutterContext = { lineEntries: new Map() };
  private currentEditor: vscode.TextEditor | undefined;
  private hoveredLine: number | null = null;
  private hoverLocatorSync: HoverLocatorSync | null = null;
  private lastEmittedLocatorKey: string | null = null;

  constructor(_context: vscode.ExtensionContext) {
    this.rebuildFromCatalog(getMarkKindCatalogSnapshot());
  }

  setHoverLocatorSync(sync: HoverLocatorSync | null) {
    this.hoverLocatorSync = sync;
  }

  private emitHoverLocator(locator: HoverLocator | null) {
    const key = locator ? `${locator.file}:${locator.startLine}:${locator.endLine}` : null;
    if (key === this.lastEmittedLocatorKey) {
      return;
    }
    this.lastEmittedLocatorKey = key;
    this.hoverLocatorSync?.(locator);
  }

  private locatorForLine(line: number): HoverLocator | null {
    if (!this.currentEditor) {
      return null;
    }
    const matching = this.currentSpans.filter(
      (span) => line >= span.range.start.line && line <= span.range.end.line,
    );
    if (!matching.length) {
      return null;
    }
    let best = matching[0];
    for (const span of matching) {
      const bestLen = best.range.end.line - best.range.start.line;
      const spanLen = span.range.end.line - span.range.start.line;
      if (spanLen < bestLen) {
        best = span;
      }
    }
    return {
      file: relativeFilePathFromUri(this.currentEditor.document.uri),
      startLine: best.range.start.line + 1,
      endLine: best.range.end.line + 1,
    };
  }

  rebuildFromCatalog(rows: readonly MarkKindCatalogRow[]) {
    this.disposeDecorationsOnly();
    this.catalogByKind.clear();
    const ordered = [...rows].sort((a, b) => a.sort_order - b.sort_order || a.kind_key.localeCompare(b.kind_key));
    for (const row of ordered) {
      this.catalogByKind.set(row.kind_key.toUpperCase(), row);
    }
    this.bundles = [
      ...ordered.map((row) => makeOverviewDecoration(row.kind_key, hexToRgbWithAlpha(row.color, 0.82))),
      makeOverviewDecoration("CHECK", hexToRgbWithAlpha(CHECK_COLOR, 0.82)),
    ];
  }

  private resolveGutterSvgUri(cacheKey: string, svg: string): vscode.Uri {
    const cached = this.gutterSvgCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const uri = vscode.Uri.parse(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
    this.gutterSvgCache.set(cacheKey, uri);
    return uri;
  }

  private getGutterDecoration(cacheKey: string, svg: string): vscode.TextEditorDecorationType {
    const existing = this.dynamicGutterDecorations.get(cacheKey);
    if (existing) {
      return existing;
    }
    const decoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.resolveGutterSvgUri(cacheKey, svg),
      gutterIconSize: "contain",
    });
    this.dynamicGutterDecorations.set(cacheKey, decoration);
    return decoration;
  }

  private syncDynamicGutterDecorations(activeKeys: ReadonlySet<string>) {
    for (const [cacheKey, decoration] of this.dynamicGutterDecorations) {
      if (!activeKeys.has(cacheKey)) {
        decoration.dispose();
        this.dynamicGutterDecorations.delete(cacheKey);
        this.gutterSvgCache.delete(cacheKey);
      }
    }
  }

  private getGutterHoverDecoration(cacheKey: string, svg: string): vscode.TextEditorDecorationType {
    const existing = this.dynamicGutterHoverDecorations.get(cacheKey);
    if (existing) {
      return existing;
    }
    const decoration = vscode.window.createTextEditorDecorationType({
      gutterIconPath: this.resolveGutterSvgUri(`hover:${cacheKey}`, svg),
      gutterIconSize: "contain",
    });
    this.dynamicGutterHoverDecorations.set(cacheKey, decoration);
    return decoration;
  }

  private syncDynamicGutterHoverDecorations(activeKeys: ReadonlySet<string>) {
    for (const [cacheKey, decoration] of this.dynamicGutterHoverDecorations) {
      if (!activeKeys.has(cacheKey)) {
        decoration.dispose();
        this.dynamicGutterHoverDecorations.delete(cacheKey);
        this.gutterSvgCache.delete(`hover:${cacheKey}`);
      }
    }
  }

  private clearGutterHoverDecorations() {
    if (!this.currentEditor) {
      return;
    }
    for (const decoration of this.dynamicGutterHoverDecorations.values()) {
      this.currentEditor.setDecorations(decoration, []);
    }
  }

  private getHighlightDecoration(color: string): vscode.TextEditorDecorationType {
    const key = normalizeHighlightColor(color);
    const existing = this.dynamicHighlightDecorations.get(key);
    if (existing) {
      return existing;
    }
    const decoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: hexToRgbWithAlpha(key, HOVER_HIGHLIGHT_ALPHA),
    });
    this.dynamicHighlightDecorations.set(key, decoration);
    return decoration;
  }

  private clearBlockHighlightDecorations() {
    if (!this.currentEditor) {
      return;
    }
    for (const decoration of this.dynamicHighlightDecorations.values()) {
      this.currentEditor.setDecorations(decoration, []);
    }
  }

  private applyBlockHoverHighlight(line: number) {
    if (!this.currentEditor) {
      return;
    }
    const matching = this.currentSpans.filter(
      (span) => line >= span.range.start.line && line <= span.range.end.line,
    );
    this.clearBlockHighlightDecorations();
    if (!matching.length) {
      return;
    }

    const byColor = new Map<string, vscode.DecorationOptions[]>();
    for (const span of matching) {
      const key = normalizeHighlightColor(span.color);
      const options = byColor.get(key) ?? [];
      options.push({ range: span.range });
      byColor.set(key, options);
    }

    for (const [color, options] of byColor) {
      const decoration = this.getHighlightDecoration(color);
      this.currentEditor.setDecorations(decoration, options);
    }
  }

  private applyGutterHoverHighlight(line: number) {
    if (!this.currentEditor) {
      return;
    }
    this.clearGutterHoverDecorations();
    const entries = this.gutterContext.lineEntries.get(line);
    const group = entries
      ? buildGutterHoverHighlightGroup(line, entries)
      : null;
    const activeKeys = new Set(group ? [group.cacheKey] : []);
    this.syncDynamicGutterHoverDecorations(activeKeys);
    if (!group) {
      return;
    }
    const decoration = this.getGutterHoverDecoration(group.cacheKey, group.svg);
    this.currentEditor.setDecorations(decoration, group.options);
  }

  private applyHoverHighlight(line: number) {
    this.applyGutterHoverHighlight(line);
    this.applyBlockHoverHighlight(line);
  }

  clearHoverHighlight() {
    this.hoveredLine = null;
    this.clearGutterHoverDecorations();
    this.clearBlockHighlightDecorations();
    this.emitHoverLocator(null);
  }

  setHoveredLine(line: number | null) {
    if (line === null || !this.currentEditor) {
      this.clearHoverHighlight();
      return;
    }

    if (!this.gutterContext.lineEntries.has(line)) {
      this.clearHoverHighlight();
      return;
    }

    if (this.hoveredLine !== line) {
      this.hoveredLine = line;
      this.applyHoverHighlight(line);
    }
    this.emitHoverLocator(this.locatorForLine(line));
  }

  disposeDecorationsOnly() {
    for (const bundle of this.bundles) {
      bundle.decoration.dispose();
    }
    this.bundles = [];
    for (const decoration of this.dynamicGutterDecorations.values()) {
      decoration.dispose();
    }
    this.dynamicGutterDecorations.clear();
    for (const decoration of this.dynamicGutterHoverDecorations.values()) {
      decoration.dispose();
    }
    this.dynamicGutterHoverDecorations.clear();
    for (const decoration of this.dynamicHighlightDecorations.values()) {
      decoration.dispose();
    }
    this.dynamicHighlightDecorations.clear();
    this.gutterSvgCache.clear();
    this.currentSpans = [];
    this.gutterContext = { lineEntries: new Map() };
    this.currentEditor = undefined;
    this.hoveredLine = null;
  }

  dispose() {
    this.disposeDecorationsOnly();
  }

  apply(editor: vscode.TextEditor | undefined, payload: ReviewContextResponse | null) {
    if (!editor) {
      return;
    }

    this.clearHoverHighlight();
    this.currentEditor = editor;
    const objectsById = collectObjectRanges(payload);
    const marksById = collectEntities([...(payload?.marks ?? []), ...(payload?.nearby_marks ?? [])]);
    const evidenceById = collectEntities(payload?.evidence ?? []);
    const relevantMarks =
      (payload?.nearby_marks?.length ? payload.nearby_marks : null)
      ?? payload?.marks
      ?? [];
    const relevantChecks = payload?.checks ?? [];
    const relations = payload?.relations ?? [];
    const cases = payload?.cases ?? [];

    const spans: GutterSpan[] = [];
    for (const mark of relevantMarks) {
      if (!mark.id) {
        continue;
      }
      const range = rangeForMark(mark, objectsById);
      if (!range) {
        continue;
      }
      const kind = (mark.kind ?? "NOTE").toUpperCase();
      const catalogRow = this.catalogByKind.get(kind);
      spans.push({
        entityId: mark.id,
        kind,
        color: catalogRow?.color ?? "#475569",
        glyph: glyphForStructuredKind(kind),
        range,
        hoverMessage: markHover(mark, objectsById, relations, cases),
      });
    }

    for (const check of relevantChecks) {
      if (!check.id) {
        continue;
      }
      const range = rangeForCheck(check, objectsById, marksById, evidenceById, relations);
      if (!range) {
        continue;
      }
      spans.push({
        entityId: check.id,
        kind: "CHECK",
        color: CHECK_COLOR,
        glyph: glyphForStructuredKind("CHECK"),
        range,
        hoverMessage: checkHover(check, relations, cases),
      });
    }

    this.gutterContext = collectLineGutterContext(spans);
    const gutterGroups = buildLineDecorationGroups(spans);
    const activeGutterKeys = new Set(gutterGroups.map((group) => group.cacheKey));
    this.syncDynamicGutterDecorations(activeGutterKeys);
    for (const group of gutterGroups) {
      const decoration = this.getGutterDecoration(group.cacheKey, group.svg);
      editor.setDecorations(decoration, group.options);
    }
    for (const [cacheKey, decoration] of this.dynamicGutterDecorations) {
      if (!activeGutterKeys.has(cacheKey)) {
        editor.setDecorations(decoration, []);
      }
    }

    if (!gutterGroups.length) {
      for (const decoration of this.dynamicGutterDecorations.values()) {
        editor.setDecorations(decoration, []);
      }
    }

    for (const bundle of this.bundles) {
      const overviewOptions = spans
        .filter((span) => span.kind === bundle.kind)
        .map((span) => ({
          range: span.range,
        }));
      editor.setDecorations(bundle.decoration, overviewOptions);
    }

    this.currentSpans = spans;
    if (this.hoveredLine !== null) {
      this.applyHoverHighlight(this.hoveredLine);
    }
  }

  getHoverForLine(line: number): vscode.Hover | null {
    const matching = this.currentSpans.filter(
      (span) => line >= span.range.start.line && line <= span.range.end.line,
    );
    if (!matching.length) {
      return null;
    }
    return new vscode.Hover(matching.map((span) => span.hoverMessage));
  }
}

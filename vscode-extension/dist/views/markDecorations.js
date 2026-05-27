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
exports.MarkDecorations = void 0;
const vscode = __importStar(require("vscode"));
const markKindCatalog_1 = require("../state/markKindCatalog");
const assetPath_1 = require("../lib/assetPath");
const markGutterRails_1 = require("./markGutterRails");
const CHECK_COLOR = "#2563eb";
const HOVER_HIGHLIGHT_ALPHA = 0.16;
function normalizeHighlightColor(hex) {
    const raw = hex.trim();
    const withHash = /^#/.test(raw) ? raw : `#${raw}`;
    return /^#[0-9A-Fa-f]{6}$/.test(withHash) ? withHash.toUpperCase() : "#475569";
}
function makeOverviewDecoration(kind, overviewColor) {
    return {
        kind: kind.toUpperCase(),
        decoration: vscode.window.createTextEditorDecorationType({
            overviewRulerColor: overviewColor,
            overviewRulerLane: vscode.OverviewRulerLane.Left,
        }),
    };
}
function collectObjectRanges(payload) {
    const byId = new Map();
    for (const entity of [...(payload?.objects ?? []), ...(payload?.nearby_objects ?? [])]) {
        if (entity.id) {
            byId.set(entity.id, entity);
        }
    }
    return byId;
}
function collectEntities(entities) {
    const byId = new Map();
    for (const entity of entities ?? []) {
        if (entity.id) {
            byId.set(entity.id, entity);
        }
    }
    return byId;
}
function rangeFromLines(startLine, endLine) {
    if (typeof startLine !== "number") {
        return null;
    }
    const start = Math.max(0, startLine - 1);
    const end = Math.max(start, (typeof endLine === "number" ? endLine : startLine) - 1);
    return new vscode.Range(start, 0, end, 0);
}
function rangeFromLocator(locator) {
    if (!locator) {
        return null;
    }
    const match = locator.match(/:(\d+)(?::(\d+))?$/);
    if (!match) {
        return null;
    }
    return rangeFromLines(Number(match[1]), match[2] ? Number(match[2]) : Number(match[1]));
}
function rangeForMark(mark, objectsById) {
    const object = mark.object_id ? objectsById.get(mark.object_id) : undefined;
    const range = object?.range ?? mark.range;
    if (range?.file && typeof range.start_line === "number") {
        return rangeFromLines(range.start_line, range.end_line ?? range.start_line);
    }
    return rangeFromLocator(object?.locator ?? mark.locator);
}
function rangeForEvidence(evidence) {
    const properties = evidence.properties ?? {};
    const file = typeof properties.file === "string" ? properties.file : undefined;
    const startLine = typeof properties.start_line === "number" ? properties.start_line : undefined;
    if (file && startLine) {
        return rangeFromLines(startLine, typeof properties.end_line === "number" ? properties.end_line : startLine);
    }
    return rangeFromLocator(typeof properties.locator === "string"
        ? properties.locator
        : evidence.locator);
}
function linkedCaseTitles(entityId, entityType, relations, cases) {
    const relatedCaseIds = new Set();
    const relatedCases = [];
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
function rangeForCheck(check, objectsById, marksById, evidenceById, relations) {
    if (check.range?.file && typeof check.range.start_line === "number") {
        return rangeFromLines(check.range.start_line, check.range.end_line ?? check.range.start_line);
    }
    const directRange = rangeFromLocator(check.locator);
    if (directRange) {
        return directRange;
    }
    for (const relation of relations) {
        if (relation.predicate === "CHECKS") {
            let markId;
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
            let evidenceId;
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
function markHover(mark, objectsById, relations, cases) {
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
function checkHover(check, relations, cases) {
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
class MarkDecorations {
    constructor(_context) {
        this.bundles = [];
        this.dynamicGutterDecorations = new Map();
        this.dynamicGutterHoverDecorations = new Map();
        this.dynamicHighlightDecorations = new Map();
        this.gutterSvgCache = new Map();
        this.catalogByKind = new Map();
        this.currentSpans = [];
        this.gutterContext = { lineEntries: new Map() };
        this.hoveredLine = null;
        this.hoverLocatorSync = null;
        this.lastEmittedLocatorKey = null;
        this.rebuildFromCatalog((0, markKindCatalog_1.getMarkKindCatalogSnapshot)());
    }
    setHoverLocatorSync(sync) {
        this.hoverLocatorSync = sync;
    }
    emitHoverLocator(locator) {
        const key = locator ? `${locator.file}:${locator.startLine}:${locator.endLine}` : null;
        if (key === this.lastEmittedLocatorKey) {
            return;
        }
        this.lastEmittedLocatorKey = key;
        this.hoverLocatorSync?.(locator);
    }
    locatorForLine(line) {
        if (!this.currentEditor) {
            return null;
        }
        const matching = this.currentSpans.filter((span) => line >= span.range.start.line && line <= span.range.end.line);
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
            file: (0, assetPath_1.relativeFilePathFromUri)(this.currentEditor.document.uri),
            startLine: best.range.start.line + 1,
            endLine: best.range.end.line + 1,
        };
    }
    rebuildFromCatalog(rows) {
        this.disposeDecorationsOnly();
        this.catalogByKind.clear();
        const ordered = [...rows].sort((a, b) => a.sort_order - b.sort_order || a.kind_key.localeCompare(b.kind_key));
        for (const row of ordered) {
            this.catalogByKind.set(row.kind_key.toUpperCase(), row);
        }
        this.bundles = [
            ...ordered.map((row) => makeOverviewDecoration(row.kind_key, (0, markKindCatalog_1.hexToRgbWithAlpha)(row.color, 0.82))),
            makeOverviewDecoration("CHECK", (0, markKindCatalog_1.hexToRgbWithAlpha)(CHECK_COLOR, 0.82)),
        ];
    }
    resolveGutterSvgUri(cacheKey, svg) {
        const cached = this.gutterSvgCache.get(cacheKey);
        if (cached) {
            return cached;
        }
        const uri = vscode.Uri.parse(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
        this.gutterSvgCache.set(cacheKey, uri);
        return uri;
    }
    getGutterDecoration(cacheKey, svg) {
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
    syncDynamicGutterDecorations(activeKeys) {
        for (const [cacheKey, decoration] of this.dynamicGutterDecorations) {
            if (!activeKeys.has(cacheKey)) {
                decoration.dispose();
                this.dynamicGutterDecorations.delete(cacheKey);
                this.gutterSvgCache.delete(cacheKey);
            }
        }
    }
    getGutterHoverDecoration(cacheKey, svg) {
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
    syncDynamicGutterHoverDecorations(activeKeys) {
        for (const [cacheKey, decoration] of this.dynamicGutterHoverDecorations) {
            if (!activeKeys.has(cacheKey)) {
                decoration.dispose();
                this.dynamicGutterHoverDecorations.delete(cacheKey);
                this.gutterSvgCache.delete(`hover:${cacheKey}`);
            }
        }
    }
    clearGutterHoverDecorations() {
        if (!this.currentEditor) {
            return;
        }
        for (const decoration of this.dynamicGutterHoverDecorations.values()) {
            this.currentEditor.setDecorations(decoration, []);
        }
    }
    getHighlightDecoration(color) {
        const key = normalizeHighlightColor(color);
        const existing = this.dynamicHighlightDecorations.get(key);
        if (existing) {
            return existing;
        }
        const decoration = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: (0, markKindCatalog_1.hexToRgbWithAlpha)(key, HOVER_HIGHLIGHT_ALPHA),
        });
        this.dynamicHighlightDecorations.set(key, decoration);
        return decoration;
    }
    clearBlockHighlightDecorations() {
        if (!this.currentEditor) {
            return;
        }
        for (const decoration of this.dynamicHighlightDecorations.values()) {
            this.currentEditor.setDecorations(decoration, []);
        }
    }
    applyBlockHoverHighlight(line) {
        if (!this.currentEditor) {
            return;
        }
        const matching = this.currentSpans.filter((span) => line >= span.range.start.line && line <= span.range.end.line);
        this.clearBlockHighlightDecorations();
        if (!matching.length) {
            return;
        }
        const byColor = new Map();
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
    applyGutterHoverHighlight(line) {
        if (!this.currentEditor) {
            return;
        }
        this.clearGutterHoverDecorations();
        const entries = this.gutterContext.lineEntries.get(line);
        const group = entries
            ? (0, markGutterRails_1.buildGutterHoverHighlightGroup)(line, entries)
            : null;
        const activeKeys = new Set(group ? [group.cacheKey] : []);
        this.syncDynamicGutterHoverDecorations(activeKeys);
        if (!group) {
            return;
        }
        const decoration = this.getGutterHoverDecoration(group.cacheKey, group.svg);
        this.currentEditor.setDecorations(decoration, group.options);
    }
    applyHoverHighlight(line) {
        this.applyGutterHoverHighlight(line);
        this.applyBlockHoverHighlight(line);
    }
    clearHoverHighlight() {
        this.hoveredLine = null;
        this.clearGutterHoverDecorations();
        this.clearBlockHighlightDecorations();
        this.emitHoverLocator(null);
    }
    setHoveredLine(line) {
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
    apply(editor, payload) {
        if (!editor) {
            return;
        }
        this.clearHoverHighlight();
        this.currentEditor = editor;
        const objectsById = collectObjectRanges(payload);
        const marksById = collectEntities([...(payload?.marks ?? []), ...(payload?.nearby_marks ?? [])]);
        const evidenceById = collectEntities(payload?.evidence ?? []);
        const relevantMarks = (payload?.nearby_marks?.length ? payload.nearby_marks : null)
            ?? payload?.marks
            ?? [];
        const relevantChecks = payload?.checks ?? [];
        const relations = payload?.relations ?? [];
        const cases = payload?.cases ?? [];
        const spans = [];
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
                glyph: (0, markKindCatalog_1.glyphForStructuredKind)(kind),
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
                glyph: (0, markKindCatalog_1.glyphForStructuredKind)("CHECK"),
                range,
                hoverMessage: checkHover(check, relations, cases),
            });
        }
        this.gutterContext = (0, markGutterRails_1.collectLineGutterContext)(spans);
        const gutterGroups = (0, markGutterRails_1.buildLineDecorationGroups)(spans);
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
    getHoverForLine(line) {
        const matching = this.currentSpans.filter((span) => line >= span.range.start.line && line <= span.range.end.line);
        if (!matching.length) {
            return null;
        }
        return new vscode.Hover(matching.map((span) => span.hoverMessage));
    }
}
exports.MarkDecorations = MarkDecorations;

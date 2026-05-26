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
function iconPath(context, name) {
    return vscode.Uri.joinPath(context.extensionUri, "media", name);
}
function makeDecoration(kind, gutterIconPath, overviewColor) {
    const kindNormalized = kind.toUpperCase();
    return {
        kind: kindNormalized,
        decoration: vscode.window.createTextEditorDecorationType({
            isWholeLine: false,
            gutterIconPath,
            gutterIconSize: "contain",
            overviewRulerColor: overviewColor,
            overviewRulerLane: vscode.OverviewRulerLane.Left,
        }),
    };
}
function makeDecorationDynamic(context, row) {
    const structural = (0, markKindCatalog_1.gutterIconFileForStructuredKind)(row.kind_key);
    const gutterIconPath = structural != null
        ? iconPath(context, structural)
        : vscode.Uri.parse((0, markKindCatalog_1.gutterColoredDotSvgDataUri)(row.color));
    return makeDecoration(row.kind_key, gutterIconPath, (0, markKindCatalog_1.hexToRgbWithAlpha)(row.color, 0.82));
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
    return new vscode.MarkdownString(lines.join("\n\n"));
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
    return new vscode.MarkdownString(lines.join("\n\n"));
}
class MarkDecorations {
    constructor(context) {
        this.bundles = [];
        this.extensionContext = context;
        this.rebuildFromCatalog((0, markKindCatalog_1.getMarkKindCatalogSnapshot)());
    }
    rebuildFromCatalog(rows) {
        this.disposeDecorationsOnly();
        const ordered = [...rows].sort((a, b) => a.sort_order - b.sort_order || a.kind_key.localeCompare(b.kind_key));
        this.bundles = [
            ...ordered.map((row) => makeDecorationDynamic(this.extensionContext, row)),
            makeDecoration("CHECK", iconPath(this.extensionContext, "check.svg"), "rgba(37,99,235,0.82)"),
        ];
    }
    disposeDecorationsOnly() {
        for (const bundle of this.bundles) {
            bundle.decoration.dispose();
        }
        this.bundles = [];
    }
    dispose() {
        this.disposeDecorationsOnly();
    }
    apply(editor, payload) {
        if (!editor) {
            return;
        }
        const objectsById = collectObjectRanges(payload);
        const marksById = collectEntities([...(payload?.marks ?? []), ...(payload?.nearby_marks ?? [])]);
        const evidenceById = collectEntities(payload?.evidence ?? []);
        const relevantMarks = (payload?.nearby_marks?.length ? payload.nearby_marks : null)
            ?? payload?.marks
            ?? [];
        const relevantChecks = payload?.checks ?? [];
        const relations = payload?.relations ?? [];
        const cases = payload?.cases ?? [];
        for (const bundle of this.bundles) {
            const ranges = bundle.kind === "CHECK"
                ? relevantChecks.reduce((acc, check) => {
                    const range = rangeForCheck(check, objectsById, marksById, evidenceById, relations);
                    if (!range) {
                        return acc;
                    }
                    acc.push({
                        range,
                        hoverMessage: checkHover(check, relations, cases),
                    });
                    return acc;
                }, [])
                : relevantMarks
                    .filter((mark) => (mark.kind ?? "").toUpperCase() === bundle.kind.toUpperCase())
                    .reduce((acc, mark) => {
                    const range = rangeForMark(mark, objectsById);
                    if (!range) {
                        return acc;
                    }
                    acc.push({
                        range,
                        hoverMessage: markHover(mark, objectsById, relations, cases),
                    });
                    return acc;
                }, []);
            editor.setDecorations(bundle.decoration, ranges);
        }
    }
}
exports.MarkDecorations = MarkDecorations;

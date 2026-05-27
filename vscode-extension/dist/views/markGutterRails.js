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
exports.MAX_LANES = exports.LANE_WIDTH = void 0;
exports.segmentKind = segmentKind;
exports.assignLanes = assignLanes;
exports.remapLineLanes = remapLineLanes;
exports.buildCompositeLineGutterSvg = buildCompositeLineGutterSvg;
exports.gutterSvgWidth = gutterSvgWidth;
exports.collectLineGutterContext = collectLineGutterContext;
exports.buildLineDecorationGroups = buildLineDecorationGroups;
exports.buildGutterHoverHighlightGroup = buildGutterHoverHighlightGroup;
const vscode = __importStar(require("vscode"));
exports.LANE_WIDTH = 10;
exports.MAX_LANES = 4;
const ROW_HEIGHT = 26;
const OVERLAP = 14;
const STROKE_WIDTH = 4;
const CAP_RADIUS = 5;
function safeHex(hex) {
    const withHash = /^#/.test(hex.trim()) ? hex.trim() : `#${hex.trim()}`;
    return /^#[0-9A-Fa-f]{6}$/.test(withHash) ? withHash : "#475569";
}
function escapeXml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function segmentKind(line, startLine, endLine) {
    if (startLine === endLine) {
        return "single";
    }
    if (line === startLine) {
        return "start";
    }
    if (line === endLine) {
        return "end";
    }
    return "mid";
}
function intervalsOverlap(leftStart, leftEnd, rightStart, rightEnd) {
    return leftStart <= rightEnd && rightStart <= leftEnd;
}
function assignLanes(spans) {
    const sorted = [...spans].sort((left, right) => {
        const startDiff = left.range.start.line - right.range.start.line;
        if (startDiff !== 0) {
            return startDiff;
        }
        const leftLen = left.range.end.line - left.range.start.line;
        const rightLen = right.range.end.line - right.range.start.line;
        if (leftLen !== rightLen) {
            return rightLen - leftLen;
        }
        return left.entityId.localeCompare(right.entityId);
    });
    const laneIntervals = [];
    const assignment = new Map();
    for (const span of sorted) {
        const start = span.range.start.line;
        const end = span.range.end.line;
        let lane = 0;
        for (; lane < exports.MAX_LANES; lane += 1) {
            const intervals = laneIntervals[lane] ?? [];
            const blocked = intervals.some((interval) => intervalsOverlap(start, end, interval.start, interval.end));
            if (!blocked) {
                break;
            }
        }
        const assignedLane = Math.min(lane, exports.MAX_LANES - 1);
        laneIntervals[assignedLane] = laneIntervals[assignedLane] ?? [];
        laneIntervals[assignedLane].push({ start, end });
        assignment.set(span.entityId, assignedLane);
    }
    return assignment;
}
function remapLineLanes(entries) {
    const sorted = [...entries].sort((left, right) => left.lane - right.lane);
    const capped = sorted.slice(0, exports.MAX_LANES);
    const remapped = capped.map((entry, index) => ({
        ...entry,
        lane: index,
    }));
    return {
        entries: remapped,
        laneCount: Math.max(1, remapped.length),
    };
}
function laneCenterX(lane) {
    return lane * exports.LANE_WIDTH + exports.LANE_WIDTH / 2;
}
function mergeHoverMessages(entries) {
    const values = entries
        .map((entry) => entry.hoverMessage.value?.trim())
        .filter((value) => Boolean(value));
    if (!values.length) {
        return undefined;
    }
    const merged = new vscode.MarkdownString(values.join("\n\n---\n\n"));
    merged.isTrusted = true;
    return merged;
}
function appendGlyphCap(parts, cx, cy, color, glyph, emphasized) {
    const radius = emphasized ? CAP_RADIUS + 1.5 : CAP_RADIUS;
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}"/>`);
    if (glyph) {
        parts.push(`<text x="${cx}" y="${cy + 0.4}" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-size="7" font-weight="700" font-family="Arial, Helvetica, sans-serif">${escapeXml(glyph)}</text>`);
    }
}
function appendRailBar(parts, cx, color, yTop, yBottom, emphasized) {
    const width = emphasized ? STROKE_WIDTH + 4 : STROKE_WIDTH;
    const x = cx - width / 2;
    const height = Math.max(width, yBottom - yTop);
    parts.push(`<rect x="${x.toFixed(2)}" y="${yTop.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" rx="${(width / 2).toFixed(2)}" fill="${color}"/>`);
}
function appendSegmentShape(parts, cx, color, segment, glyph, emphasized) {
    const lineBottom = ROW_HEIGHT + OVERLAP;
    const lineTop = -OVERLAP;
    const capCenter = ROW_HEIGHT / 2;
    const capSplit = ROW_HEIGHT / 2;
    switch (segment) {
        case "single":
            appendGlyphCap(parts, cx, capCenter, color, glyph, emphasized);
            break;
        case "start":
            appendRailBar(parts, cx, color, capSplit - 1, lineBottom, emphasized);
            appendGlyphCap(parts, cx, capSplit - 3, color, glyph, emphasized);
            break;
        case "mid":
            appendRailBar(parts, cx, color, lineTop, lineBottom, emphasized);
            break;
        case "end":
            appendRailBar(parts, cx, color, lineTop, capSplit + 1, emphasized);
            appendGlyphCap(parts, cx, capSplit + 3, color, glyph, emphasized);
            break;
        default:
            break;
    }
}
function buildCompositeLineGutterSvg(entries, laneCount, emphasized = false) {
    const width = Math.max(1, laneCount) * exports.LANE_WIDTH;
    const parts = [];
    for (const entry of entries) {
        appendSegmentShape(parts, laneCenterX(entry.lane), safeHex(entry.color), entry.segment, entry.glyph, emphasized);
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${ROW_HEIGHT}" viewBox="0 0 ${width} ${ROW_HEIGHT}" overflow="visible">${parts.join("")}</svg>`;
}
function gutterSvgWidth(laneCount) {
    return Math.max(1, laneCount) * exports.LANE_WIDTH;
}
function compositeCacheKey(entries, laneCount, emphasized = false) {
    const body = entries
        .map((entry) => `${entry.lane}:${safeHex(entry.color)}:${entry.segment}:${entry.glyph ?? ""}`)
        .join("|");
    return `${emphasized ? "h|" : ""}${laneCount}|${body}`;
}
function collectLineGutterContext(spans) {
    const laneByEntity = assignLanes(spans);
    const lineEntries = new Map();
    for (const span of spans) {
        const lane = laneByEntity.get(span.entityId) ?? 0;
        const start = span.range.start.line;
        const end = span.range.end.line;
        for (let line = start; line <= end; line += 1) {
            const entries = lineEntries.get(line) ?? [];
            entries.push({
                lane,
                color: span.color,
                segment: segmentKind(line, start, end),
                glyph: span.glyph,
                hoverMessage: span.hoverMessage,
            });
            lineEntries.set(line, entries);
        }
    }
    return { lineEntries };
}
function buildLineDecorationGroups(spans) {
    if (!spans.length) {
        return [];
    }
    const { lineEntries } = collectLineGutterContext(spans);
    const grouped = new Map();
    for (const [line, entries] of lineEntries) {
        const { entries: remapped, laneCount } = remapLineLanes(entries);
        const cacheKey = compositeCacheKey(remapped, laneCount);
        const svg = buildCompositeLineGutterSvg(remapped, laneCount);
        const bucket = grouped.get(cacheKey) ?? { svg, options: [] };
        bucket.options.push({
            range: new vscode.Range(line, 0, line, 0),
            hoverMessage: mergeHoverMessages(remapped),
        });
        grouped.set(cacheKey, bucket);
    }
    return [...grouped.entries()]
        .map(([cacheKey, value]) => ({
        cacheKey,
        svg: value.svg,
        options: value.options.sort((left, right) => left.range.start.line - right.range.start.line),
    }))
        .sort((left, right) => left.options[0].range.start.line - right.options[0].range.start.line);
}
function buildGutterHoverHighlightGroup(line, entries) {
    if (!entries.length) {
        return null;
    }
    const { entries: remapped, laneCount } = remapLineLanes(entries);
    const svg = buildCompositeLineGutterSvg(remapped, laneCount, true);
    return {
        cacheKey: compositeCacheKey(remapped, laneCount, true),
        svg,
        options: [{
                range: new vscode.Range(line, 0, line, 0),
            }],
    };
}

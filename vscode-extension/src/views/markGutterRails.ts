import * as vscode from "vscode";

export const LANE_WIDTH = 10;
export const MAX_LANES = 4;
const ROW_HEIGHT = 26;
const OVERLAP = 14;
const STROKE_WIDTH = 4;
const CAP_RADIUS = 5;

export type GutterSegmentKind = "single" | "start" | "mid" | "end";

export type GutterSpan = {
  entityId: string;
  kind: string;
  color: string;
  glyph: string | null;
  range: vscode.Range;
  hoverMessage: vscode.MarkdownString;
};

export type LineGutterEntry = {
  lane: number;
  color: string;
  segment: GutterSegmentKind;
  glyph: string | null;
  hoverMessage: vscode.MarkdownString;
};

export type LineGutterContext = {
  lineEntries: Map<number, LineGutterEntry[]>;
};

export type RemappedLineLanes = {
  entries: LineGutterEntry[];
  laneCount: number;
};

function safeHex(hex: string): string {
  const withHash = /^#/.test(hex.trim()) ? hex.trim() : `#${hex.trim()}`;
  return /^#[0-9A-Fa-f]{6}$/.test(withHash) ? withHash : "#475569";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function segmentKind(line: number, startLine: number, endLine: number): GutterSegmentKind {
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

function intervalsOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

export function assignLanes(spans: readonly GutterSpan[]): Map<string, number> {
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

  const laneIntervals: Array<Array<{ start: number; end: number }>> = [];
  const assignment = new Map<string, number>();

  for (const span of sorted) {
    const start = span.range.start.line;
    const end = span.range.end.line;
    let lane = 0;
    for (; lane < MAX_LANES; lane += 1) {
      const intervals = laneIntervals[lane] ?? [];
      const blocked = intervals.some((interval) => intervalsOverlap(start, end, interval.start, interval.end));
      if (!blocked) {
        break;
      }
    }
    const assignedLane = Math.min(lane, MAX_LANES - 1);
    laneIntervals[assignedLane] = laneIntervals[assignedLane] ?? [];
    laneIntervals[assignedLane].push({ start, end });
    assignment.set(span.entityId, assignedLane);
  }

  return assignment;
}

export function remapLineLanes(entries: readonly LineGutterEntry[]): RemappedLineLanes {
  const sorted = [...entries].sort((left, right) => left.lane - right.lane);
  const capped = sorted.slice(0, MAX_LANES);
  const remapped = capped.map((entry, index) => ({
    ...entry,
    lane: index,
  }));
  return {
    entries: remapped,
    laneCount: Math.max(1, remapped.length),
  };
}

function laneCenterX(lane: number): number {
  return lane * LANE_WIDTH + LANE_WIDTH / 2;
}

function mergeHoverMessages(entries: readonly LineGutterEntry[]): vscode.MarkdownString | undefined {
  const values = entries
    .map((entry) => entry.hoverMessage.value?.trim())
    .filter((value): value is string => Boolean(value));
  if (!values.length) {
    return undefined;
  }
  const merged = new vscode.MarkdownString(values.join("\n\n---\n\n"));
  merged.isTrusted = true;
  return merged;
}

function appendGlyphCap(
  parts: string[],
  cx: number,
  cy: number,
  color: string,
  glyph: string | null,
  emphasized: boolean,
) {
  const radius = emphasized ? CAP_RADIUS + 1.5 : CAP_RADIUS;
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}"/>`);
  if (glyph) {
    parts.push(
      `<text x="${cx}" y="${cy + 0.4}" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-size="7" font-weight="700" font-family="Arial, Helvetica, sans-serif">${escapeXml(glyph)}</text>`,
    );
  }
}

function appendRailBar(
  parts: string[],
  cx: number,
  color: string,
  yTop: number,
  yBottom: number,
  emphasized: boolean,
) {
  const width = emphasized ? STROKE_WIDTH + 4 : STROKE_WIDTH;
  const x = cx - width / 2;
  const height = Math.max(width, yBottom - yTop);
  parts.push(
    `<rect x="${x.toFixed(2)}" y="${yTop.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" rx="${(width / 2).toFixed(2)}" fill="${color}"/>`,
  );
}

function appendSegmentShape(
  parts: string[],
  cx: number,
  color: string,
  segment: GutterSegmentKind,
  glyph: string | null,
  emphasized: boolean,
) {
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

export function buildCompositeLineGutterSvg(
  entries: readonly LineGutterEntry[],
  laneCount: number,
  emphasized = false,
): string {
  const width = Math.max(1, laneCount) * LANE_WIDTH;
  const parts: string[] = [];
  for (const entry of entries) {
    appendSegmentShape(
      parts,
      laneCenterX(entry.lane),
      safeHex(entry.color),
      entry.segment,
      entry.glyph,
      emphasized,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${ROW_HEIGHT}" viewBox="0 0 ${width} ${ROW_HEIGHT}" overflow="visible">${parts.join("")}</svg>`;
}

export function gutterSvgWidth(laneCount: number): number {
  return Math.max(1, laneCount) * LANE_WIDTH;
}

function compositeCacheKey(entries: readonly LineGutterEntry[], laneCount: number, emphasized = false): string {
  const body = entries
    .map((entry) => `${entry.lane}:${safeHex(entry.color)}:${entry.segment}:${entry.glyph ?? ""}`)
    .join("|");
  return `${emphasized ? "h|" : ""}${laneCount}|${body}`;
}

export type LineGutterDecorationGroup = {
  cacheKey: string;
  svg: string;
  options: vscode.DecorationOptions[];
};

export function collectLineGutterContext(spans: readonly GutterSpan[]): LineGutterContext {
  const laneByEntity = assignLanes(spans);
  const lineEntries = new Map<number, LineGutterEntry[]>();

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

export function buildLineDecorationGroups(spans: readonly GutterSpan[]): LineGutterDecorationGroup[] {
  if (!spans.length) {
    return [];
  }

  const { lineEntries } = collectLineGutterContext(spans);
  const grouped = new Map<string, { svg: string; options: vscode.DecorationOptions[] }>();

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

export function buildGutterHoverHighlightGroup(
  line: number,
  entries: readonly LineGutterEntry[],
): LineGutterDecorationGroup | null {
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

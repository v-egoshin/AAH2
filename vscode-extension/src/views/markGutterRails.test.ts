import { describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => {
  class Range {
    start: { line: number; character: number };
    end: { line: number; character: number };

    constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
      this.start = { line: startLine, character: startCharacter };
      this.end = { line: endLine, character: endCharacter };
    }
  }

  class MarkdownString {
    value?: string;
    isTrusted = false;
    constructor(value?: string) {
      this.value = value;
    }
  }

  return { Range, MarkdownString };
});

import * as vscode from "vscode";
import {
  assignLanes,
  buildCompositeLineGutterSvg,
  gutterSvgWidth,
  LANE_WIDTH,
  MAX_LANES,
  remapLineLanes,
  type GutterSpan,
  type LineGutterEntry,
} from "./markGutterRails";

function hover(label: string): vscode.MarkdownString {
  return new vscode.MarkdownString(label);
}

function span(entityId: string, startLine: number, endLine: number): GutterSpan {
  return {
    entityId,
    kind: "NOTE",
    color: "#2563eb",
    glyph: "N",
    range: new vscode.Range(startLine, 0, endLine, 0),
    hoverMessage: hover(entityId),
  };
}

function entry(lane: number, segment: LineGutterEntry["segment"] = "mid"): LineGutterEntry {
  return {
    lane,
    color: "#2563eb",
    segment,
    glyph: "G",
    hoverMessage: hover(`lane-${lane}`),
  };
}

describe("remapLineLanes", () => {
  it("maps a single mark to display lane 0", () => {
    const result = remapLineLanes([entry(5, "single")]);
    expect(result.laneCount).toBe(1);
    expect(result.entries).toEqual([expect.objectContaining({ lane: 0 })]);
    expect(gutterSvgWidth(result.laneCount)).toBe(LANE_WIDTH);
  });

  it("packs three marks into lanes 0..2 on one line", () => {
    const result = remapLineLanes([entry(2), entry(0), entry(1)]);
    expect(result.laneCount).toBe(3);
    expect(result.entries.map((item) => item.lane)).toEqual([0, 1, 2]);
    expect(gutterSvgWidth(result.laneCount)).toBe(3 * LANE_WIDTH);
  });

  it("caps visible lanes at MAX_LANES", () => {
    const entries = Array.from({ length: MAX_LANES + 2 }, (_, index) => entry(index));
    const result = remapLineLanes(entries);
    expect(result.laneCount).toBe(MAX_LANES);
    expect(result.entries).toHaveLength(MAX_LANES);
    expect(result.entries.map((item) => item.lane)).toEqual([0, 1, 2, 3]);
  });
});

describe("buildCompositeLineGutterSvg", () => {
  it("uses per-line lane count instead of global max lanes", () => {
    const svg = buildCompositeLineGutterSvg([entry(0, "single")], 1);
    expect(svg).toContain(`width="${LANE_WIDTH}"`);
    expect(svg).not.toContain(`width="${6 * LANE_WIDTH}"`);
  });
});

describe("assignLanes", () => {
  it("keeps overlapping spans on different global lanes", () => {
    const lanes = assignLanes([
      span("a", 10, 20),
      span("b", 15, 25),
    ]);
    expect(lanes.get("a")).toBe(0);
    expect(lanes.get("b")).toBe(1);
  });

  it("reuses lane 0 for non-overlapping spans", () => {
    const lanes = assignLanes([
      span("a", 10, 12),
      span("b", 20, 22),
    ]);
    expect(lanes.get("a")).toBe(0);
    expect(lanes.get("b")).toBe(0);
  });
});

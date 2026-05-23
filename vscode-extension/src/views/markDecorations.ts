import * as vscode from "vscode";

import { ReviewContextResponse, ReviewEntity } from "../api/client";

type DecorationBundle = {
  kind: string;
  decoration: vscode.TextEditorDecorationType;
};

function iconPath(context: vscode.ExtensionContext, name: string) {
  return vscode.Uri.joinPath(context.extensionUri, "media", name);
}

function makeDecoration(
  context: vscode.ExtensionContext,
  kind: string,
  iconName: string,
  color: string,
  overviewColor: string,
): DecorationBundle {
  return {
    kind,
    decoration: vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      gutterIconPath: iconPath(context, iconName),
      gutterIconSize: "contain",
      overviewRulerColor: overviewColor,
      overviewRulerLane: vscode.OverviewRulerLane.Left,
      backgroundColor: `${color}14`,
      borderColor: `${color}55`,
      borderWidth: "0 0 0 3px",
      borderStyle: "solid",
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
  return new vscode.MarkdownString(lines.join("\n\n"));
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
  return new vscode.MarkdownString(lines.join("\n\n"));
}

export class MarkDecorations {
  private readonly bundles: DecorationBundle[];

  constructor(context: vscode.ExtensionContext) {
    this.bundles = [
      makeDecoration(context, "SOURCE", "source.svg", "#15803d", "rgba(21,128,61,0.8)"),
      makeDecoration(context, "SINK", "sink.svg", "#b91c1c", "rgba(185,28,28,0.85)"),
      makeDecoration(context, "GUARD", "guard.svg", "#1d4ed8", "rgba(29,78,216,0.8)"),
      makeDecoration(context, "TRANSFORM", "transform.svg", "#a16207", "rgba(161,98,7,0.8)"),
      makeDecoration(context, "NOTE", "mark.svg", "#475569", "rgba(71,85,105,0.8)"),
      makeDecoration(context, "CHECK", "check.svg", "#2563eb", "rgba(37,99,235,0.82)"),
    ];
  }

  dispose() {
    for (const bundle of this.bundles) {
      bundle.decoration.dispose();
    }
  }

  apply(editor: vscode.TextEditor | undefined, payload: ReviewContextResponse | null) {
    if (!editor) {
      return;
    }

    const objectsById = collectObjectRanges(payload);
    const marksById = collectEntities([...(payload?.marks ?? []), ...(payload?.nearby_marks ?? [])]);
    const evidenceById = collectEntities(payload?.evidence ?? []);
    const relevantMarks = payload?.nearby_marks ?? payload?.marks ?? [];
    const relevantChecks = payload?.checks ?? [];
    const relations = payload?.relations ?? [];
    const cases = payload?.cases ?? [];
    for (const bundle of this.bundles) {
      const ranges = bundle.kind === "CHECK"
        ? relevantChecks.reduce<vscode.DecorationOptions[]>((acc, check) => {
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
            .filter((mark) => mark.kind === bundle.kind)
            .reduce<vscode.DecorationOptions[]>((acc, mark) => {
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

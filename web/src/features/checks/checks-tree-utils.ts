import type { CheckRecord } from "../../api/client";

export type DropPosition = {
  parentId: string | null;
  index: number;
};

export type CheckFilter = "all" | "checks" | "groups" | "open" | "completed";

export const CHECK_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "NEEDS_REVIEW", "CHECKED_OK", "CHECKED_WEAK", "FAILED", "NOT_APPLICABLE", "BLOCKED"];
export const OPEN_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "NEEDS_REVIEW", "FAILED", "BLOCKED"];

export function buildChildrenMap(rows: CheckRecord[]) {
  const byParent = new Map<string | null, CheckRecord[]>();
  const normalizedIds = new Set(rows.map((row) => row.id));
  for (const row of rows) {
    const parentId = row.parent_check_id && normalizedIds.has(row.parent_check_id) ? row.parent_check_id : null;
    const bucket = byParent.get(parentId) ?? [];
    bucket.push(row);
    byParent.set(parentId, bucket);
  }
  for (const bucket of byParent.values()) {
    const sortOrders = bucket.map((row) => row.sort_order ?? 0);
    const uniqueSorted = [...new Set(sortOrders)].sort((a, b) => a - b);
    const hasManualOrder = uniqueSorted.length === bucket.length && uniqueSorted.every((value, index) => value === index);
    bucket.sort((a, b) => {
      if (hasManualOrder) {
        const sortDelta = (a.sort_order ?? 0) - (b.sort_order ?? 0);
        if (sortDelta !== 0) {
          return sortDelta;
        }
      }
      const createdDelta = (a.created_at ? Date.parse(a.created_at) : 0) - (b.created_at ? Date.parse(b.created_at) : 0);
      if (createdDelta !== 0) {
        return createdDelta;
      }
      return a.id.localeCompare(b.id);
    });
  }
  return byParent;
}

export function collectDescendants(rows: CheckRecord[], checkId: string) {
  const childrenMap = buildChildrenMap(rows);
  const result = new Set<string>();
  const walk = (parentId: string) => {
    for (const child of childrenMap.get(parentId) ?? []) {
      result.add(child.id);
      walk(child.id);
    }
  };
  walk(checkId);
  return result;
}

export function reorderChecks(rows: CheckRecord[], movedId: string, target: DropPosition): CheckRecord[] {
  const next = rows.map((row) => ({ ...row }));
  const byId = new Map(next.map((row) => [row.id, row]));
  const moved = byId.get(movedId);
  if (!moved) {
    return rows;
  }

  const childrenMap = buildChildrenMap(next);
  const sourceParentId = moved.parent_check_id ?? null;
  const sourceSiblings = [...(childrenMap.get(sourceParentId) ?? [])].filter((row) => row.id !== movedId);
  const targetSiblings = sourceParentId === target.parentId ? sourceSiblings : [...(childrenMap.get(target.parentId) ?? [])].filter((row) => row.id !== movedId);

  const safeIndex = Math.max(0, Math.min(target.index, targetSiblings.length));
  targetSiblings.splice(safeIndex, 0, moved);
  moved.parent_check_id = target.parentId;

  sourceSiblings.forEach((row, index) => {
    row.sort_order = index;
  });
  targetSiblings.forEach((row, index) => {
    row.sort_order = index;
  });

  return next;
}

export function statusMarker(status: string) {
  switch (status) {
    case "CHECKED_OK":
      return { glyph: "✓", className: "is-good" };
    case "IN_PROGRESS":
      return { glyph: "▶", className: "is-progress" };
    case "FAILED":
      return { glyph: "!", className: "is-bad" };
    case "BLOCKED":
      return { glyph: "⊘", className: "is-blocked" };
    case "CHECKED_WEAK":
      return { glyph: "~", className: "is-warn" };
    case "NEEDS_REVIEW":
      return { glyph: "?", className: "is-review" };
    case "NOT_APPLICABLE":
      return { glyph: "∅", className: "is-na" };
    default:
      return null;
  }
}

export function createGroupTitle(title: string) {
  return title.trim();
}

export function flattenVisibleRows(
  roots: CheckRecord[],
  childrenMap: Map<string | null, CheckRecord[]>,
  visibleIds: Set<string> | null,
  collapsedIds: Set<string>,
) {
  const ordered: CheckRecord[] = [];
  const visit = (items: CheckRecord[]) => {
    for (const item of items) {
      if (visibleIds && !visibleIds.has(item.id)) {
        continue;
      }
      ordered.push(item);
      if (!collapsedIds.has(item.id)) {
        visit(childrenMap.get(item.id) ?? []);
      }
    }
  };
  visit(roots);
  return ordered;
}

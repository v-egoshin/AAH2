import { DragEvent, type ReactNode, useEffect, useMemo, useState } from "react";

import { CaseRecord, CheckRecord, RelationRecord } from "../api/client";
import { useWorkbench } from "../app/workbench";
import { EmptyState, Field, InlineEditableText, SectionHeader } from "../components/common";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSubmenu, ContextMenuTrigger } from "../components/context-menu";
import { ModalGlyph, ModalShell } from "../components/modal";
import { ResourceCard } from "../components/resource";
import { TreeExpander, TreeView, type TreeRenderArgs } from "../components/tree";
import { buildTreeFromFlatRows, collectTreeIds, filterTree, parseBulkChecksInput } from "../components/tree-utils";
import { diffChecksImport, exportChecksToMarkdown, parseChecksMarkdown } from "./checks-markdown";
import { SelectableNameButton, useSelectedIdParam } from "./utils";

const CHECK_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "NEEDS_REVIEW", "CHECKED_OK", "CHECKED_WEAK", "FAILED", "NOT_APPLICABLE", "BLOCKED"];
const OPEN_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "NEEDS_REVIEW", "FAILED", "BLOCKED"];

type DropPosition = {
  parentId: string | null;
  index: number;
};

type CheckFilter = "all" | "checks" | "groups" | "open" | "completed";

function MenuGlyph({ children, viewBox = "0 0 16 16", className }: { children: ReactNode; viewBox?: string; className?: string }) {
  return (
    <svg viewBox={viewBox} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

function saveButtonIcon() {
  return (
    <MenuGlyph className="btn-icon">
      <path d="M3.25 3.25h7.8l1.7 1.7v7.8H3.25z" />
      <path d="M5.25 3.25v3h5v-3" />
      <path d="M5.4 10.1h4.9" />
    </MenuGlyph>
  );
}

function plusButtonIcon() {
  return (
    <MenuGlyph className="btn-icon">
      <path d="M8 3.25v9.5" />
      <path d="M3.25 8h9.5" />
    </MenuGlyph>
  );
}

function mergeButtonIcon() {
  return (
    <MenuGlyph className="btn-icon">
      <path d="M4 4.5v3.1c0 1 .8 1.9 1.9 1.9h6.1" />
      <path d="m9.75 6.4 2.25 2.25-2.25 2.25" />
      <path d="M4 11.5v-1.4" />
    </MenuGlyph>
  );
}

function folderMenuIcon() {
  return (
    <MenuGlyph>
      <path d="M2.75 4.75h3l1.1 1.5h6.4v4.9a1.1 1.1 0 0 1-1.1 1.1H3.85a1.1 1.1 0 0 1-1.1-1.1z" />
      <path d="M2.75 5.4v-.6a1.1 1.1 0 0 1 1.1-1.1h2.05l1.05 1.3" />
    </MenuGlyph>
  );
}

function switchMenuIcon() {
  return (
    <MenuGlyph>
      <path d="M3 5.25h7.5" />
      <path d="m8.75 3.5 1.75 1.75L8.75 7" />
      <path d="M13 10.75H5.5" />
      <path d="m7.25 9 1.75 1.75L7.25 12.5" />
    </MenuGlyph>
  );
}

function checkMenuIcon() {
  return (
    <MenuGlyph>
      <path d="m4.25 8.2 2.1 2.1 5.4-5.1" />
    </MenuGlyph>
  );
}

function plusMenuIcon() {
  return (
    <MenuGlyph>
      <path d="M8 3.25v9.5" />
      <path d="M3.25 8h9.5" />
    </MenuGlyph>
  );
}

function buildChildrenMap(rows: CheckRecord[]) {
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

function collectDescendants(rows: CheckRecord[], checkId: string) {
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

function reorderChecks(rows: CheckRecord[], movedId: string, target: DropPosition): CheckRecord[] {
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

function DropZone({
  active,
  onDragOver,
  onDrop,
  compact = false,
}: {
  active: boolean;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  compact?: boolean;
}) {
  return <div className={`tree-dropzone ${active ? "is-active" : ""} ${compact ? "is-compact" : ""}`} onDragOver={onDragOver} onDrop={onDrop} />;
}

function statusMarker(status: string) {
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

function createGroupTitle(title: string) {
  return title.trim();
}

function flattenVisibleRows(
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

export function ChecksPage() {
  const { api, selectedAssessmentId } = useWorkbench();
  const [rows, setRows] = useState<CheckRecord[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [relations, setRelations] = useState<RelationRecord[]>([]);
  const [selectedId, setSelectedId] = useSelectedIdParam();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionAnchorId, setSelectionAnchorId] = useState("");
  const [dropTarget, setDropTarget] = useState<string>("");
  const [error, setError] = useState("");
  const [addingChildFor, setAddingChildFor] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<CheckFilter>("all");
  const [createRootKind, setCreateRootKind] = useState<"check" | "group" | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [inlineEditingId, setInlineEditingId] = useState("");
  const [createRootDraft, setCreateRootDraft] = useState({ title: "", description: "" });
  const [editDraft, setEditDraft] = useState({
    title: "",
    description: "",
    category: "",
    check_type: "",
    priority: "MEDIUM",
    status: "NOT_STARTED",
    reason: "",
    is_checked: false,
  });
  const [bulkAddTargetId, setBulkAddTargetId] = useState<string | null | undefined>(undefined);
  const [bulkAddTargetRowId, setBulkAddTargetRowId] = useState<string>("");
  const [bulkDraft, setBulkDraft] = useState("");
  const [caseMappingTarget, setCaseMappingTarget] = useState<CheckRecord | null>(null);
  const [caseMappingIds, setCaseMappingIds] = useState<string[]>([]);
  const [markdownExportOpen, setMarkdownExportOpen] = useState(false);
  const [markdownImportOpen, setMarkdownImportOpen] = useState(false);
  const [markdownDraft, setMarkdownDraft] = useState("");

  const reload = async () => {
    if (!selectedAssessmentId) return;
    try {
      const [checkRows, caseRows, relationRows] = await Promise.all([
        api.getChecks(selectedAssessmentId),
        api.getCases(selectedAssessmentId),
        api.getRelations(selectedAssessmentId),
      ]);
      setRows(checkRows);
      setCases(caseRows);
      setRelations(relationRows);
      if (!selectedId && checkRows[0]?.id) {
        setSelectedId(checkRows[0].id);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void reload();
  }, [selectedAssessmentId]);

  const selected = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId]);
  useEffect(() => {
    if (!createRootKind) {
      setCreateRootDraft({ title: "", description: "" });
    }
  }, [createRootKind]);
  useEffect(() => {
    if (!isEditOpen || !selected) {
      return;
    }
    setEditDraft({
      title: selected.title,
      description: selected.description ?? "",
      category: selected.category ?? "",
      check_type: selected.check_type ?? "",
      priority: selected.priority ?? "MEDIUM",
      status: selected.status,
      reason: selected.reason ?? "",
      is_checked: Boolean(selected.is_checked),
    });
  }, [isEditOpen, selected]);
  const childrenMap = useMemo(() => buildChildrenMap(rows), [rows]);
  const checkCaseMap = useMemo(() => {
    const next = new Map<string, CaseRecord[]>();
    for (const relation of relations) {
      if (relation.predicate !== "PART_OF") {
        continue;
      }
      if (relation.subject_type !== "CHECK" || relation.object_type !== "CASE") {
        continue;
      }
      const linkedCase = cases.find((item) => item.id === relation.object_id);
      if (!linkedCase) {
        continue;
      }
      const bucket = next.get(relation.subject_id) ?? [];
      bucket.push(linkedCase);
      next.set(relation.subject_id, bucket);
    }
    return next;
  }, [cases, relations]);
  const rootChecks = childrenMap.get(null) ?? [];
  const matchesFilter = (row: CheckRecord) => {
    switch (activeFilter) {
      case "checks":
        return !row.is_group;
      case "groups":
        return Boolean(row.is_group);
      case "open":
        return !row.is_group && OPEN_STATUSES.includes(row.status);
      case "completed":
        return !row.is_group && (Boolean(row.is_checked) || row.status === "CHECKED_OK");
      default:
        return true;
    }
  };
  const visibleIds = useMemo(() => {
    if (activeFilter === "all") {
      return null;
    }
    const tree = buildTreeFromFlatRows(rows.map((row) => ({
      ...row,
      parentId: row.parent_check_id ?? null,
      sortOrder: row.sort_order ?? 0,
    })));
    const filtered = filterTree(tree, matchesFilter);
    return collectTreeIds(filtered);
  }, [activeFilter, rows]);
  const visibleRootChecks = useMemo(
    () => (visibleIds ? rootChecks.filter((row) => visibleIds.has(row.id)) : rootChecks),
    [rootChecks, visibleIds],
  );
  const orderedVisibleRows = useMemo(
    () => flattenVisibleRows(visibleRootChecks, childrenMap, visibleIds, collapsedIds),
    [visibleRootChecks, childrenMap, visibleIds, collapsedIds],
  );
  const orderedVisibleIds = useMemo(
    () => orderedVisibleRows.map((row) => row.id),
    [orderedVisibleRows],
  );
  const isCreateRootDirty = Boolean(createRootDraft.title.trim() || createRootDraft.description.trim());
  const isEditDirty = Boolean(selected) && (
    editDraft.title !== selected.title
    || editDraft.description !== (selected.description ?? "")
    || editDraft.category !== (selected.category ?? "")
    || editDraft.check_type !== (selected.check_type ?? "")
    || editDraft.priority !== (selected.priority ?? "MEDIUM")
    || editDraft.status !== selected.status
    || editDraft.reason !== (selected.reason ?? "")
    || editDraft.is_checked !== Boolean(selected.is_checked)
  );
  const bulkChecksCount = parseBulkChecksInput(bulkDraft).length;
  const bulkTargetRow = useMemo(
    () => rows.find((row) => row.id === bulkAddTargetRowId) ?? null,
    [rows, bulkAddTargetRowId],
  );
  const selectedCheckIds = useMemo(
    () => [...selectedIds].filter((id) => {
      const row = rows.find((item) => item.id === id);
      return row && !row.is_group;
    }),
    [rows, selectedIds],
  );
  const selectedChecks = useMemo(
    () => rows.filter((row) => selectedCheckIds.includes(row.id)),
    [rows, selectedCheckIds],
  );
  const isCaseMappingDirty = Boolean(caseMappingTarget) && (
    [...caseMappingIds].sort().join(",") !== [...((caseMappingTarget ? checkCaseMap.get(caseMappingTarget.id) ?? [] : []).map((item) => item.id))].sort().join(",")
  );

  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set([...current].filter((id) => rows.some((row) => row.id === id)));
      if (!next.size && selectedId) {
        next.add(selectedId);
      }
      return next;
    });
  }, [rows, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds((current) => {
      if (current.size === 1 && current.has(selectedId)) {
        return current;
      }
      if (!current.size) {
        return new Set([selectedId]);
      }
      return current;
    });
  }, [selectedId]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName ?? "";
      if (!selected) {
        return;
      }
      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT" || target?.isContentEditable) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        setAddingChildFor(selected.id);
        return;
      }
      if (event.key === "Delete" && selectedCheckIds.length) {
        event.preventDefault();
        void deleteSelectedChecks();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [selected, selectedCheckIds]);

  const persistTreeLayout = async (nextRows: CheckRecord[]) => {
    const changed = nextRows.filter((row) => {
      const previous = rows.find((item) => item.id === row.id);
      if (!previous) {
        return false;
      }
      return (previous.parent_check_id ?? null) !== (row.parent_check_id ?? null) || (previous.sort_order ?? 0) !== (row.sort_order ?? 0);
    });
    if (!changed.length) {
      setRows(nextRows);
      return;
    }
    setRows(nextRows);
    await Promise.all(changed.map((row) => api.updateCheck(row.id, { parent_check_id: row.parent_check_id ?? null, sort_order: row.sort_order ?? 0 })));
    await reload();
  };

  const handleDropMove = async (movedId: string, target: DropPosition) => {
    if (!movedId) {
      return;
    }
    if (target.parentId === movedId) {
      return;
    }
    const descendants = collectDescendants(rows, movedId);
    if (target.parentId && descendants.has(target.parentId)) {
      return;
    }
    const nextRows = reorderChecks(rows, movedId, target);
    setDropTarget("");
    try {
      await persistTreeLayout(nextRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await reload();
    }
  };

  const createCheck = async (payload: Partial<CheckRecord> & { title: string; parent_check_id?: string | null }) => {
    if (!selectedAssessmentId) {
      setError("Select assessment first");
      return;
    }
    const siblings = childrenMap.get(payload.parent_check_id ?? null) ?? [];
    const nextSortOrder = siblings.length
      ? Math.max(...siblings.map((item) => item.sort_order ?? 0)) + 1
      : 0;
    const created = await api.createCheck(selectedAssessmentId, {
      title: payload.title,
      description: payload.description ?? "",
      category: payload.category ?? null,
      check_type: payload.check_type ?? null,
      parent_check_id: payload.parent_check_id ?? null,
      sort_order: nextSortOrder,
      is_group: Boolean(payload.is_group),
      is_checked: false,
      priority: payload.priority ?? "MEDIUM",
      status: payload.status ?? "NOT_STARTED",
      reason: payload.reason ?? null,
      source: "OTHER",
    });
    await reload();
    setSelectedId(created.id);
  };

  const toggleChecked = async (row: CheckRecord, checked: boolean) => {
    const targetRows = selectedIds.has(row.id) && selectedCheckIds.length > 1
      ? selectedChecks
      : [row];
    await Promise.all(targetRows.map((targetRow) => {
      const nextStatus = checked
        ? (["NOT_STARTED", "IN_PROGRESS"].includes(targetRow.status) ? "CHECKED_OK" : targetRow.status)
        : (targetRow.status === "CHECKED_OK" ? "NOT_STARTED" : targetRow.status);
      return api.updateCheck(targetRow.id, {
        is_checked: checked,
        status: nextStatus,
      });
    }));
    await reload();
  };

  const toggleCollapsed = (checkId: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(checkId)) {
        next.delete(checkId);
      } else {
        next.add(checkId);
      }
      return next;
    });
  };

  const setRowStatus = async (row: CheckRecord, status: string) => {
    const targetRows = selectedIds.has(row.id) && selectedCheckIds.length > 1
      ? selectedChecks
      : [row];
    await Promise.all(targetRows.map((targetRow) => {
      const nextChecked = status === "CHECKED_OK"
        ? true
        : (targetRow.status === "CHECKED_OK" ? false : Boolean(targetRow.is_checked));
      return api.updateCheck(targetRow.id, { status, is_checked: nextChecked });
    }));
    await reload();
  };

  const saveInlineTitle = async (row: CheckRecord, title: string) => {
    const nextTitle = title.trim();
    setInlineEditingId("");
    if (!nextTitle || nextTitle === row.title) {
      return;
    }
    await api.updateCheck(row.id, { title: nextTitle });
    await reload();
  };

  const deleteCheckRow = async (row: CheckRecord) => {
    if (row.is_group) {
      return;
    }
    const confirmed = window.confirm(`Delete check "${row.title}"?`);
    if (!confirmed) {
      return;
    }
    const descendantIds = collectDescendants(rows, row.id);
    const nestedChecksCount = descendantIds.size;
    if (nestedChecksCount) {
      const nestedConfirmed = window.confirm(`Also delete ${nestedChecksCount} nested check${nestedChecksCount === 1 ? "" : "s"}?`);
      if (!nestedConfirmed) {
        return;
      }
    }
    await api.deleteCheck(row.id);
    setSelectedId(row.parent_check_id ?? null);
    await reload();
  };

  const deleteSelectedChecks = async () => {
    if (!selectedCheckIds.length) {
      return;
    }
    const confirmed = window.confirm(`Delete ${selectedCheckIds.length} selected check${selectedCheckIds.length === 1 ? "" : "s"}?`);
    if (!confirmed) {
      return;
    }
    const descendantIds = new Set<string>();
    for (const id of selectedCheckIds) {
      collectDescendants(rows, id).forEach((descendantId) => descendantIds.add(descendantId));
    }
    if (descendantIds.size) {
      const nestedConfirmed = window.confirm(`Also delete ${descendantIds.size} nested check${descendantIds.size === 1 ? "" : "s"}?`);
      if (!nestedConfirmed) {
        return;
      }
    }
    for (const id of selectedCheckIds) {
      await api.deleteCheck(id);
    }
    setSelectedIds(new Set());
    setSelectedId("");
    await reload();
  };

  const selectRow = (row: CheckRecord, shiftKey: boolean) => {
    if (shiftKey && selectionAnchorId && orderedVisibleIds.includes(selectionAnchorId)) {
      const startIndex = orderedVisibleIds.indexOf(selectionAnchorId);
      const endIndex = orderedVisibleIds.indexOf(row.id);
      if (startIndex >= 0 && endIndex >= 0) {
        const [from, to] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
        const rangeIds = orderedVisibleIds.slice(from, to + 1);
        setSelectedIds(new Set(rangeIds));
        setSelectedId(row.id);
        return;
      }
    }
    setSelectedIds(new Set([row.id]));
    setSelectedId(row.id);
    setSelectionAnchorId(row.id);
  };

  const submitBulkChecks = async () => {
    if (!selectedAssessmentId) {
      setError("Select assessment first");
      return;
    }
    const titles = parseBulkChecksInput(bulkDraft);
    if (!titles.length) {
      return;
    }
    const effectiveParentId = bulkTargetRow?.is_group
      ? bulkTargetRow.id
      : (bulkTargetRow?.parent_check_id ?? bulkAddTargetId ?? null);
    for (const title of titles) {
      await createCheck({
        title,
        parent_check_id: effectiveParentId,
      });
    }
    const expandTargetId = bulkTargetRow?.is_group ? bulkTargetRow.id : (bulkTargetRow?.parent_check_id ?? bulkAddTargetId ?? null);
    if (expandTargetId) {
      setCollapsedIds((current) => {
        const next = new Set(current);
        next.delete(expandTargetId);
        return next;
      });
    }
    setBulkDraft("");
    setBulkAddTargetId(undefined);
    setBulkAddTargetRowId("");
  };

  const openCaseMapping = (row: CheckRecord) => {
    setCaseMappingTarget(row);
    setCaseMappingIds((checkCaseMap.get(row.id) ?? []).map((item) => item.id));
  };

  const saveCaseMapping = async () => {
    if (!selectedAssessmentId || !caseMappingTarget) {
      return;
    }
    const currentRelations = relations.filter((relation) =>
      relation.predicate === "PART_OF"
      && relation.subject_type === "CHECK"
      && relation.subject_id === caseMappingTarget.id
      && relation.object_type === "CASE",
    );
    const currentIds = new Set(currentRelations.map((relation) => relation.object_id));
    const nextIds = new Set(caseMappingIds);

    for (const relation of currentRelations) {
      if (!nextIds.has(relation.object_id)) {
        await api.deleteRelation(relation.id);
      }
    }
    for (const caseId of nextIds) {
      if (!currentIds.has(caseId)) {
        await api.createRelation(selectedAssessmentId, {
          subject_type: "CHECK",
          subject_id: caseMappingTarget.id,
          predicate: "PART_OF",
          object_type: "CASE",
          object_id: caseId,
          confidence: "MEDIUM",
          status: "ACCEPTED",
          source: "OTHER",
          properties: {},
        });
      }
    }
    setCaseMappingTarget(null);
    await reload();
  };

  const markdownImportPreview = useMemo(() => diffChecksImport(rows, parseChecksMarkdown(markdownDraft)), [markdownDraft, rows]);

  const applyMarkdownImport = async () => {
    const parsed = parseChecksMarkdown(markdownDraft);
    const diff = diffChecksImport(rows, parsed);
    const groupsByTitle = new Map(
      rows.filter((row) => row.is_group).map((row) => [row.title, row]),
    );

    for (const incoming of diff.added) {
      let parentId: string | null = null;
      if (incoming.groupTitle) {
        let group = groupsByTitle.get(incoming.groupTitle);
        if (!group) {
          const siblings = childrenMap.get(null) ?? [];
          const createdGroup = await api.createCheck(selectedAssessmentId!, {
            title: incoming.groupTitle,
            description: "",
            parent_check_id: null,
            sort_order: siblings.length,
            is_group: true,
            is_checked: false,
            priority: "MEDIUM",
            status: "NOT_STARTED",
            reason: null,
            source: "OTHER",
          });
          group = createdGroup;
          groupsByTitle.set(incoming.groupTitle, createdGroup);
        }
        parentId = group.id;
      }
      await createCheck({
        title: incoming.title,
        description: incoming.description,
        parent_check_id: parentId,
        status: incoming.status,
      });
    }
    for (const change of diff.updated) {
      await api.updateCheck(change.current.id, {
        title: change.incoming.title,
        description: change.incoming.description,
        status: change.incoming.status,
      });
    }
    setMarkdownImportOpen(false);
    setMarkdownDraft("");
    await reload();
  };

  const renderNodeLine = ({ node: row, depth, hasChildren, isCollapsed, toggle }: TreeRenderArgs<CheckRecord>) => {
    const children = (childrenMap.get(row.id) ?? []).filter((child) => !visibleIds || visibleIds.has(child.id));
    const isSelected = selectedIds.has(row.id);
    const isDropInside = dropTarget === `inside:${row.id}`;
    const marker = statusMarker(row.status);
    const linkedCases = checkCaseMap.get(row.id) ?? [];
    const visibleCases = linkedCases.slice(0, 2);
    const hiddenCasesCount = Math.max(0, linkedCases.length - visibleCases.length);
    const isEditing = inlineEditingId === row.id;
    return (
      <>
        <DropZone
          active={dropTarget === `before:${row.id}`}
          compact
          onDragOver={(event) => {
            event.preventDefault();
            setDropTarget(`before:${row.id}`);
          }}
          onDrop={(event) => {
            event.preventDefault();
            const parentId = row.parent_check_id ?? null;
            const siblings = childrenMap.get(parentId) ?? [];
            const index = siblings.findIndex((item) => item.id === row.id);
            void handleDropMove(event.dataTransfer.getData("text/plain"), { parentId, index: index < 0 ? siblings.length : index });
          }}
        />
        <ContextMenu>
          <ContextMenuTrigger>
            <div
              className={`tree-node ${depth ? "has-parent" : ""} ${isSelected ? "is-selected" : ""} ${isDropInside ? "is-drop-inside" : ""}`}
              onClick={(event) => selectRow(row, event.shiftKey)}
              onContextMenu={() => {
                if (!selectedIds.has(row.id)) {
                  setSelectedIds(new Set([row.id]));
                }
                setSelectionAnchorId(row.id);
                setSelectedId(row.id);
              }}
              data-selected={isSelected ? "true" : "false"}
              draggable={!isEditing}
              onDragStart={(event) => {
                if (isEditing) {
                  event.preventDefault();
                  return;
                }
                event.dataTransfer.setData("text/plain", row.id);
              }}
              onDragEnd={() => {
                setDropTarget("");
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDropTarget(`inside:${row.id}`);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const movedId = event.dataTransfer.getData("text/plain");
                void handleDropMove(movedId, { parentId: row.id, index: children.length });
              }}
            >
              <TreeExpander hasChildren={hasChildren} isCollapsed={isCollapsed} onToggle={toggle} />
              {row.is_group ? (
                <span className="tree-checkbox-placeholder" aria-hidden="true" />
              ) : (
                <label className="tree-checkbox">
                  <input type="checkbox" checked={Boolean(row.is_checked)} onChange={(event) => { void toggleChecked(row, event.target.checked); }} />
                </label>
              )}
              <div className="tree-node-main">
                <div className="tree-title-row">
                  <button className={`tree-add-icon ${addingChildFor === row.id ? "is-visible" : ""}`} type="button" onClick={() => setAddingChildFor((current) => current === row.id ? "" : row.id)} title="Add child" aria-label="Add child">⊕</button>
                  {!row.is_group && marker ? <span className={`tree-problem-marker tree-status-icon ${marker.className}`} title={row.status} aria-label={row.status}>{marker.glyph}</span> : null}
                  {row.is_group ? (
                    isEditing ? (
                      <InlineEditableText editing selectOnFocus={false} value={row.title} onSave={(value) => saveInlineTitle(row, value)} onCancel={() => setInlineEditingId("")} className="tree-inline-editor" />
                    ) : (
                      <span className={`tree-group-title-button ${isSelected ? "is-active" : ""}`} onDoubleClick={() => setInlineEditingId(row.id)}>
                        {row.title}
                      </span>
                    )
                  ) : (
                    isEditing ? (
                      <InlineEditableText editing selectOnFocus={false} value={row.title} onSave={(value) => saveInlineTitle(row, value)} onCancel={() => setInlineEditingId("")} className="tree-inline-editor" />
                    ) : (
                      <SelectableNameButton selected={isSelected} onClick={() => selectRow(row, false)}>
                        <span onDoubleClick={() => setInlineEditingId(row.id)}>{row.title}</span>
                      </SelectableNameButton>
                    )
                  )}
                  {visibleCases.length ? (
                    <span className="tree-linked-cases" title={linkedCases.map((item) => item.title).join(" · ")}>
                      {visibleCases.map((item) => item.title).join(" · ")}
                      {hiddenCasesCount ? ` · +${hiddenCasesCount}` : ""}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={() => {
              setSelectedId(row.id);
              setIsEditOpen(true);
            }}>
              {row.description?.trim() ? "Edit description" : "Add description"}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => setInlineEditingId(row.id)}>
              Rename
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => openCaseMapping(row)}>
              {linkedCases.length ? "Edit case mapping" : "Map to cases"}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => {
              setBulkDraft("");
              setBulkAddTargetRowId(row.id);
              setBulkAddTargetId(row.is_group ? row.id : (row.parent_check_id ?? null));
            }}>
              Add checks in bulk
            </ContextMenuItem>
            <ContextMenuSeparator />
            {!row.is_group ? (
              <>
                <ContextMenuItem danger onSelect={() => { void deleteCheckRow(row); }}>
                  {selectedIds.has(row.id) && selectedCheckIds.length > 1 ? `Delete selected (${selectedCheckIds.length})` : "Delete check"}
                </ContextMenuItem>
                <ContextMenuSeparator />
                {CHECK_STATUSES.map((status) => (
                  <ContextMenuItem key={status} active={row.status === status} onSelect={() => setRowStatus(row, status)}>
                    <span className="context-menu-item-label">
                      {statusMarker(status) ? (
                        <span className={`tree-problem-marker context-menu-status-marker ${statusMarker(status)?.className}`} aria-hidden="true">
                          {statusMarker(status)?.glyph}
                        </span>
                      ) : (
                        <span className="context-menu-status-marker is-empty" aria-hidden="true" />
                      )}
                      <span>{status}</span>
                    </span>
                  </ContextMenuItem>
                ))}
                <ContextMenuSeparator />
              </>
            ) : null}
            <ContextMenuSubmenu label="Group" icon={folderMenuIcon()}>
              {row.is_group ? (
                <ContextMenuItem
                  icon={checkMenuIcon()}
                  closeOnSelect={false}
                  onSelect={() => setInlineEditingId(row.id)}
                >
                  Rename group
                </ContextMenuItem>
              ) : null}
              <ContextMenuItem
                icon={row.is_group ? checkMenuIcon() : switchMenuIcon()}
                onSelect={async () => {
                  await api.updateCheck(row.id, { is_group: !row.is_group, is_checked: row.is_group ? Boolean(row.is_checked) : false });
                  await reload();
                }}
              >
                {row.is_group ? "Convert to check" : "Convert to group"}
              </ContextMenuItem>
              <ContextMenuItem
                icon={plusMenuIcon()}
                onSelect={async () => {
                  const title = createGroupTitle(window.prompt("Child group title") ?? "");
                  if (!title) {
                    return;
                  }
                  await createCheck({ title, parent_check_id: row.id, is_group: true });
                }}
              >
                Add child group
              </ContextMenuItem>
            </ContextMenuSubmenu>
          </ContextMenuContent>
        </ContextMenu>
      </>
    );
  };

  const renderNodeAfterLine = ({ node: row }: TreeRenderArgs<CheckRecord>) => {
    if (addingChildFor !== row.id) {
      return null;
    }
    return (
      <>
        {addingChildFor === row.id ? (
          <form
            className="tree-inline-create"
            style={{ marginLeft: 30 }}
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const title = String(form.get("title") ?? "").trim();
              if (!title) {
                return;
              }
              await createCheck({
                title,
                parent_check_id: row.id,
              });
              setAddingChildFor("");
            }}
          >
            <input
              name="title"
              placeholder="Child check title"
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setAddingChildFor("");
                  setSelectedId(row.id);
                }
              }}
            />
            <button className="mini-confirm-btn" type="submit">Add</button>
            <button className="mini-cancel-btn" type="button" onClick={() => setAddingChildFor("")}>Cancel</button>
          </form>
        ) : null}
      </>
    );
  };

  return (
    <main>
      <SectionHeader title="Checks" detail="Tree view with drag-and-drop, checkboxes, and fast sub-check creation." />
      <div className="cases-summary-strip">
        {[
          { key: "all", label: "All", value: rows.length },
          { key: "checks", label: "Checks", value: rows.filter((row) => !row.is_group).length },
          { key: "groups", label: "Groups", value: rows.filter((row) => row.is_group).length },
          { key: "open", label: "Open", value: rows.filter((row) => !row.is_group && OPEN_STATUSES.includes(row.status)).length },
          { key: "completed", label: "Completed", value: rows.filter((row) => !row.is_group && (row.is_checked || row.status === "CHECKED_OK")).length },
        ].map((item) => (
          <button
            key={item.key}
            className={`cases-summary-chip cases-summary-chip-button ${activeFilter === item.key ? "is-active" : ""}`}
            type="button"
            onClick={() => setActiveFilter(item.key as CheckFilter)}
          >
            {item.label} {item.value}
          </button>
        ))}
      </div>
      {error ? <div className="error-text">{error}</div> : null}
      <ResourceCard
        title="Check Tree"
        actions={
          <>
            <button className="btn btn-subtle btn-small" type="button" onClick={() => setCreateRootKind("check")}>New Root Check</button>
            <button className="btn btn-subtle btn-small" type="button" onClick={() => setCreateRootKind("group")}>New Root Group</button>
            <button className="btn btn-subtle btn-small" type="button" onClick={() => setMarkdownExportOpen(true)}>Export Markdown</button>
            <button className="btn btn-subtle btn-small" type="button" onClick={() => setMarkdownImportOpen(true)}>Import Markdown</button>
            <button className="btn btn-subtle btn-small" type="button" disabled={!selectedCheckIds.length} onClick={() => {
              const target = rows.find((row) => row.id === selectedCheckIds[0]);
              if (target) {
                void setRowStatus(target, "CHECKED_OK");
              }
            }}>Mark OK</button>
            <button className="btn btn-subtle btn-small" type="button" disabled={!selectedCheckIds.length} onClick={() => { void deleteSelectedChecks(); }}>Delete selected</button>
            <button className="btn btn-small" type="button" disabled={!selected} onClick={() => setIsEditOpen(true)}>Edit</button>
          </>
        }
      >
        <div className="tree-root-drop">
          <DropZone
            active={dropTarget === "root"}
            onDragOver={(event) => {
              event.preventDefault();
              setDropTarget("root");
            }}
            onDrop={(event) => {
              event.preventDefault();
              void handleDropMove(event.dataTransfer.getData("text/plain"), { parentId: null, index: rootChecks.length });
            }}
          />
        </div>
        {visibleRootChecks.length ? (
          <div className="check-tree">
            <TreeView
              roots={visibleRootChecks}
              getId={(row) => row.id}
              getChildren={(row) => (childrenMap.get(row.id) ?? []).filter((child) => !visibleIds || visibleIds.has(child.id))}
              collapsedIds={collapsedIds}
              onToggle={toggleCollapsed}
              renderLine={renderNodeLine}
              renderAfterLine={renderNodeAfterLine}
              variant="check"
            />
          </div>
        ) : (
          <EmptyState title="No checks" detail="No rows match the selected filter." />
        )}
      </ResourceCard>
      {createRootKind ? (
        <ModalShell
          title={createRootKind === "group" ? "New Root Group" : "New Root Check"}
          subtitle={createRootKind === "group" ? "Group rows keep related checks together." : "Root checks stay at the top level of the tree."}
          onClose={() => setCreateRootKind(null)}
          isDirty={isCreateRootDirty}
          closeWarningDetail="This draft has unsaved fields."
        >
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              const title = createRootDraft.title.trim();
              if (!title) {
                return;
              }
              await createCheck({
                title,
                description: createRootDraft.description.trim(),
                is_group: createRootKind === "group",
              });
              setCreateRootKind(null);
            }}
          >
            <Field label="Title">
              <input
                name="title"
                autoFocus
                required
                value={createRootDraft.title}
                onChange={(event) => setCreateRootDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </Field>
            <Field label="Description">
              <textarea
                name="description"
                rows={3}
                value={createRootDraft.description}
                onChange={(event) => setCreateRootDraft((current) => ({ ...current, description: event.target.value }))}
              />
            </Field>
            <div className="inline-actions modal-actions">
              <button className="btn btn-small" type="submit">
                {plusButtonIcon()}
                <span>{createRootKind === "group" ? "Create group" : "Create check"}</span>
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}
      {isEditOpen && selected ? (
        <ModalShell
          title={selected.title}
          subtitle={selected.is_group ? "Group" : (selected.category ?? "Uncategorized")}
          onClose={() => setIsEditOpen(false)}
          isDirty={isEditDirty}
          closeWarningDetail="The current check form has unsaved edits."
        >
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              await api.updateCheck(selected.id, {
                title: editDraft.title,
                description: editDraft.description,
                category: editDraft.category || null,
                check_type: selected.is_group ? null : (editDraft.check_type || null),
                priority: selected.is_group ? (selected.priority ?? "MEDIUM") : editDraft.priority,
                status: selected.is_group ? selected.status : editDraft.status,
                reason: selected.is_group ? (selected.reason ?? "") : editDraft.reason,
                is_checked: selected.is_group ? false : editDraft.is_checked,
              });
              setIsEditOpen(false);
              await reload();
            }}
          >
            <div className="form-grid-2">
              <Field label="Title">
                <input name="title" value={editDraft.title} onChange={(event) => setEditDraft((current) => ({ ...current, title: event.target.value }))} />
              </Field>
              {!selected.is_group ? (
                <Field label="Priority">
                  <select name="priority" value={editDraft.priority} onChange={(event) => setEditDraft((current) => ({ ...current, priority: event.target.value }))}>
                    {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </Field>
              ) : null}
              <Field label="Category">
                <input name="category" value={editDraft.category} onChange={(event) => setEditDraft((current) => ({ ...current, category: event.target.value }))} />
              </Field>
              {!selected.is_group ? (
                <Field label="Check type">
                  <input name="check_type" value={editDraft.check_type} onChange={(event) => setEditDraft((current) => ({ ...current, check_type: event.target.value }))} />
                </Field>
              ) : null}
              {!selected.is_group ? (
                <Field label="Status">
                  <select name="status" value={editDraft.status} onChange={(event) => setEditDraft((current) => ({ ...current, status: event.target.value }))}>
                    {CHECK_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </Field>
              ) : null}
            </div>
            {!selected.is_group ? (
              <label className="field-inline">
                <input
                  name="is_checked"
                  type="checkbox"
                  checked={editDraft.is_checked}
                  onChange={(event) => setEditDraft((current) => ({ ...current, is_checked: event.target.checked }))}
                />
                <span>Marked complete</span>
              </label>
            ) : null}
            <Field label="Description">
              <textarea name="description" rows={3} value={editDraft.description} onChange={(event) => setEditDraft((current) => ({ ...current, description: event.target.value }))} />
            </Field>
            {!selected.is_group ? (
              <Field label="Reason" hint="Required for FAILED, CHECKED_WEAK, BLOCKED, NOT_APPLICABLE">
                <textarea name="reason" rows={4} value={editDraft.reason} onChange={(event) => setEditDraft((current) => ({ ...current, reason: event.target.value }))} />
              </Field>
            ) : null}
            <div className="inline-actions modal-actions">
              <button className="btn btn-small" type="submit">
                {saveButtonIcon()}
                <span>Save</span>
              </button>
              <button className="btn btn-subtle btn-small" type="button" onClick={() => setAddingChildFor(selected.id)}>
                {plusButtonIcon()}
                <span>Add child</span>
              </button>
              <button className="btn btn-subtle btn-small" type="button" onClick={async () => {
                const title = createGroupTitle(window.prompt("Child group title") ?? "");
                if (!title) {
                  return;
                }
                await createCheck({ title, parent_check_id: selected.id, is_group: true });
              }}>
                {folderMenuIcon()}
                <span>Add group</span>
              </button>
              {!selected.is_group ? (
                <button className="btn btn-subtle btn-small" type="button" onClick={async () => {
                  await api.convertCheckToFinding(selected.id, {
                    title: editDraft.title,
                    severity: "MEDIUM",
                    finding_type: "REVIEW",
                    description: editDraft.description,
                    impact: editDraft.reason,
                    recommendation: "Investigate and remediate.",
                  });
                  setIsEditOpen(false);
                  await reload();
                }}>
                  {mergeButtonIcon()}
                  <span>To finding</span>
                </button>
              ) : null}
            </div>
          </form>
        </ModalShell>
      ) : null}
      {bulkAddTargetId !== undefined ? (
        <ModalShell
          title="Add Checks In Bulk"
          subtitle="One non-empty line becomes one check. Empty lines are ignored."
          onClose={() => {
            setBulkAddTargetId(undefined);
            setBulkAddTargetRowId("");
          }}
          isDirty={Boolean(bulkDraft.trim())}
          width="narrow"
        >
          {bulkTargetRow ? (
            <div className="small">
              Target: {bulkTargetRow.is_group ? `children of ${bulkTargetRow.title}` : `siblings under ${rows.find((row) => row.id === bulkTargetRow.parent_check_id)?.title ?? "root"}`}
            </div>
          ) : null}
          <div className="small">Add checks as a list. Each non-empty line will be created as a separate check.</div>
          <Field label="Checks list">
            <textarea rows={10} value={bulkDraft} onChange={(event) => setBulkDraft(event.target.value)} />
          </Field>
          <div className="small">Will add: {bulkChecksCount} checks</div>
          <div className="inline-actions modal-actions">
            <button className="btn btn-small" type="button" disabled={!bulkChecksCount} onClick={() => { void submitBulkChecks(); }}>
              {plusButtonIcon()}
              <span>Add checks</span>
            </button>
          </div>
        </ModalShell>
      ) : null}
      {caseMappingTarget ? (
        <ModalShell
          title="Map To Cases"
          subtitle={caseMappingTarget.title}
          onClose={() => setCaseMappingTarget(null)}
          isDirty={isCaseMappingDirty}
          width="narrow"
        >
          <div className="case-mapping-list">
            {cases.length ? cases.map((item) => (
              <label key={item.id} className="field-inline case-mapping-option">
                <input
                  type="checkbox"
                  checked={caseMappingIds.includes(item.id)}
                  onChange={(event) => {
                    setCaseMappingIds((current) => event.target.checked
                      ? [...current, item.id]
                      : current.filter((value) => value !== item.id));
                  }}
                />
                <span>{item.title}</span>
              </label>
            )) : <div className="small">No cases available.</div>}
          </div>
          <div className="inline-actions modal-actions">
            <button className="btn btn-small" type="button" onClick={() => { void saveCaseMapping(); }}>
              {saveButtonIcon()}
              <span>Save mapping</span>
            </button>
          </div>
        </ModalShell>
      ) : null}
      {markdownExportOpen ? (
        <ModalShell
          title="Export Checks To Markdown"
          subtitle="Current tree as editable Markdown"
          onClose={() => setMarkdownExportOpen(false)}
          width="narrow"
        >
          <Field label="Markdown">
            <textarea rows={16} readOnly value={exportChecksToMarkdown(rows)} />
          </Field>
        </ModalShell>
      ) : null}
      {markdownImportOpen ? (
        <ModalShell
          title="Import Checks From Markdown"
          subtitle="Preview changes before apply"
          onClose={() => setMarkdownImportOpen(false)}
          isDirty={Boolean(markdownDraft.trim())}
          width="narrow"
        >
          <Field label="Markdown">
            <textarea rows={16} value={markdownDraft} onChange={(event) => setMarkdownDraft(event.target.value)} />
          </Field>
          <div className="small">
            Added: {markdownImportPreview.added.length} · Updated: {markdownImportPreview.updated.length} · Skipped: {markdownImportPreview.skipped.length} · Errors: {markdownImportPreview.errors.length}
          </div>
          {markdownImportPreview.errors.length ? (
            <div className="error-text">{markdownImportPreview.errors.join("; ")}</div>
          ) : null}
          <div className="inline-actions modal-actions">
            <button className="btn btn-small" type="button" disabled={Boolean(markdownImportPreview.errors.length)} onClick={() => { void applyMarkdownImport(); }}>
              {plusButtonIcon()}
              <span>Apply import</span>
            </button>
          </div>
        </ModalShell>
      ) : null}
    </main>
  );
}

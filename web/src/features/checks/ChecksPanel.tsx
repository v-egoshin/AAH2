import { DragEvent, type MouseEvent as ReactMouseEvent, type MutableRefObject, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CheckRecord } from "../../api/client";
import { useWorkbench } from "@web/app/workbench";
import { EmptyState, Field, InlineEditableText, SectionHeader } from "../../components/common";
import { ContextMenu, ContextMenuContent, useContextMenu } from "../../components/context-menu";
import { ModalShell } from "../../components/modal";
import { ResourceCard } from "../../components/resource";
import { TreeView, type TreeRenderArgs } from "../../components/tree";
import { buildTreeFromFlatRows, collectTreeIds, filterTree, parseBulkChecksInput } from "../../components/tree-utils";
import {
  buildChildrenMap,
  CHECK_STATUSES,
  collectDescendants,
  createGroupTitle,
  flattenVisibleRows,
  OPEN_STATUSES,
  reorderChecks,
  statusMarker,
  type CheckFilter,
  type DropPosition,
} from "./checks-tree-utils";
import { CheckRowContextMenuContent } from "./checkTreeContextMenu";
import { CheckTreeRow, type CheckTreeRowActions } from "./CheckTreeRow";
import { checksDataSignature } from "./checksDataSignature";
import type { ChecksDataBundle, EmbedChecksHostMutations } from "./types";

type ContextMenuActions = {
  requestPointerOpen: (event: ReactMouseEvent<HTMLElement>) => void;
  requestKeyboardOpen: (target: HTMLElement) => void;
};

function ContextMenuActionsBridge({
  actionsRef,
}: {
  actionsRef: MutableRefObject<ContextMenuActions | null>;
}) {
  const { requestPointerOpen, requestKeyboardOpen } = useContextMenu();
  useEffect(() => {
    actionsRef.current = { requestPointerOpen, requestKeyboardOpen };
    return () => {
      actionsRef.current = null;
    };
  }, [actionsRef, requestPointerOpen, requestKeyboardOpen]);
  return null;
}

export type ChecksPanelProps = {
  assessmentId: string;
  variant?: "page" | "embed";
  refreshToken?: number;
  preloadedData?: ChecksDataBundle | null;
  preloadedError?: string | null;
  onRequestReload?: () => void;
  onGraphMutated?: (options?: { syncRelations?: boolean }) => void;
  hostMutations?: EmbedChecksHostMutations;
  selectedId?: string;
  onSelectedIdChange?: (id: string) => void;
};

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

export function ChecksPanel({
  assessmentId,
  variant = "page",
  refreshToken,
  preloadedData,
  preloadedError,
  onRequestReload,
  onGraphMutated,
  hostMutations,
  selectedId: selectedIdProp,
  onSelectedIdChange,
}: ChecksPanelProps) {
  const { api } = useWorkbench();
  const isEmbed = variant === "embed" && Boolean(onRequestReload);
  const [rows, setRows] = useState<CheckRecord[]>(() => preloadedData?.checks ?? []);
  const [cases, setCases] = useState(() => preloadedData?.cases ?? []);
  const [relations, setRelations] = useState(() => preloadedData?.relations ?? []);
  const [internalSelectedId, setInternalSelectedId] = useState("");
  const selectedId = selectedIdProp ?? internalSelectedId;
  const setSelectedId = onSelectedIdChange ?? setInternalSelectedId;
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
  const [contextMenuRow, setContextMenuRow] = useState<CheckRecord | null>(null);
  const contextMenuActionsRef = useRef<ContextMenuActions | null>(null);
  const rowActionsRef = useRef<CheckTreeRowActions>({} as CheckTreeRowActions);
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const isDraggingRef = useRef(false);
  const bundleSignatureRef = useRef("");

  const applyBundle = (bundle: ChecksDataBundle) => {
    const signature = checksDataSignature(bundle);
    if (signature === bundleSignatureRef.current) {
      return;
    }
    bundleSignatureRef.current = signature;
    setRows(bundle.checks);
    setCases(bundle.cases);
    setRelations(bundle.relations);
    if (!selectedId && bundle.checks[0]?.id) {
      setSelectedId(bundle.checks[0].id);
    }
    setError("");
  };

  const reload = async () => {
    if (!assessmentId) {
      return;
    }
    if (isEmbed) {
      onRequestReload?.();
      return;
    }
    try {
      const [checkRows, caseRows, relationRows] = await Promise.all([
        api.getChecks(assessmentId),
        api.getCases(assessmentId),
        api.getRelations(assessmentId),
      ]);
      applyBundle({ checks: checkRows, cases: caseRows, relations: relationRows });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const notifyMutated = async (options?: { syncRelations?: boolean }) => {
    if (isEmbed && hostMutations) {
      if (options?.syncRelations) {
        onGraphMutated?.({ syncRelations: true });
      }
      return;
    }
    if (isEmbed) {
      onRequestReload?.();
      return;
    }
    await reload();
    if (options?.syncRelations) {
      onGraphMutated?.({ syncRelations: true });
    }
  };

  useEffect(() => {
    if (isEmbed) {
      if (preloadedData) {
        applyBundle(preloadedData);
      }
      if (preloadedError) {
        setError(preloadedError);
      }
      return;
    }
    void reload();
  }, [assessmentId, refreshToken, isEmbed, preloadedError]);

  const createCheckRecord = async (payload: Record<string, unknown>) => {
    if (hostMutations) {
      return hostMutations.createCheck(assessmentId, payload);
    }
    return api.createCheck(assessmentId, payload);
  };

  const updateCheckRecord = async (checkId: string, payload: Record<string, unknown>) => {
    if (hostMutations) {
      await hostMutations.updateCheck(checkId, payload);
      return;
    }
    await api.updateCheck(checkId, payload);
  };

  const deleteCheckRecord = async (checkId: string) => {
    if (hostMutations) {
      await hostMutations.deleteCheck(checkId);
      return;
    }
    await api.deleteCheck(checkId);
  };

  const createRelationRecord = async (payload: Record<string, unknown>) => {
    if (hostMutations) {
      await hostMutations.createRelation(assessmentId, payload);
      return;
    }
    await api.createRelation(assessmentId, payload);
  };

  const deleteRelationRecord = async (relationId: string) => {
    if (hostMutations) {
      await hostMutations.deleteRelation(relationId);
      return;
    }
    await api.deleteRelation(relationId);
  };

  const convertCheckRecord = async (checkId: string, payload: Record<string, unknown>) => {
    if (hostMutations) {
      await hostMutations.convertCheckToFinding(checkId, payload);
      return;
    }
    await api.convertCheckToFinding(checkId, payload);
  };

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
  const rowDisplayById = useMemo(() => {
    const map = new Map<string, {
      linkedCasesLabel: string;
      linkedCasesTitle: string;
      childCount: number;
      statusMarkerClass?: string;
      statusMarkerGlyph?: string | number;
      statusLabel: string;
    }>();
    for (const row of rows) {
      const linkedCases = checkCaseMap.get(row.id) ?? [];
      const visibleCases = linkedCases.slice(0, 2);
      const hiddenCasesCount = Math.max(0, linkedCases.length - visibleCases.length);
      const linkedCasesLabel = visibleCases.length
        ? `${visibleCases.map((item) => item.title).join(" · ")}${hiddenCasesCount ? ` · +${hiddenCasesCount}` : ""}`
        : "";
      const marker = statusMarker(row.status);
      map.set(row.id, {
        linkedCasesLabel,
        linkedCasesTitle: linkedCases.map((item) => item.title).join(" · "),
        childCount: (childrenMap.get(row.id) ?? []).filter((child) => !visibleIds || visibleIds.has(child.id)).length,
        statusMarkerClass: marker?.className,
        statusMarkerGlyph: marker?.glyph,
        statusLabel: row.status,
      });
    }
    return map;
  }, [rows, checkCaseMap, childrenMap, visibleIds]);
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
    await Promise.all(changed.map((row) => updateCheckRecord(row.id, { parent_check_id: row.parent_check_id ?? null, sort_order: row.sort_order ?? 0 })));
    await notifyMutated();
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
      await notifyMutated();
    }
  };

  const handleDropMoveMany = async (rawMoved: string, target: DropPosition) => {
    let movedIds: string[] = [];
    try {
      const parsed = JSON.parse(rawMoved) as unknown;
      movedIds = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      movedIds = rawMoved ? [rawMoved] : [];
    }
    const uniqueIds = [...new Set(movedIds)].filter((id) => rows.some((row) => row.id === id));
    if (uniqueIds.length <= 1) {
      await handleDropMove(uniqueIds[0] ?? "", target);
      return;
    }
    const movingSet = new Set(uniqueIds);
    const roots = uniqueIds.filter((id) => {
      const row = rows.find((item) => item.id === id);
      return row && (!row.parent_check_id || !movingSet.has(row.parent_check_id));
    });
    if (!roots.length || roots.includes(target.parentId ?? "")) {
      return;
    }
    if (target.parentId && roots.some((id) => collectDescendants(rows, id).has(target.parentId!))) {
      return;
    }
    let nextRows = rows;
    roots.forEach((id, offset) => {
      nextRows = reorderChecks(nextRows, id, { parentId: target.parentId, index: target.index + offset });
    });
    setDropTarget("");
    try {
      await persistTreeLayout(nextRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await notifyMutated();
    }
  };

  const selectedParentId = () => selected?.id ?? null;

  const createCheck = async (payload: Partial<CheckRecord> & { title: string; parent_check_id?: string | null }) => {
    if (!assessmentId) {
      setError("Select assessment first");
      return;
    }
    const siblings = childrenMap.get(payload.parent_check_id ?? null) ?? [];
    const nextSortOrder = siblings.length
      ? Math.max(...siblings.map((item) => item.sort_order ?? 0)) + 1
      : 0;
    const created = await createCheckRecord({
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
    await notifyMutated();
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
      return updateCheckRecord(targetRow.id, {
        is_checked: checked,
        status: nextStatus,
      });
    }));
    await notifyMutated();
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
      return updateCheckRecord(targetRow.id, { status, is_checked: nextChecked });
    }));
    await notifyMutated();
  };

  const saveInlineTitle = async (row: CheckRecord, title: string) => {
    const nextTitle = title.trim();
    setInlineEditingId("");
    if (!nextTitle || nextTitle === row.title) {
      return;
    }
    await updateCheckRecord(row.id, { title: nextTitle });
    await notifyMutated();
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
    await deleteCheckRecord(row.id);
    setSelectedId(row.parent_check_id ?? null);
    await notifyMutated();
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
      await deleteCheckRecord(id);
    }
    setSelectedIds(new Set());
    setSelectedId("");
    await notifyMutated();
  };

  const selectRow = (row: CheckRecord, shiftKey: boolean) => {
    if (!shiftKey && selectedIds.size === 1 && selectedIds.has(row.id)) {
      if (selectionAnchorId !== row.id) {
        setSelectionAnchorId(row.id);
      }
      return;
    }
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
    if (!assessmentId) {
      setError("Select assessment first");
      return;
    }
    const titles = parseBulkChecksInput(bulkDraft);
    if (!titles.length) {
      return;
    }
    const effectiveParentId = bulkTargetRow?.id ?? null;
    for (const title of titles) {
      await createCheck({
        title,
        parent_check_id: effectiveParentId,
      });
    }
    const expandTargetId = bulkTargetRow?.id ?? null;
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
    if (!assessmentId || !caseMappingTarget) {
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
        await deleteRelationRecord(relation.id);
      }
    }
    for (const caseId of nextIds) {
      if (!currentIds.has(caseId)) {
        await createRelationRecord( {
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
    await notifyMutated({ syncRelations: true });
  };

  const handleContextMenuOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setContextMenuRow(null);
    }
  }, []);

  const handleDragOver = useCallback((target: string) => (event: DragEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) {
      return;
    }
    event.preventDefault();
    setDropTarget(target);
  }, []);

  const selectRowForContextMenu = useCallback((row: CheckRecord) => {
    setContextMenuRow(row);
    if (!selectedIds.has(row.id)) {
      setSelectedIds(new Set([row.id]));
    }
    setSelectionAnchorId(row.id);
    setSelectedId(row.id);
  }, [selectedIds, setSelectedId]);

  rowActionsRef.current = {
    selectRow,
    toggleChecked,
    saveInlineTitle,
    setInlineEditingId,
    toggleCollapsed,
    toggleAddingChild: (rowId: string) => {
      setAddingChildFor((current) => current === rowId ? "" : rowId);
    },
    openContextMenuFromPointer: (row, event) => {
      selectRowForContextMenu(row);
      contextMenuActionsRef.current?.requestPointerOpen(event);
    },
    openContextMenuFromKeyboard: (row, target) => {
      selectRowForContextMenu(row);
      contextMenuActionsRef.current?.requestKeyboardOpen(target);
    },
    handleDragOver,
    handleDropBefore: (row, movedId) => {
      isDraggingRef.current = false;
      const parentId = row.parent_check_id ?? null;
      const siblings = childrenMap.get(parentId) ?? [];
      const index = siblings.findIndex((item) => item.id === row.id);
      void handleDropMoveMany(movedId, { parentId, index: index < 0 ? siblings.length : index });
    },
    handleDropInside: (row, movedId, childCount) => {
      isDraggingRef.current = false;
      void handleDropMoveMany(movedId, { parentId: row.id, index: childCount });
    },
    handleDragStart: (rowId, isEditing, event) => {
      if (isEditing) {
        event.preventDefault();
        return;
      }
      isDraggingRef.current = true;
      const payload = selectedIdsRef.current.has(rowId) && selectedIdsRef.current.size > 1 ? [...selectedIdsRef.current] : [rowId];
      event.dataTransfer.setData("text/plain", JSON.stringify(payload));
    },
    handleDragEnd: () => {
      isDraggingRef.current = false;
      setDropTarget("");
    },
  };

  const renderNodeLine = useCallback(({ node: row, depth, hasChildren, isCollapsed }: TreeRenderArgs<CheckRecord>) => {
    const display = rowDisplayById.get(row.id);
    const linkedCasesLabel = display?.linkedCasesLabel ?? "";
    const linkedCasesTitle = display?.linkedCasesTitle ?? "";
    const childCount = display?.childCount ?? 0;

    return (
      <CheckTreeRow
        row={row}
        depth={depth}
        hasChildren={hasChildren}
        isCollapsed={isCollapsed}
        isSelected={selectedIdsRef.current.has(row.id)}
        isDropInside={dropTarget === `inside:${row.id}`}
        isEditing={inlineEditingId === row.id}
        showAddChild={addingChildFor === row.id}
        dropBeforeActive={dropTarget === `before:${row.id}`}
        linkedCasesLabel={linkedCasesLabel}
        linkedCasesTitle={linkedCasesTitle}
        childCount={childCount}
        statusMarkerClass={display?.statusMarkerClass}
        statusMarkerGlyph={display?.statusMarkerGlyph}
        statusLabel={display?.statusLabel ?? row.status}
        actionsRef={rowActionsRef}
      />
    );
  }, [
    addingChildFor,
    dropTarget,
    inlineEditingId,
    rowDisplayById,
  ]);

  const renderNodeAfterLine = useCallback(({ node: row }: TreeRenderArgs<CheckRecord>) => {
    if (addingChildFor !== row.id) {
      return null;
    }
    return (
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
    );
  }, [addingChildFor, createCheck, setAddingChildFor, setSelectedId]);

  const summaryCounts = useMemo(() => ({
    all: rows.length,
    checks: rows.filter((row) => !row.is_group).length,
    groups: rows.filter((row) => row.is_group).length,
    open: rows.filter((row) => !row.is_group && OPEN_STATUSES.includes(row.status)).length,
    completed: rows.filter((row) => !row.is_group && (row.is_checked || row.status === "CHECKED_OK")).length,
  }), [rows]);

  const summaryStrip = (
      <div className="cases-summary-strip">
        {[
          { key: "all", label: "All", value: summaryCounts.all },
          { key: "checks", label: "Checks", value: summaryCounts.checks },
          { key: "groups", label: "Groups", value: summaryCounts.groups },
          { key: "open", label: "Open", value: summaryCounts.open },
          { key: "completed", label: "Completed", value: summaryCounts.completed },
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
  );

  const treeBlock = (
    <ContextMenu onOpenChange={handleContextMenuOpenChange}>
      <>
      <ContextMenuActionsBridge actionsRef={contextMenuActionsRef} />
      <div className="tree-root-drop">
        <DropZone
          active={dropTarget === "root"}
          onDragOver={(event) => {
            if (!isDraggingRef.current) {
              return;
            }
            event.preventDefault();
            setDropTarget("root");
          }}
          onDrop={(event) => {
            event.preventDefault();
            isDraggingRef.current = false;
            void handleDropMoveMany(event.dataTransfer.getData("text/plain"), { parentId: null, index: rootChecks.length });
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
      <ContextMenuContent>
        {contextMenuRow ? (
          <CheckRowContextMenuContent
            row={contextMenuRow}
            linkedCases={checkCaseMap.get(contextMenuRow.id) ?? []}
            selectedCheckIdsCount={selectedCheckIds.length}
            isRowSelected={selectedIds.has(contextMenuRow.id)}
            onEditDescription={() => {
              setSelectedId(contextMenuRow.id);
              setIsEditOpen(true);
            }}
            onRename={() => setInlineEditingId(contextMenuRow.id)}
            onMapCases={() => openCaseMapping(contextMenuRow)}
            onAddChildCheck={() => setAddingChildFor(contextMenuRow.id)}
            onBulkAdd={() => {
              setBulkDraft("");
              setBulkAddTargetRowId(contextMenuRow.id);
              setBulkAddTargetId(contextMenuRow.id);
            }}
            onDelete={() => {
              void (selectedIds.has(contextMenuRow.id) && selectedCheckIds.length > 1
                ? deleteSelectedChecks()
                : deleteCheckRow(contextMenuRow));
            }}
            onSetStatus={(status) => { void setRowStatus(contextMenuRow, status); }}
            onToggleGroup={async () => {
              await updateCheckRecord(contextMenuRow.id, { is_group: !contextMenuRow.is_group, is_checked: contextMenuRow.is_group ? Boolean(contextMenuRow.is_checked) : false });
              await notifyMutated();
            }}
            onAddChildGroup={async () => {
              const title = createGroupTitle(window.prompt("Child group title") ?? "");
              if (!title) {
                return;
              }
              await createCheck({ title, parent_check_id: contextMenuRow.id, is_group: true });
            }}
            onRenameGroup={() => setInlineEditingId(contextMenuRow.id)}
          />
        ) : null}
      </ContextMenuContent>
      </>
    </ContextMenu>
  );

  const modals = (
    <>
      {createRootKind ? (
        <ModalShell
          title={createRootKind === "group" ? "+ Group" : "+ Check"}
          subtitle={selected ? `Create under ${selected.title}` : "Create at root level."}
          onClose={() => setCreateRootKind(null)}
          isDirty={isCreateRootDirty}
          closeWarningDetail="This draft has unsaved fields."
          width="narrow"
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
                parent_check_id: selectedParentId(),
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
          width="narrow"
        >
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              await updateCheckRecord(selected.id, {
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
              await notifyMutated();
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
              {!selected.is_group ? (
                <button className="btn btn-subtle btn-small" type="button" onClick={async () => {
                  await convertCheckRecord(selected.id, {
                    title: editDraft.title,
                    severity: "MEDIUM",
                    finding_type: "REVIEW",
                    description: editDraft.description,
                    impact: editDraft.reason,
                    recommendation: "Investigate and remediate.",
                  });
                  setIsEditOpen(false);
                  await notifyMutated();
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
              Target: children of {bulkTargetRow.title}
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
    </>
  );

  if (variant === "embed") {
    return (
      <div className="checks-embed">
        {summaryStrip}
        {error ? <div className="error-text">{error}</div> : null}
        <div className="checks-embed-toolbar inline-actions">
                    <>
            <button className="btn btn-subtle btn-small" type="button" onClick={() => setCreateRootKind("check")}>+ Check</button>
            <button className="btn btn-subtle btn-small" type="button" onClick={() => setCreateRootKind("group")}>+ Group</button>
          </>
        </div>
        {treeBlock}
        {modals}
      </div>
    );
  }

  return (
    <main>
      <SectionHeader title="Checks" detail="Tree view with drag-and-drop, checkboxes, and fast sub-check creation." />
      {summaryStrip}
      {error ? <div className="error-text">{error}</div> : null}
      <ResourceCard
        title="Check Tree"
        actions={(
          <>
            <button className="btn btn-subtle btn-small" type="button" onClick={() => setCreateRootKind("check")}>+ Check</button>
            <button className="btn btn-subtle btn-small" type="button" onClick={() => setCreateRootKind("group")}>+ Group</button>
          </>
        )}
      >
        {treeBlock}
      </ResourceCard>
      {modals}
    </main>
  );
}

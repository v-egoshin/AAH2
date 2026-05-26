import { DragEvent, KeyboardEvent, MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useWorkbench } from "@web/app/workbench";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../../components/context-menu";
import { EntityDeadEndBadge } from "../../components/EntityDeadEndBadge";
import { EntityKindIcon } from "../../components/EntityKindIcon";
import { ResourceCard } from "../../components/resource";
import { TreeExpander, TreeView, type TreeRenderArgs } from "../../components/tree";
import { EntityNavLink } from "../../pages/utils";
import { HighlightedSnippet } from "./HighlightedSnippet";
import type { RelationRecord } from "../../api/client";
import type { CaseGraphDataBundle, GraphNode, RelationDescriptionModalState, RelationDisplayModalState, RelationDropState } from "./types";
import { useCaseGraphData } from "./useCaseGraphData";
import {
  parseLocatorParts,
  resolveOpenTargetFromParts,
  type OpenLocatorTarget,
} from "../../lib/assetPath";

export type { OpenLocatorTarget } from "../../lib/assetPath";

export type EmbedHostMutations = {
  movePartOf: (payload: {
    subjectType: string;
    subjectId: string;
    objectType: string;
    objectId: string;
    relations: RelationRecord[];
  }) => Promise<void>;
  updateDescription: (payload: {
    relationId: string;
    entityType: string;
    entityId: string;
    properties: Record<string, unknown>;
    note: string | null;
  }) => Promise<void>;
  updateDisplayName: (payload: {
    relationId: string;
    properties: Record<string, unknown>;
  }) => Promise<void>;
  deleteRelation: (relationId: string) => Promise<void>;
  createCheckFromNode: (payload: {
    caseId: string;
    entityType: string;
    entityId: string;
    label: string;
    userDescription: string;
  }) => Promise<void>;
  toggleDeadEnd: (payload: {
    markIds: string[];
    isDeadEnd: boolean;
  }) => Promise<void>;
  patchRelationPropertiesBatch: (payload: {
    patches: Array<{ relationId: string; properties: Record<string, unknown> }>;
  }) => Promise<void>;
};

const ENTITY_DRAG_MIME = "application/x-aah2-entity";

function entityDragPayload(entityType: string, entityId: string) {
  return JSON.stringify({ entityType, entityId });
}

function setEntityDragData(dataTransfer: DataTransfer, entityType: string, entityId: string) {
  const payload = entityDragPayload(entityType, entityId);
  dataTransfer.setData(ENTITY_DRAG_MIME, payload);
  dataTransfer.setData("text/plain", payload);
  dataTransfer.effectAllowed = "move";
}

function readEntityDragData(dataTransfer: DataTransfer) {
  return dataTransfer.getData(ENTITY_DRAG_MIME) || dataTransfer.getData("text/plain");
}

function mutationErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number) {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function locatorMatchesRange(locator: string | null | undefined, file: string, startLine: number, endLine: number) {
  if (!locator) {
    return false;
  }
  const match = locator.match(/^(.*?)(?::(\d+))?(?::(\d+))?$/);
  if (!match?.[1]) {
    return false;
  }
  const locatorFile = match[1].replace(/^\//, "");
  const activeFile = file.replace(/^\//, "");
  const locatorLine = match[2] ? Number(match[2]) : null;
  // Locators without a line must not track the editor caret (would highlight every entity in that file).
  if (locatorLine === null) {
    return false;
  }
  return (activeFile.endsWith(locatorFile) || locatorFile.endsWith(activeFile))
    && rangesOverlap(locatorLine, locatorLine, startLine, endLine);
}

function rangeMatchesActive(
  range: GraphNode["range"],
  activeLocator: { file: string; startLine: number; endLine: number },
) {
  if (!range?.file || typeof range.start_line !== "number") {
    return false;
  }
  const rangeFile = range.file.replace(/^\//, "");
  const activeFile = activeLocator.file.replace(/^\//, "");
  const rangeEnd = typeof range.end_line === "number" ? range.end_line : range.start_line;
  return (activeFile.endsWith(rangeFile) || rangeFile.endsWith(activeFile))
    && rangesOverlap(range.start_line, rangeEnd, activeLocator.startLine, activeLocator.endLine);
}

function nodeMatchesActiveRange(node: GraphNode, activeLocator: { file: string; startLine: number; endLine: number } | null | undefined) {
  if (!activeLocator) {
    return false;
  }
  if (rangeMatchesActive(node.range, activeLocator)) {
    return true;
  }
  if (locatorMatchesRange(node.locator, activeLocator.file, activeLocator.startLine, activeLocator.endLine)) {
    return true;
  }
  return false;
}

type FlatTreeNode = {
  nodeKey: string;
  node: GraphNode;
  hasChildren: boolean;
};

function graphNodeKey(node: GraphNode) {
  return `${node.entityType}:${node.entityId}`;
}

function findGraphParent(root: GraphNode, targetKey: string): GraphNode | null {
  for (const child of root.children) {
    if (graphNodeKey(child) === targetKey) {
      return root;
    }
    const inner = findGraphParent(child, targetKey);
    if (inner !== null) {
      return inner;
    }
  }
  return null;
}

function flattenVisibleNodes(roots: GraphNode[], collapsedIds: Set<string>): FlatTreeNode[] {
  const result: FlatTreeNode[] = [];
  const visit = (node: GraphNode) => {
    const nodeKey = graphNodeKey(node);
    const children = node.children;
    const hasChildren = children.length > 0;
    result.push({ nodeKey, node, hasChildren });
    if (hasChildren && !collapsedIds.has(nodeKey)) {
      for (const child of children) {
        visit(child);
      }
    }
  };
  for (const root of roots) {
    visit(root);
  }
  return result;
}

function collectMarkIdsInSubtree(node: GraphNode): string[] {
  const ids: string[] = [];
  const visit = (current: GraphNode) => {
    if (current.entityType.toUpperCase() === "MARK") {
      ids.push(current.entityId);
    }
    for (const child of current.children) {
      visit(child);
    }
  };
  visit(node);
  return ids;
}

function buildNodeOpenTarget(node: GraphNode): OpenLocatorTarget | null {
  const filePath = String(node.range?.file ?? "").trim()
    || parseLocatorParts(String(node.locator ?? ""))?.filePath
    || "";
  if (!filePath) {
    return null;
  }
  const parsedLocator = node.locator ? parseLocatorParts(String(node.locator)) : null;
  const line = typeof node.range?.start_line === "number"
    ? node.range.start_line
    : parsedLocator?.line;
  const column = parsedLocator?.column;
  return { filePath, line, column };
}

function formatLocatorLabel(target: OpenLocatorTarget) {
  const suffix = target.line
    ? `:${target.line}${target.column ? `:${target.column}` : ""}`
    : "";
  return `${target.filePath}${suffix}`;
}

function buildNodeLocator(node: GraphNode): string | null {
  const target = buildNodeOpenTarget(node);
  return target ? formatLocatorLabel(target) : null;
}

export type CaseLinkedEntitiesPanelProps = {
  caseId: string | null;
  variant?: "page" | "embed";
  refreshToken?: number;
  preloadedData?: CaseGraphDataBundle | null;
  preloadedError?: string | null;
  onRequestReload?: () => void;
  onOpenLocator?: (target: string | OpenLocatorTarget, assetId?: string | null) => void;
  activeLocator?: { file: string; startLine: number; endLine: number } | null;
  onGraphMutated?: () => void;
  onError?: (message: string) => void;
  onSelectCheck?: (checkId: string) => void;
  hostMutations?: EmbedHostMutations;
};

export function CaseLinkedEntitiesPanel({
  caseId,
  variant = "page",
  refreshToken,
  preloadedData,
  preloadedError,
  onRequestReload,
  onOpenLocator,
  activeLocator,
  onGraphMutated,
  onError,
  onSelectCheck,
  hostMutations,
}: CaseLinkedEntitiesPanelProps) {
  const { api, getProjectBasePathForAsset, getWorkspaceRoot } = useWorkbench();
  const {
    selected,
    relations,
    relationTree,
    relationTreeRoots,
    reload,
    error,
    setError,
    selectedAssessmentId,
    isLoading,
  } = useCaseGraphData(caseId, refreshToken, {
    preloadedData,
    preloadedError,
    onRequestReload,
  });

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [expandedSnippetIds, setExpandedSnippetIds] = useState<Set<string>>(new Set());
  const [focusedNodeKey, setFocusedNodeKey] = useState<string | null>(null);
  const [dropState, setDropState] = useState<RelationDropState | null>(null);
  const dropStateRef = useRef<RelationDropState | null>(null);
  const [relationDescriptionModal, setRelationDescriptionModal] = useState<RelationDescriptionModalState | null>(null);
  const [relationDisplayModal, setRelationDisplayModal] = useState<RelationDisplayModalState | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);
  const panelKeyboardActiveRef = useRef(false);

  useEffect(() => {
    dropStateRef.current = dropState;
  }, [dropState]);

  const reportError = (message: string) => {
    setError(message);
    onError?.(message);
  };

  const notifyMutated = async () => {
    if (onRequestReload) {
      onRequestReload();
      onGraphMutated?.();
      return;
    }
    await reload();
    onGraphMutated?.();
  };

  const applySiblingReorder = useCallback(
    async (parent: GraphNode, draggedKey: string, targetKey: string, position: "before" | "after") => {
      if (draggedKey === targetKey) {
        return;
      }
      const siblings = [...parent.children];
      const keys = siblings.map((s) => graphNodeKey(s));
      const from = keys.indexOf(draggedKey);
      const toRef = keys.indexOf(targetKey);
      if (from < 0 || toRef < 0) {
        return;
      }
      keys.splice(from, 1);
      let insertAt = toRef;
      if (from < toRef) {
        insertAt--;
      }
      if (position === "after") {
        insertAt++;
      }
      keys.splice(insertAt, 0, draggedKey);
      const byKey = new Map(siblings.map((s) => [graphNodeKey(s), s]));
      const patches: Array<{ relationId: string; properties: Record<string, unknown> }> = [];
      for (let i = 0; i < keys.length; i++) {
        const node = byKey.get(keys[i]!);
        if (!node?.relationId) {
          continue;
        }
        const rel = relations.find((r) => r.id === node.relationId);
        const merged = { ...((rel?.properties ?? {}) as Record<string, unknown>), linked_entities_order: i };
        patches.push({ relationId: node.relationId, properties: merged });
      }
      if (!patches.length) {
        return;
      }
      try {
        if (hostMutations) {
          await hostMutations.patchRelationPropertiesBatch({ patches });
        } else {
          for (const p of patches) {
            await api.updateRelation(p.relationId, { properties: p.properties });
          }
        }
        await notifyMutated();
      } catch (error) {
        reportError(mutationErrorMessage(error));
      }
    },
    [relations, api, hostMutations, notifyMutated, reportError],
  );

  const toggleCollapsed = (nodeKey: string) => {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(nodeKey)) {
        next.delete(nodeKey);
      } else {
        next.add(nodeKey);
      }
      return next;
    });
  };

  const toggleSnippet = (nodeKey: string) => {
    setExpandedSnippetIds((current) => {
      const next = new Set(current);
      if (next.has(nodeKey)) {
        next.delete(nodeKey);
      } else {
        next.add(nodeKey);
      }
      return next;
    });
  };

  const visibleNodes = useMemo(
    () => flattenVisibleNodes(relationTreeRoots, collapsedIds),
    [relationTreeRoots, collapsedIds],
  );

  const openNodeInEditor = useCallback((node: GraphNode) => {
    if (!onOpenLocator) {
      return;
    }
    const target = buildNodeOpenTarget(node);
    if (target) {
      onOpenLocator(target, node.assetId);
      if (variant === "embed") {
        requestAnimationFrame(() => treeRef.current?.focus());
      }
    }
  }, [onOpenLocator, variant]);

  const handleTreeKeyDown = useCallback((event: KeyboardEvent<HTMLElement> | KeyboardEvent) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      return;
    }
    if (!visibleNodes.length) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      const currentIndex = focusedNodeKey
        ? visibleNodes.findIndex((item) => item.nodeKey === focusedNodeKey)
        : -1;
      const nextIndex = event.key === "ArrowDown"
        ? (currentIndex < 0 ? 0 : Math.min(currentIndex + 1, visibleNodes.length - 1))
        : (currentIndex < 0 ? visibleNodes.length - 1 : Math.max(currentIndex - 1, 0));
      const next = visibleNodes[nextIndex];
      if (!next) {
        return;
      }
      setFocusedNodeKey(next.nodeKey);
      openNodeInEditor(next.node);
      return;
    }

    if (event.key === " " && variant === "embed") {
      event.preventDefault();
      event.stopPropagation();
      const key = focusedNodeKey ?? visibleNodes[0]?.nodeKey;
      if (!key) {
        return;
      }
      const entry = visibleNodes.find((item) => item.nodeKey === key);
      if (!entry) {
        return;
      }
      if (entry.node.snippet?.snippet) {
        toggleSnippet(key);
        return;
      }
      if (entry.hasChildren) {
        toggleCollapsed(key);
      }
    }
  }, [focusedNodeKey, openNodeInEditor, toggleCollapsed, toggleSnippet, variant, visibleNodes]);

  useEffect(() => {
    if (variant !== "embed") {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const root = document.querySelector(".case-linked-entities-embed-root");
      if (root?.contains(event.target as Node)) {
        panelKeyboardActiveRef.current = true;
        treeRef.current?.focus();
      } else {
        panelKeyboardActiveRef.current = false;
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!panelKeyboardActiveRef.current) {
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== " ") {
        return;
      }
      handleTreeKeyDown(event);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [handleTreeKeyDown, variant]);

  useEffect(() => {
    if (!focusedNodeKey) {
      return;
    }
    document.querySelector(`[data-node-key="${focusedNodeKey}"]`)?.scrollIntoView({ block: "nearest" });
  }, [focusedNodeKey]);

  useEffect(() => {
    setCollapsedIds(new Set());
    setExpandedSnippetIds(new Set());
    setFocusedNodeKey(null);
    setDropState(null);
    setRelationDescriptionModal(null);
    setRelationDisplayModal(null);
    panelKeyboardActiveRef.current = false;
  }, [caseId]);

  /** Drop stale keyboard focus after graph updates; never auto-highlight a row without explicit user navigation */
  useEffect(() => {
    if (!focusedNodeKey) {
      return;
    }
    if (!visibleNodes.some((item) => item.nodeKey === focusedNodeKey)) {
      setFocusedNodeKey(null);
    }
  }, [focusedNodeKey, visibleNodes]);

  /** Clear drop highlight when native drag ends (cancelled drops, etc.). */
  useEffect(() => {
    const clear = () => setDropState(null);
    window.addEventListener("dragend", clear, true);
    return () => window.removeEventListener("dragend", clear, true);
  }, []);

  const createPartOfRelation = async (subjectType: string, subjectId: string, objectType: string, objectId: string) => {
    try {
      if (!selectedAssessmentId) {
        reportError("Select assessment first");
        return;
      }
      if (subjectType === objectType && subjectId === objectId) {
        return;
      }
      const exact = relations.find((relation) =>
        relation.predicate === "PART_OF"
        && relation.subject_type === subjectType
        && relation.subject_id === subjectId
        && relation.object_type === objectType
        && relation.object_id === objectId,
      );
      if (exact) {
        return;
      }
      const existingPartOf = relations.find((relation) =>
        relation.predicate === "PART_OF"
        && relation.subject_type === subjectType
        && relation.subject_id === subjectId,
      );
      if (hostMutations) {
        await hostMutations.movePartOf({
          subjectType,
          subjectId,
          objectType,
          objectId,
          relations,
        });
      } else if (existingPartOf) {
        await api.updateRelation(existingPartOf.id, {
          object_type: objectType,
          object_id: objectId,
        });
      } else {
        await api.createRelation(selectedAssessmentId, {
          subject_type: subjectType,
          subject_id: subjectId,
          predicate: "PART_OF",
          object_type: objectType,
          object_id: objectId,
          confidence: "MEDIUM",
          status: "ACCEPTED",
          source: "OTHER",
          properties: {},
        });
      }
      await notifyMutated();
    } catch (error) {
      reportError(mutationErrorMessage(error));
    }
  };

  const handleEntityDrop = async (event: DragEvent<HTMLElement>, objectType: string, objectId: string) => {
    event.preventDefault();
    const raw = readEntityDragData(event.dataTransfer);
    setDropState(null);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as { entityType?: string; entityId?: string };
      if (!parsed.entityType || !parsed.entityId) {
        return;
      }
      await createPartOfRelation(parsed.entityType, parsed.entityId, objectType, objectId);
    } catch (error) {
      reportError(mutationErrorMessage(error));
    }
  };

  const createCheckFromNode = async (node: GraphNode) => {
    try {
      if (!selectedAssessmentId || !selected) {
        reportError("Select assessment first");
        return;
      }
      if (hostMutations) {
        await hostMutations.createCheckFromNode({
          caseId: selected.id,
          entityType: node.entityType,
          entityId: node.entityId,
          label: node.label,
          userDescription: node.userDescription ?? "",
        });
      } else {
        const created = await api.createCheck(selectedAssessmentId, {
          title: node.label,
          description: node.userDescription ?? "",
          status: "NOT_STARTED",
          priority: "MEDIUM",
          source: "OTHER",
        });
        await api.createRelation(selectedAssessmentId, {
          subject_type: node.entityType,
          subject_id: node.entityId,
          predicate: "CHECKS",
          object_type: "CHECK",
          object_id: created.id,
          confidence: "MEDIUM",
          status: "ACCEPTED",
          source: "OTHER",
          properties: {},
        });
        await api.createRelation(selectedAssessmentId, {
          subject_type: "CHECK",
          subject_id: created.id,
          predicate: "PART_OF",
          object_type: "CASE",
          object_id: selected.id,
          confidence: "MEDIUM",
          status: "ACCEPTED",
          source: "OTHER",
          properties: {},
        });
      }
      await notifyMutated();
    } catch (error) {
      reportError(mutationErrorMessage(error));
    }
  };

  const deleteNodeRelation = async (node: GraphNode) => {
    try {
      if (!node.relationId) {
        return;
      }
      if (hostMutations) {
        await hostMutations.deleteRelation(node.relationId);
      } else {
        await api.deleteRelation(node.relationId);
      }
      await notifyMutated();
    } catch (error) {
      reportError(mutationErrorMessage(error));
    }
  };

  const editNodeDescription = (node: GraphNode, nodeKey: string) => {
    if (!node.relationId) {
      return;
    }
    setRelationDescriptionModal({
      relationId: node.relationId,
      label: node.label,
      draft: node.userDescription ?? "",
      nodeKey,
      entityType: node.entityType,
      entityId: node.entityId,
    });
  };

  const editNodeDisplayName = (node: GraphNode, nodeKey: string) => {
    if (!node.relationId) {
      return;
    }
    setRelationDisplayModal({
      relationId: node.relationId,
      label: node.label,
      draft: node.displayName ?? "",
      nodeKey,
    });
  };

  const toggleDeadEnd = async (node: GraphNode) => {
    const markIds = collectMarkIdsInSubtree(node);
    if (!markIds.length) {
      return;
    }
    const nextValue = !(node.isDeadEnd || node.isDeadEndInherited);
    try {
      if (hostMutations) {
        await hostMutations.toggleDeadEnd({ markIds, isDeadEnd: nextValue });
      } else {
        await Promise.all(markIds.map((markId) => api.updateMark(markId, { is_dead_end: nextValue })));
      }
      await notifyMutated();
    } catch (error) {
      reportError(mutationErrorMessage(error));
    }
  };

  const saveNodeDisplayName = async (current: RelationDisplayModalState) => {
    const relation = relations.find((item) => item.id === current.relationId);
    const properties = { ...((relation?.properties ?? {}) as Record<string, unknown>) };
    const trimmed = current.draft.trim();
    if (trimmed) {
      properties.display_name = trimmed;
    } else {
      delete properties.display_name;
    }
    try {
      if (hostMutations) {
        await hostMutations.updateDisplayName({ relationId: current.relationId, properties });
      } else {
        await api.updateRelation(current.relationId, { properties });
      }
      await notifyMutated();
    } catch (error) {
      reportError(mutationErrorMessage(error));
    }
  };

  const renderGraphLine = ({ node, depth, nodeKey, hasChildren, isCollapsed, toggle }: TreeRenderArgs<GraphNode>) => {
    const hasSnippet = Boolean(node.snippet?.snippet);
    const isSnippetExpanded = expandedSnippetIds.has(nodeKey);
    const displayRelationLabel = node.relationLabel === "PART_OF" ? node.typeLabel : node.relationLabel;
    const showTrailingTypeLabel = node.relationLabel !== "PART_OF";
    const isCheckNode = node.entityType.toUpperCase() === "CHECK";
    const description = String(node.userDescription ?? "").trim();
    const showInlineDescription = Boolean(description);
    const canDelete = Boolean(node.relationId);
    const canToggleDeadEnd = collectMarkIdsInSubtree(node).length > 0;
    const showDeadEndBadge = Boolean(node.isDeadEnd || node.isDeadEndInherited);
    const canCreateCheck = !["CASE", "CHECK"].includes(node.entityType.toUpperCase());
    const canEditDescription = Boolean(node.relationId);
    const showNavLinks = variant !== "embed";
    const isCurrentEditorEntity = nodeMatchesActiveRange(node, activeLocator);
    const isKeyboardFocused = focusedNodeKey === nodeKey;
    const openTargetParts = buildNodeOpenTarget(node);
    const nodeLocator = openTargetParts ? formatLocatorLabel(openTargetParts) : null;
    const canOpenInEditor = Boolean(openTargetParts && onOpenLocator);
    const openTarget = openTargetParts
      ? resolveOpenTargetFromParts(
        openTargetParts,
        getProjectBasePathForAsset(node.assetId),
        getWorkspaceRoot(),
      )
      : "";
    const isEmbed = variant === "embed";
    const isActionablePill = Boolean(displayRelationLabel);
    const primaryIsNavigable = isEmbed && (canOpenInEditor || isCheckNode);
    const primaryIsSnippetToggle = !isEmbed && hasSnippet;
    const pillIsNavigable = !isEmbed && isActionablePill && canOpenInEditor;
    const pillIsSnippetToggle = isEmbed && isActionablePill && hasSnippet;
    const snippetTitle = hasSnippet
      ? (isSnippetExpanded ? "Hide code context" : "Show code context")
      : undefined;
    const openFileTitle = openTarget
      ? `Open target: ${openTarget}\nLocator: ${nodeLocator}`
      : nodeLocator
        ? `Locator: ${nodeLocator}`
        : undefined;
    const primaryTitle = isEmbed
      ? (isCheckNode ? "Open in Checks panel" : openFileTitle)
      : snippetTitle;
    const pillTitle = isEmbed
      ? snippetTitle
      : (pillIsNavigable ? openFileTitle : (nodeLocator ? "Cannot open: configure asset base path" : undefined));

    const runPrimaryAction = () => {
      setFocusedNodeKey(nodeKey);
      if (isCheckNode && isEmbed) {
        onSelectCheck?.(node.entityId);
        return;
      }
      if (isEmbed && canOpenInEditor) {
        openNodeInEditor(node);
        return;
      }
      if (!isEmbed && hasSnippet) {
        toggleSnippet(nodeKey);
        return;
      }
      if (!isEmbed && !hasSnippet) {
        onError?.("No code snippet for this entity");
      } else if (isEmbed && !canOpenInEditor && nodeLocator) {
        onError?.("Cannot open file in editor");
      } else if (isEmbed && !canOpenInEditor && !nodeLocator) {
        onError?.("No file locator for this entity");
      }
    };

    const runPillAction = () => {
      setFocusedNodeKey(nodeKey);
      if (isEmbed && hasSnippet) {
        toggleSnippet(nodeKey);
        return;
      }
      if (!isEmbed && canOpenInEditor) {
        openNodeInEditor(node);
        return;
      }
      if (!isEmbed && nodeLocator) {
        onError?.("Cannot open file: configure absolute base path for asset");
        return;
      }
      if (isEmbed && !hasSnippet) {
        onError?.("No code snippet for this entity");
      }
    };

    const handlePillClick = (event: MouseEvent) => {
      event.stopPropagation();
      runPillAction();
    };

    const handleRowMainClick = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest(".relation-pill")) {
        return;
      }
      if (!primaryInteractive) {
        return;
      }
      event.stopPropagation();
      runPrimaryAction();
    };

    const primaryInteractive = primaryIsNavigable || primaryIsSnippetToggle;
    const pillInteractive = pillIsNavigable || pillIsSnippetToggle;

    return (
      <div
        className={`relation-tree-line ${depth ? "has-parent" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
          const y = event.clientY - rect.top;
          const h = rect.height || 1;
          let position: RelationDropState["position"] = "inside";
          if (node.entityType.toUpperCase() !== "CASE") {
            if (y < h / 3) {
              position = "before";
            } else if (y > (2 * h) / 3) {
              position = "after";
            } else {
              position = "inside";
            }
          }
          setDropState({ targetKey: nodeKey, position });
        }}
        onDragLeave={(event) => {
          event.stopPropagation();
          const related = event.relatedTarget as Node | null;
          if (related && event.currentTarget.contains(related)) {
            return;
          }
          setDropState((current) => (current?.targetKey === nodeKey ? null : current));
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          const ds = dropStateRef.current;
          setDropState(null);
          const raw = readEntityDragData(event.dataTransfer);
          if (!raw) {
            return;
          }
          let parsed: { entityType?: string; entityId?: string };
          try {
            parsed = JSON.parse(raw) as { entityType?: string; entityId?: string };
          } catch {
            return;
          }
          if (!parsed.entityType || !parsed.entityId) {
            return;
          }
          const draggedKey = `${parsed.entityType}:${parsed.entityId}`;
          if (
            relationTree
            && ds?.targetKey === nodeKey
            && (ds.position === "before" || ds.position === "after")
          ) {
            const parentDrag = findGraphParent(relationTree, draggedKey);
            const parentDrop = findGraphParent(relationTree, nodeKey);
            if (parentDrag && parentDrag === parentDrop) {
              void applySiblingReorder(parentDrag, draggedKey, nodeKey, ds.position);
              return;
            }
          }
          void handleEntityDrop(event, node.entityType, node.entityId);
        }}
      >
        <TreeExpander hasChildren={hasChildren} isCollapsed={isCollapsed} onToggle={toggle} />
        <ContextMenu>
          <ContextMenuTrigger>
            <div
              className={`relation-tree-hit ${dropState?.targetKey === nodeKey ? "is-drop-target" : ""} ${isCurrentEditorEntity ? "is-current-editor-entity" : ""} ${isKeyboardFocused ? "is-keyboard-focused" : ""}`}
              data-node-key={nodeKey}
            >
              {node.entityType !== "CASE" ? (
                <span
                  className="relation-drag-handle"
                  draggable
                  title="Drag to reorder or reparent"
                  aria-label="Drag to reorder or reparent"
                  onDragStart={(event) => {
                    setEntityDragData(event.dataTransfer, node.entityType, node.entityId);
                  }}
                  onDragEnd={() => {
                    setDropState(null);
                  }}
                >
                  ⋮⋮
                </span>
              ) : null}
              <EntityKindIcon kind={node.iconKind ?? node.typeLabel} />
              {showDeadEndBadge ? <EntityDeadEndBadge inherited={Boolean(node.isDeadEndInherited)} /> : null}
              <div
                className={`case-tree-row-button ${hasSnippet && isSnippetExpanded ? "is-active" : ""}`}
              >
                {displayRelationLabel ? (
                  <span
                    className={`relation-pill ${pillInteractive ? "is-pill-action" : ""} ${pillIsNavigable ? "is-navigable" : ""} ${pillIsSnippetToggle ? "is-snippet-toggle" : ""}`}
                    role={pillInteractive ? "button" : undefined}
                    tabIndex={pillInteractive ? 0 : undefined}
                    title={pillInteractive ? pillTitle : undefined}
                    onClick={pillInteractive ? handlePillClick : undefined}
                  >
                    {displayRelationLabel}
                  </span>
                ) : null}
                <span
                  className={`case-tree-row-main ${primaryInteractive ? "is-primary-action" : ""}`}
                  role={primaryInteractive ? "button" : undefined}
                  tabIndex={primaryInteractive ? 0 : undefined}
                  title={primaryInteractive ? primaryTitle : undefined}
                  onClick={primaryInteractive ? handleRowMainClick : undefined}
                  onKeyDown={primaryInteractive ? (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      runPrimaryAction();
                    }
                  } : undefined}
                >
                  {node.displayName ? (
                    <>
                      <span
                        className={`case-tree-entity-label case-tree-display-name ${primaryIsNavigable ? "is-navigable" : ""} ${primaryIsSnippetToggle ? "is-snippet-toggle" : ""}`}
                      >
                        {node.displayName}
                      </span>
                      <span className="case-tree-name-separator"> | </span>
                      <span
                        className={`case-tree-entity-label case-tree-original-label ${primaryIsNavigable ? "is-navigable" : ""} ${primaryIsSnippetToggle ? "is-snippet-toggle" : ""}`}
                      >
                        {node.label}
                      </span>
                    </>
                  ) : (
                    <span
                      className={`case-tree-entity-label ${primaryIsNavigable ? "is-navigable" : ""} ${primaryIsSnippetToggle ? "is-snippet-toggle" : ""}`}
                    >
                      {node.label}
                    </span>
                  )}
                  {showTrailingTypeLabel ? <span className="small">{node.typeLabel}</span> : null}
                  {isCheckNode && node.status ? <span className="small">· {node.status}</span> : null}
                </span>
              </div>
              {showNavLinks ? node.caseLinks.map((linkedCase) => (
                <EntityNavLink key={linkedCase.id} type="CASE" id={linkedCase.id} label={linkedCase.label} />
              )) : null}
              {showNavLinks ? <EntityNavLink type={node.entityType} id={node.entityId} label="↗" /> : null}
              {showInlineDescription ? <span className="case-tree-description">{description}</span> : null}
            </div>
          </ContextMenuTrigger>
          {(canDelete || canCreateCheck || canEditDescription || canToggleDeadEnd) ? (
            <ContextMenuContent>
              {canToggleDeadEnd ? (
                <ContextMenuItem onSelect={() => void toggleDeadEnd(node)}>
                  {(node.isDeadEnd || node.isDeadEndInherited) ? "Remove dead-end mark" : "Mark as dead end"}
                </ContextMenuItem>
              ) : null}
              {canEditDescription ? (
                <ContextMenuItem onSelect={() => editNodeDescription(node, nodeKey)}>
                  {description ? "Edit description" : "Add description"}
                </ContextMenuItem>
              ) : null}
              {node.relationId ? (
                <ContextMenuItem onSelect={() => editNodeDisplayName(node, nodeKey)}>
                  {node.displayName ? "Edit display name" : "Set display name"}
                </ContextMenuItem>
              ) : null}
              {canCreateCheck ? <ContextMenuItem onSelect={() => createCheckFromNode(node)}>Create check</ContextMenuItem> : null}
              {canDelete ? <ContextMenuItem danger onSelect={() => deleteNodeRelation(node)}>Delete</ContextMenuItem> : null}
            </ContextMenuContent>
          ) : null}
        </ContextMenu>
      </div>
    );
  };

  const renderGraphAfterLine = ({ node, nodeKey }: TreeRenderArgs<GraphNode>) => {
    const hasSnippet = Boolean(node.snippet?.snippet);
    const isSnippetExpanded = expandedSnippetIds.has(nodeKey);
    const isEditingDescription = relationDescriptionModal?.nodeKey === nodeKey;
    const isEditingDisplay = relationDisplayModal?.nodeKey === nodeKey;
    if ((!hasSnippet || !isSnippetExpanded) && !isEditingDescription && !isEditingDisplay) {
      return null;
    }
    return (
      <div className={`case-tree-detail-grid ${variant === "embed" ? "case-tree-detail-grid-embed" : ""}`}>
        <div className="case-tree-snippet">
          {hasSnippet && isSnippetExpanded ? (
            <>
              <div className="small">
                Context lines {String(node.snippet?.startLine ?? "—")}..{String(node.snippet?.endLine ?? "—")}
              </div>
              <HighlightedSnippet
                snippet={node.snippet?.snippet}
                selectedText={node.snippet?.selectedText}
                highlightStartOffset={node.snippet?.highlightStartOffset}
                highlightEndOffset={node.snippet?.highlightEndOffset}
              />
            </>
          ) : null}
        </div>
        {isEditingDescription ? (
          <div className="case-tree-detail-description">
            <textarea
              rows={4}
              value={relationDescriptionModal?.draft ?? ""}
              autoFocus
              onChange={(event) => {
                setRelationDescriptionModal((current) => current ? { ...current, draft: event.target.value } : current);
              }}
              onBlur={async () => {
                const current = relationDescriptionModal;
                if (!current) {
                  return;
                }
                const relation = relations.find((item) => item.id === current.relationId);
                const currentProperties = { ...((relation?.properties ?? {}) as Record<string, unknown>) };
                const trimmed = current.draft.trim();
                if (trimmed) {
                  currentProperties.user_description = trimmed;
                } else {
                  delete currentProperties.user_description;
                }
                setRelationDescriptionModal(null);
                try {
                  if (hostMutations) {
                    await hostMutations.updateDescription({
                      relationId: current.relationId,
                      entityType: current.entityType,
                      entityId: current.entityId,
                      properties: currentProperties,
                      note: trimmed || null,
                    });
                  } else {
                    await api.updateRelation(current.relationId, { properties: currentProperties });
                    if (current.entityType.toUpperCase() === "MARK") {
                      await api.updateMark(current.entityId, { note: trimmed || null });
                    }
                  }
                  await notifyMutated();
                } catch (error) {
                  reportError(mutationErrorMessage(error));
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setRelationDescriptionModal(null);
                }
              }}
            />
          </div>
        ) : null}
        {isEditingDisplay ? (
          <div className="case-tree-detail-description">
            <input
              value={relationDisplayModal?.draft ?? ""}
              autoFocus
              placeholder="Display name"
              onChange={(event) => {
                setRelationDisplayModal((current) => current ? { ...current, draft: event.target.value } : current);
              }}
              onBlur={async () => {
                const current = relationDisplayModal;
                setRelationDisplayModal(null);
                if (current) {
                  await saveNodeDisplayName(current);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setRelationDisplayModal(null);
                }
              }}
            />
          </div>
        ) : null}
      </div>
    );
  };

  const treeContent = (
    <div
      ref={treeRef}
      className={`relation-tree relation-tree-root ${variant === "embed" ? "relation-tree-embed" : ""}`}
      tabIndex={0}
      onKeyDown={handleTreeKeyDown}
      onPointerDown={() => {
        if (variant === "embed") {
          panelKeyboardActiveRef.current = true;
        }
      }}
      onDragOver={(event) => {
        if (!selected) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        setDropState({ targetKey: `CASE:${selected.id}`, position: "inside" });
      }}
      onDragLeave={(event) => {
        event.stopPropagation();
        setDropState((current) => (current?.targetKey === `CASE:${selected?.id ?? ""}` ? null : current));
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (selected) {
          void handleEntityDrop(event, "CASE", selected.id);
        }
      }}
    >
      {!caseId ? (
        <p className="small">Select a case in AppSec Context.</p>
      ) : isLoading ? (
        <p className="small">Loading…</p>
      ) : !selected ? (
        <p className="small">Could not load case data. Check assessment settings and API.</p>
      ) : relationTreeRoots.length > 0 ? (
        <TreeView
          roots={relationTreeRoots}
          getId={(node) => `${node.entityType}:${node.entityId}`}
          getChildren={(node) => node.children}
          collapsedIds={collapsedIds}
          onToggle={toggleCollapsed}
          renderLine={renderGraphLine}
          renderAfterLine={renderGraphAfterLine}
          variant="relation"
          indentMode={variant === "embed" ? "padding" : "margin"}
        />
      ) : (
        <p className="small">No linked entities for this case.</p>
      )}
    </div>
  );

  if (variant === "embed") {
    return (
      <div className="case-linked-entities-embed">
        {error ? <div className="error-text">{error}</div> : null}
        {treeContent}
      </div>
    );
  }

  return (
    <>
      {error ? <div className="error-text">{error}</div> : null}
      <ResourceCard title="Linked Entities">{treeContent}</ResourceCard>
    </>
  );
}

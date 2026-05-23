import { DragEvent, Fragment, type ReactNode, useEffect, useMemo, useState } from "react";

import { Candidate, CaseRecord, CheckRecord, FindingRecord, MarkRecord, ObjectRecord, RelationRecord } from "../api/client";
import { useWorkbench } from "../app/workbench";
import { EmptyState, Field, InlineEditableText } from "../components/common";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../components/context-menu";
import { LocatorLink } from "../components/locator";
import { ModalGlyph, ModalShell } from "../components/modal";
import { ResourceCard } from "../components/resource";
import { TreeExpander, TreeView, type TreeRenderArgs } from "../components/tree";
import { EntityNavLink, shortId, useSelectedIdParam } from "./utils";

type GraphSnippet = {
  snippet: string;
  selectedText?: string;
  highlightStartOffset?: number;
  highlightEndOffset?: number;
  startLine?: number;
  endLine?: number;
};

type GraphNode = {
  entityType: string;
  entityId: string;
  label: string;
  typeLabel: string;
  userDescription?: string | null;
  locator?: string | null;
  assetId?: string | null;
  relationId?: string;
  relationLabel?: string;
  snippet?: GraphSnippet | null;
  caseLinks: Array<{ id: string; label: string }>;
  children: GraphNode[];
};

type RelationDropState = {
  targetKey: string;
  position: "inside";
};

type RelationDescriptionModalState = {
  relationId: string;
  label: string;
  draft: string;
  nodeKey: string;
};

function buttonIcon(children: ReactNode) {
  return <span className="btn-icon" aria-hidden="true">{children}</span>;
}

function saveIcon() {
  return buttonIcon(
    <ModalGlyph>
      <path d="M3.25 3.25h7.8l1.7 1.7v7.8H3.25z" />
      <path d="M5.25 3.25v3h5v-3" />
      <path d="M5.4 10.1h4.9" />
    </ModalGlyph>,
  );
}

function plusIcon() {
  return buttonIcon(
    <ModalGlyph>
      <path d="M8 3.25v9.5" />
      <path d="M3.25 8h9.5" />
    </ModalGlyph>,
  );
}

function noteIcon() {
  return buttonIcon(
    <ModalGlyph>
      <path d="M4 3.25h8a.75.75 0 0 1 .75.75v8L9.5 10.25H4a.75.75 0 0 1-.75-.75V4A.75.75 0 0 1 4 3.25Z" />
      <path d="M5.5 6h5" />
      <path d="M5.5 8.5h3.5" />
    </ModalGlyph>,
  );
}

function HighlightedSnippet({
  snippet,
  selectedText,
  highlightStartOffset,
  highlightEndOffset,
}: {
  snippet?: string;
  selectedText?: string;
  highlightStartOffset?: number;
  highlightEndOffset?: number;
}) {
  if (!snippet) {
    return null;
  }
  if (
    typeof highlightStartOffset === "number"
    && typeof highlightEndOffset === "number"
    && highlightStartOffset >= 0
    && highlightEndOffset > highlightStartOffset
    && highlightEndOffset <= snippet.length
  ) {
    const before = snippet.slice(0, highlightStartOffset);
    const highlighted = snippet.slice(highlightStartOffset, highlightEndOffset);
    const after = snippet.slice(highlightEndOffset);
    return (
      <pre className="code-block case-tree-code">
        <Fragment>{before}</Fragment>
        <mark>{highlighted}</mark>
        <Fragment>{after}</Fragment>
      </pre>
    );
  }
  if (!selectedText) {
    return <pre className="code-block case-tree-code">{snippet}</pre>;
  }
  const firstIndex = snippet.indexOf(selectedText);
  if (firstIndex < 0) {
    return <pre className="code-block case-tree-code">{snippet}</pre>;
  }
  const before = snippet.slice(0, firstIndex);
  const after = snippet.slice(firstIndex + selectedText.length);
  return (
    <pre className="code-block case-tree-code">
      <Fragment>{before}</Fragment>
      <mark>{selectedText}</mark>
      <Fragment>{after}</Fragment>
    </pre>
  );
}

export function CasesPage() {
  const { api, selectedAssessmentId } = useWorkbench();
  const [rows, setRows] = useState<CaseRecord[]>([]);
  const [relations, setRelations] = useState<RelationRecord[]>([]);
  const [marks, setMarks] = useState<MarkRecord[]>([]);
  const [checks, setChecks] = useState<CheckRecord[]>([]);
  const [findings, setFindings] = useState<FindingRecord[]>([]);
  const [objects, setObjects] = useState<ObjectRecord[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedId, setSelectedId] = useSelectedIdParam();
  const [error, setError] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [expandedSnippetIds, setExpandedSnippetIds] = useState<Set<string>>(new Set());
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isSavingDescription, setIsSavingDescription] = useState(false);
  const [isRenamingCase, setIsRenamingCase] = useState(false);
  const [dropState, setDropState] = useState<RelationDropState | null>(null);
  const [relationDescriptionModal, setRelationDescriptionModal] = useState<RelationDescriptionModalState | null>(null);
  const [createDraft, setCreateDraft] = useState({
    title: "Untrusted input reaches command execution",
    description: "Investigation case",
  });
  const [editDraft, setEditDraft] = useState({
    title: "",
    description: "",
    status: "OPEN",
  });

  const reload = async () => {
    if (!selectedAssessmentId) return;
    try {
      const [caseRows, relationRows, markRows, checkRows, findingRows, objectRows, candidateRows] = await Promise.all([
        api.getCases(selectedAssessmentId),
        api.getRelations(selectedAssessmentId),
        api.getMarks(selectedAssessmentId),
        api.getChecks(selectedAssessmentId),
        api.getFindings(selectedAssessmentId),
        api.getObjects(selectedAssessmentId),
        api.getCandidates(selectedAssessmentId),
      ]);
      setRows(caseRows);
      setRelations(relationRows);
      setMarks(markRows);
      setChecks(checkRows);
      setFindings(findingRows);
      setObjects(objectRows);
      setCandidates(candidateRows);
      if (!selectedId && caseRows[0]?.id) {
        setSelectedId(caseRows[0].id);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => { void reload(); }, [selectedAssessmentId]);

  const orderedRows = useMemo(
    () => [...rows].sort((left, right) => {
      const leftTime = left.created_at ? Date.parse(left.created_at) : 0;
      const rightTime = right.created_at ? Date.parse(right.created_at) : 0;
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return left.id.localeCompare(right.id);
    }),
    [rows],
  );

  const selected = useMemo(() => orderedRows.find((row) => row.id === selectedId) ?? null, [orderedRows, selectedId]);
  useEffect(() => {
    setDescriptionDraft(selected?.description ?? "");
    setIsEditingDescription(false);
  }, [selected?.id, selected?.description]);
  useEffect(() => {
    if (!isCreateOpen) {
      setCreateDraft({
        title: "Untrusted input reaches command execution",
        description: "Investigation case",
      });
    }
  }, [isCreateOpen]);
  useEffect(() => {
    if (!isEditOpen || !selected) {
      return;
    }
    setEditDraft({
      title: selected.title,
      description: selected.description ?? "",
      status: selected.status,
    });
  }, [isEditOpen, selected]);
  const isCreateDirty = createDraft.title !== "Untrusted input reaches command execution" || createDraft.description !== "Investigation case";
  const isEditDirty = Boolean(selected) && (
    editDraft.title !== selected.title
    || editDraft.description !== (selected.description ?? "")
    || editDraft.status !== selected.status
  );
  const isRelationDescriptionDirty = relationDescriptionModal
    ? relationDescriptionModal.draft !== (relations.find((item) => item.id === relationDescriptionModal.relationId)?.properties?.user_description as string | undefined ?? "")
    : false;

  const normalizeLabel = (value?: string | null) => {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) {
      return undefined;
    }
    if (["none", "null", "undefined"].includes(trimmed.toLowerCase())) {
      return undefined;
    }
    return trimmed;
  };

  const resolveEntityLabel = (type: string, id: string) => {
    const normalized = type.toUpperCase();
    if (normalized === "CASE") {
      return normalizeLabel(rows.find((item) => item.id === id)?.title);
    }
    if (normalized === "MARK") {
      return normalizeLabel(marks.find((item) => item.id === id)?.title);
    }
    if (normalized === "CHECK") {
      return normalizeLabel(checks.find((item) => item.id === id)?.title);
    }
    if (normalized === "FINDING") {
      return normalizeLabel(findings.find((item) => item.id === id)?.title);
    }
    if (normalized === "OBJECT") {
      return normalizeLabel(objects.find((item) => item.id === id)?.name);
    }
    if (normalized === "CANDIDATE") {
      const candidate = candidates.find((item) => item.id === id);
      return candidate ? normalizeLabel(String((candidate.proposed_payload as any)?.title ?? (candidate.proposed_payload as any)?.name ?? candidate.candidate_type)) : undefined;
    }
    return undefined;
  };

  const resolveEntityTypeLabel = (type: string, id: string) => {
    const normalized = type.toUpperCase();
    if (normalized === "MARK") {
      return normalizeLabel(marks.find((item) => item.id === id)?.kind) ?? "MARK";
    }
    if (normalized === "CHECK") {
      const check = checks.find((item) => item.id === id);
      return normalizeLabel(check?.check_type) ?? normalizeLabel(check?.category) ?? "CHECK";
    }
    if (normalized === "FINDING") {
      return normalizeLabel(findings.find((item) => item.id === id)?.finding_type) ?? "FINDING";
    }
    if (normalized === "OBJECT") {
      const object = objects.find((item) => item.id === id);
      return normalizeLabel(object?.kind) ?? normalizeLabel(object?.type) ?? "OBJECT";
    }
    return normalized;
  };

  const resolveEntityLocator = (type: string, id: string) => {
    const normalized = type.toUpperCase();
    if (normalized === "OBJECT") {
      return objects.find((item) => item.id === id)?.locator ?? null;
    }
    if (normalized === "MARK") {
      const mark = marks.find((item) => item.id === id);
      if (!mark) {
        return null;
      }
      return objects.find((item) => item.id === mark.object_id)?.locator ?? null;
    }
    if (normalized === "EVIDENCE") {
      return null;
    }
    return null;
  };

  const resolveRelationDescription = (relationId?: string) => {
    if (!relationId) {
      return null;
    }
    const relation = relations.find((item) => item.id === relationId);
    const properties = (relation?.properties ?? {}) as Record<string, unknown>;
    return String(properties.user_description ?? "").trim() || null;
  };

  const resolveEntityDescription = (type: string, id: string) => {
    const normalized = type.toUpperCase();
    if (normalized === "CHECK") {
      return String(checks.find((item) => item.id === id)?.description ?? "").trim() || null;
    }
    if (normalized === "MARK") {
      const mark = marks.find((item) => item.id === id);
      if (!mark) {
        return null;
      }
      const properties = (objects.find((item) => item.id === mark.object_id)?.properties ?? {}) as Record<string, unknown>;
      return String(properties.user_description ?? "").trim() || null;
    }
    if (normalized === "OBJECT") {
      const properties = (objects.find((item) => item.id === id)?.properties ?? {}) as Record<string, unknown>;
      return String(properties.user_description ?? "").trim() || null;
    }
    return null;
  };

  const resolveEntityAssetId = (type: string, id: string) => {
    const normalized = type.toUpperCase();
    if (normalized === "OBJECT") {
      return objects.find((item) => item.id === id)?.asset_id ?? null;
    }
    if (normalized === "MARK") {
      const mark = marks.find((item) => item.id === id);
      if (!mark) {
        return null;
      }
      return objects.find((item) => item.id === mark.object_id)?.asset_id ?? null;
    }
    return null;
  };

  const resolveEntitySnippet = (type: string, id: string): GraphSnippet | null => {
    const normalized = type.toUpperCase();
    const fromObject = (object?: ObjectRecord | null) => {
      if (!object) {
        return null;
      }
      const properties = (object.properties ?? {}) as Record<string, unknown>;
      const snippet = String(properties.context_snippet ?? "").trimEnd();
      if (!snippet) {
        return null;
      }
      const selectedText = String(properties.selected_text ?? "");
      const highlightStartOffset = typeof properties.context_highlight_start_offset === "number" ? properties.context_highlight_start_offset : undefined;
      const highlightEndOffset = typeof properties.context_highlight_end_offset === "number" ? properties.context_highlight_end_offset : undefined;
      const startLine = typeof properties.context_start_line === "number" ? properties.context_start_line : undefined;
      const endLine = typeof properties.context_end_line === "number" ? properties.context_end_line : undefined;
      return { snippet, selectedText, highlightStartOffset, highlightEndOffset, startLine, endLine };
    };

    if (normalized === "OBJECT") {
      return fromObject(objects.find((item) => item.id === id));
    }
    if (normalized === "MARK") {
      const mark = marks.find((item) => item.id === id);
      if (!mark) {
        return null;
      }
      const object = objects.find((item) => item.id === mark.object_id);
      const snippet = fromObject(object);
      if (snippet) {
        return snippet;
      }
      const noteSnippet = String(mark.note ?? "").trimEnd();
      return noteSnippet ? { snippet: noteSnippet } : null;
    }
    if (normalized === "CANDIDATE") {
      const candidate = candidates.find((item) => item.id === id);
      const properties = ((candidate?.proposed_payload as any)?.properties ?? {}) as Record<string, unknown>;
      const snippet = String(properties.context_snippet ?? "").trimEnd();
      if (!snippet) {
        return null;
      }
      return {
        snippet,
        selectedText: String(properties.selected_text ?? ""),
        highlightStartOffset: typeof properties.context_highlight_start_offset === "number" ? properties.context_highlight_start_offset : undefined,
        highlightEndOffset: typeof properties.context_highlight_end_offset === "number" ? properties.context_highlight_end_offset : undefined,
        startLine: typeof properties.context_start_line === "number" ? properties.context_start_line : undefined,
        endLine: typeof properties.context_end_line === "number" ? properties.context_end_line : undefined,
      };
    }
    return null;
  };

  const relationTree = useMemo(() => {
    if (!selected) {
      return null;
    }

    const makeNode = (entityType: string, entityId: string, relationLabel: string | undefined, relationId: string | undefined, seen: Set<string>): GraphNode | null => {
      if (entityType.toUpperCase() === "EVIDENCE") {
        return null;
      }
      const key = `${entityType}:${entityId}`;
      const nextSeen = new Set(seen);
      nextSeen.add(key);
      const label = resolveEntityLabel(entityType, entityId);
      if (!label && entityType.toUpperCase() === "MARK") {
        return null;
      }

      const linked = relations.filter((relation) => {
        const subjectKey = `${relation.subject_type}:${relation.subject_id}`;
        const objectKey = `${relation.object_type}:${relation.object_id}`;
        return subjectKey === key || objectKey === key;
      }).sort((left, right) => {
        const leftTime = left.created_at ? Date.parse(left.created_at) : 0;
        const rightTime = right.created_at ? Date.parse(right.created_at) : 0;
        if (leftTime !== rightTime) {
          return leftTime - rightTime;
        }
        return left.id.localeCompare(right.id);
      });

      const children = linked.flatMap((relation) => {
        const subjectKey = `${relation.subject_type}:${relation.subject_id}`;
        const objectKey = `${relation.object_type}:${relation.object_id}`;
        const neighborType = subjectKey === key ? relation.object_type : relation.subject_type;
        const neighborId = subjectKey === key ? relation.object_id : relation.subject_id;
        const neighborKey = `${neighborType}:${neighborId}`;
        if (neighborType.toUpperCase() === "EVIDENCE") {
          return [];
        }
        if (neighborType.toUpperCase() === "CASE") {
          return [];
        }
        if (
          key === `CASE:${selected.id}`
          && neighborType.toUpperCase() === "CHECK"
          && relations.some((item) =>
            item.predicate === "CHECKS"
            && item.object_type.toUpperCase() === "CHECK"
            && item.object_id === neighborId
            && item.subject_type.toUpperCase() !== "CASE")
        ) {
          return [];
        }
        if (nextSeen.has(neighborKey)) {
          return [];
        }
        const child = makeNode(neighborType, neighborId, relation.predicate, relation.id, nextSeen);
        return child ? [child] : [];
      });
      const caseLinks = linked.flatMap((relation) => {
        const subjectKey = `${relation.subject_type}:${relation.subject_id}`;
        const objectKey = `${relation.object_type}:${relation.object_id}`;
        const neighborType = subjectKey === key ? relation.object_type : relation.subject_type;
        const neighborId = subjectKey === key ? relation.object_id : relation.subject_id;
        if (neighborType.toUpperCase() !== "CASE" || neighborId === selected.id) {
          return [];
        }
        const caseLabel = resolveEntityLabel("CASE", neighborId);
        return caseLabel ? [{ id: neighborId, label: caseLabel }] : [];
      }).filter((item, index, items) => items.findIndex((entry) => entry.id === item.id) === index);
      return {
        entityType,
        entityId,
        label: label ?? `${entityType} ${shortId(entityId)}`,
        typeLabel: resolveEntityTypeLabel(entityType, entityId),
        userDescription: resolveRelationDescription(relationId) ?? resolveEntityDescription(entityType, entityId),
        locator: resolveEntityLocator(entityType, entityId),
        assetId: resolveEntityAssetId(entityType, entityId),
        relationId,
        snippet: resolveEntitySnippet(entityType, entityId),
        relationLabel,
        caseLinks,
        children,
      };
    };

    return makeNode("CASE", selected.id, undefined, undefined, new Set<string>());
  }, [selected, relations, rows, marks, checks, findings, objects, candidates]);
  const relationTreeRoots = relationTree ? relationTree.children : [];

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

  const createPartOfRelation = async (subjectType: string, subjectId: string, objectType: string, objectId: string) => {
    if (!selectedAssessmentId) {
      setError("Select assessment first");
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
      && relation.object_id === objectId
    );
    if (exact) {
      return;
    }
    const existingPartOf = relations.find((relation) =>
      relation.predicate === "PART_OF"
      && relation.subject_type === subjectType
      && relation.subject_id === subjectId,
    );
    if (existingPartOf) {
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
    await reload();
  };

  const handleEntityDrop = async (event: DragEvent<HTMLElement>, objectType: string, objectId: string) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/x-aah2-entity");
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
    } catch {
      return;
    }
  };

  const saveDescription = async () => {
    if (!selected || isSavingDescription) {
      return;
    }
    setIsSavingDescription(true);
    try {
      await api.updateCase(selected.id, {
        description: descriptionDraft,
      });
      setIsEditingDescription(false);
      await reload();
    } finally {
      setIsSavingDescription(false);
    }
  };

  const createCheckFromNode = async (node: GraphNode) => {
    if (!selectedAssessmentId || !selected) {
      setError("Select assessment first");
      return;
    }
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
    await reload();
  };

  const deleteNodeRelation = async (node: GraphNode) => {
    if (!node.relationId) {
      return;
    }
    await api.deleteRelation(node.relationId);
    await reload();
  };

  const editNodeDescription = async (node: GraphNode, nodeKey: string) => {
    if (!node.relationId) {
      return;
    }
    setRelationDescriptionModal({
      relationId: node.relationId,
      label: node.label,
      draft: node.userDescription ?? "",
      nodeKey,
    });
  };

  const renderGraphLine = ({ node, depth, nodeKey, hasChildren, isCollapsed, toggle }: TreeRenderArgs<GraphNode>) => {
    const hasSnippet = Boolean(node.snippet?.snippet);
    const isSnippetExpanded = expandedSnippetIds.has(nodeKey);
    const displayRelationLabel = node.relationLabel === "PART_OF" ? node.typeLabel : node.relationLabel;
    const showTrailingTypeLabel = node.relationLabel !== "PART_OF";
    const description = String(node.userDescription ?? "").trim();
    const showInlineDescription = Boolean(description) && (!hasSnippet || !isSnippetExpanded);
    const canDelete = Boolean(node.relationId);
    const canCreateCheck = !["CASE", "CHECK"].includes(node.entityType.toUpperCase());
    const canEditDescription = Boolean(node.relationId);
    return (
      <div
        className={`relation-tree-line ${depth ? "has-parent" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setDropState({ targetKey: nodeKey, position: "inside" });
        }}
        onDragLeave={(event) => {
          event.stopPropagation();
          setDropState((current) => (current?.targetKey === nodeKey ? null : current));
        }}
        onDrop={(event) => {
          event.stopPropagation();
          void handleEntityDrop(event, node.entityType, node.entityId);
        }}
      >
        <TreeExpander hasChildren={hasChildren} isCollapsed={isCollapsed} onToggle={toggle} />
        <ContextMenu>
          <ContextMenuTrigger>
            <div className={`relation-tree-hit ${dropState?.targetKey === nodeKey ? "is-drop-target" : ""}`}>
              <button
                className={`case-tree-row-button ${hasSnippet && isSnippetExpanded ? "is-active" : ""}`}
                type="button"
                draggable={node.entityType !== "CASE"}
                onDragStart={(event) => {
                  if (node.entityType === "CASE") {
                    return;
                  }
                  event.dataTransfer.setData("application/x-aah2-entity", JSON.stringify({ entityType: node.entityType, entityId: node.entityId }));
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDropState(null);
                }}
                onClick={() => {
                  if (hasSnippet) {
                    toggleSnippet(nodeKey);
                  }
                }}
                title={hasSnippet ? (isSnippetExpanded ? "Hide code context" : "Show code context") : "No code context"}
              >
                {displayRelationLabel ? <span className="relation-pill">{displayRelationLabel}</span> : null}
                <span className="case-tree-row-main">
                  <span className="case-tree-entity-label">{node.label}</span>
                  {showTrailingTypeLabel ? <span className="small">{node.typeLabel}</span> : null}
                </span>
              </button>
              {node.locator ? <LocatorLink locator={node.locator} assetId={node.assetId} /> : null}
              {node.caseLinks.map((linkedCase) => (
                <EntityNavLink key={linkedCase.id} type="CASE" id={linkedCase.id} label={linkedCase.label} />
              ))}
              <EntityNavLink type={node.entityType} id={node.entityId} label="↗" />
              {showInlineDescription ? <span className="case-tree-description">{description}</span> : null}
            </div>
          </ContextMenuTrigger>
          {(canDelete || canCreateCheck || canEditDescription) ? (
            <ContextMenuContent>
              {canEditDescription ? <ContextMenuItem onSelect={() => editNodeDescription(node, nodeKey)}>{description ? "Edit description" : "Add description"}</ContextMenuItem> : null}
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
    const description = String(node.userDescription ?? "").trim();
    const isEditingDescription = relationDescriptionModal?.nodeKey === nodeKey;
    if ((!hasSnippet || !isSnippetExpanded) && !isEditingDescription) {
      return null;
    }
    return (
      <div className="case-tree-detail-grid">
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
                await api.updateRelation(current.relationId, { properties: currentProperties });
                await reload();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setRelationDescriptionModal(null);
                }
              }}
            />
          </div>
        ) : description ? (
          <div className="case-tree-detail-description">
            {description}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <main>
      <div className="cases-summary-strip">
        <span className="cases-summary-chip">Cases {rows.length}</span>
        <span className="cases-summary-chip">Open {rows.filter((row) => row.status === "OPEN").length}</span>
        <div className="cases-summary-picker">
          <span className="field-label">Case</span>
          <select
            id="case-selector"
            value={selectedId ?? ""}
            onChange={(event) => setSelectedId(event.target.value || null)}
          >
            <option value="">Select case...</option>
            {orderedRows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="cases-header-row">
        <div className="cases-header-main">
          <div className="cases-header-topline">
            <div className="cases-title-row">
              <h1>Cases</h1>
              {selected ? <span className="badge badge-info">{selected.status}</span> : null}
            </div>
            <div className="cases-header-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setIsCreateOpen(true)}>Create</button>
              <button className="btn" type="button" disabled={!selected} onClick={() => setIsEditOpen(true)}>Edit</button>
            </div>
          </div>
          {selected ? (
            <InlineEditableText
              editing={isRenamingCase}
              selectOnFocus={false}
              value={selected.title}
              className="cases-current-title"
              displayClassName="cases-current-title-display"
              inputClassName="cases-current-title-input"
              onActivate={() => setIsRenamingCase(true)}
              onCancel={() => setIsRenamingCase(false)}
              onSave={async (value) => {
                setIsRenamingCase(false);
                const nextTitle = value.trim();
                if (!nextTitle || nextTitle === selected.title) {
                  return;
                }
                await api.updateCase(selected.id, { title: nextTitle });
                await reload();
              }}
            />
          ) : null}
          <div className="cases-description-editor">
            {isEditingDescription ? (
              <textarea
                rows={3}
                value={descriptionDraft}
                disabled={!selected || isSavingDescription}
                autoFocus
                onChange={(event) => setDescriptionDraft(event.target.value)}
                onBlur={() => {
                  if (selected && descriptionDraft !== (selected.description ?? "")) {
                    void saveDescription();
                  } else {
                    setIsEditingDescription(false);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void saveDescription();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setDescriptionDraft(selected?.description ?? "");
                    setIsEditingDescription(false);
                  }
                }}
                placeholder="Double click for edit..."
              />
            ) : (
              <p
                className={`cases-description-display ${!selected?.description ? "is-placeholder" : ""}`}
                onClick={() => setIsRenamingCase(false)}
                onDoubleClick={() => {
                  if (selected) {
                    setIsEditingDescription(true);
                  }
                }}
                title={selected ? "Double click for edit" : "Select case first"}
              >
                {selected?.description?.trim() || "Double click for edit..."}
              </p>
            )}
          </div>
        </div>
      </div>
      {error ? <div className="error-text">{error}</div> : null}
      <ResourceCard title="Linked Entities">
        <div
          className="relation-tree relation-tree-root"
          onDragOver={(event) => {
            if (!selected) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            setDropState({ targetKey: `CASE:${selected.id}`, position: "inside" });
          }}
          onDragLeave={(event) => {
            event.stopPropagation();
            setDropState((current) => (current?.targetKey === `CASE:${selected?.id ?? ""}` ? null : current));
          }}
          onDrop={(event) => {
            event.stopPropagation();
            if (selected) {
              void handleEntityDrop(event, "CASE", selected.id);
            }
          }}
        >
          {relationTree ? (
            <TreeView
              roots={relationTreeRoots}
              getId={(node) => `${node.entityType}:${node.entityId}`}
              getChildren={(node) => node.children}
              collapsedIds={collapsedIds}
              onToggle={toggleCollapsed}
              renderLine={renderGraphLine}
              renderAfterLine={renderGraphAfterLine}
              variant="relation"
            />
          ) : <p className="small">No linked entities.</p>}
        </div>
      </ResourceCard>
      {isCreateOpen ? (
        <ModalShell
          title="Create Case"
          subtitle="Create a compact investigation record inside the selected assessment."
          onClose={() => setIsCreateOpen(false)}
          isDirty={isCreateDirty}
          closeWarningDetail="This case draft has unsaved fields."
        >
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!selectedAssessmentId) {
                setError("Select assessment first");
                return;
              }
              await api.createCase(selectedAssessmentId, {
                title: createDraft.title,
                description: createDraft.description,
              });
              setIsCreateOpen(false);
              await reload();
            }}
          >
            <Field label="Title">
              <input
                name="title"
                required
                autoFocus
                value={createDraft.title}
                onChange={(event) => setCreateDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </Field>
            <Field label="Description">
              <textarea
                name="description"
                rows={4}
                value={createDraft.description}
                onChange={(event) => setCreateDraft((current) => ({ ...current, description: event.target.value }))}
              />
            </Field>
            <div className="inline-actions modal-actions">
              <button className="btn btn-small" type="submit">
                {plusIcon()}
                <span>Create case</span>
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}
      {isEditOpen && selected ? (
        <ModalShell
          title="Edit Case"
          subtitle={shortId(selected.id)}
          onClose={() => setIsEditOpen(false)}
          isDirty={isEditDirty}
          closeWarningDetail="The current case form has unsaved edits."
        >
          <form
            className="form-grid"
            onSubmit={async (event) => {
              event.preventDefault();
              await api.updateCase(selected.id, {
                title: editDraft.title,
                description: editDraft.description,
                status: editDraft.status,
              });
              setIsEditOpen(false);
              await reload();
            }}
          >
            <div className="form-grid-2">
              <Field label="Title">
                <input name="title" value={editDraft.title} onChange={(event) => setEditDraft((current) => ({ ...current, title: event.target.value }))} />
              </Field>
              <Field label="Status">
                <select name="status" value={editDraft.status} onChange={(event) => setEditDraft((current) => ({ ...current, status: event.target.value }))}>
                  {["OPEN", "IN_PROGRESS", "NEEDS_REVIEW", "RESOLVED", "CLOSED"].map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Description">
              <textarea name="description" rows={4} value={editDraft.description} onChange={(event) => setEditDraft((current) => ({ ...current, description: event.target.value }))} />
            </Field>
            <div className="inline-actions modal-actions">
              <button className="btn btn-small" type="submit">
                {saveIcon()}
                <span>Save case</span>
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}
    </main>
  );
}

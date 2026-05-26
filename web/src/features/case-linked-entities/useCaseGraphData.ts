import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Candidate,
  CaseRecord,
  CheckRecord,
  FindingRecord,
  MarkRecord,
  ObjectRecord,
  RelationRecord,
} from "../../api/client";
import { useWorkbench } from "@web/app/workbench";
import { shortId } from "../../pages/utils";
import type { CaseGraphDataBundle, GraphNode, GraphSnippet } from "./types";

function normalizeLabel(value?: string | null) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return undefined;
  }
  if (["none", "null", "undefined"].includes(trimmed.toLowerCase())) {
    return undefined;
  }
  return trimmed;
}

export type UseCaseGraphDataOptions = {
  preloadedData?: CaseGraphDataBundle | null;
  preloadedError?: string | null;
  onRequestReload?: () => void;
};

function applyGraphBundle(
  bundle: CaseGraphDataBundle,
  setters: {
    setRows: (value: CaseRecord[]) => void;
    setRelations: (value: RelationRecord[]) => void;
    setMarks: (value: MarkRecord[]) => void;
    setChecks: (value: CheckRecord[]) => void;
    setFindings: (value: FindingRecord[]) => void;
    setObjects: (value: ObjectRecord[]) => void;
    setCandidates: (value: Candidate[]) => void;
  },
) {
  setters.setRows(bundle.rows);
  setters.setRelations(bundle.relations);
  setters.setMarks(bundle.marks);
  setters.setChecks(bundle.checks);
  setters.setFindings(bundle.findings);
  setters.setObjects(bundle.objects);
  setters.setCandidates(bundle.candidates);
}

export function useCaseGraphData(
  caseId: string | null,
  refreshToken?: number,
  options?: UseCaseGraphDataOptions,
) {
  const { api, selectedAssessmentId } = useWorkbench();
  const apiRef = useRef(api);
  apiRef.current = api;
  const onRequestReloadRef = useRef(options?.onRequestReload);
  onRequestReloadRef.current = options?.onRequestReload;
  const usePreloaded = options?.onRequestReload !== undefined;

  const [rows, setRows] = useState<CaseRecord[]>(() => options?.preloadedData?.rows ?? []);
  const [relations, setRelations] = useState<RelationRecord[]>(() => options?.preloadedData?.relations ?? []);
  const [marks, setMarks] = useState<MarkRecord[]>(() => options?.preloadedData?.marks ?? []);
  const [checks, setChecks] = useState<CheckRecord[]>(() => options?.preloadedData?.checks ?? []);
  const [findings, setFindings] = useState<FindingRecord[]>(() => options?.preloadedData?.findings ?? []);
  const [objects, setObjects] = useState<ObjectRecord[]>(() => options?.preloadedData?.objects ?? []);
  const [candidates, setCandidates] = useState<Candidate[]>(() => options?.preloadedData?.candidates ?? []);
  const [error, setError] = useState(() => options?.preloadedError ?? "");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!options?.preloadedData) {
      if (options?.preloadedError) {
        setError(options.preloadedError);
      }
      return;
    }
    applyGraphBundle(options.preloadedData, {
      setRows,
      setRelations,
      setMarks,
      setChecks,
      setFindings,
      setObjects,
      setCandidates,
    });
    setError(options.preloadedError ?? "");
    setIsLoading(false);
  }, [options?.preloadedData, options?.preloadedError]);

  const reload = useCallback(async () => {
    if (onRequestReloadRef.current) {
      onRequestReloadRef.current();
      return;
    }
    if (!selectedAssessmentId) {
      setError("Assessment is not configured");
      setRows([]);
      setRelations([]);
      setMarks([]);
      setChecks([]);
      setFindings([]);
      setObjects([]);
      setCandidates([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const client = apiRef.current;
      const [caseRows, relationRows, markRows, checkRows, findingRows, objectRows, candidateRows] = await Promise.all([
        client.getCases(selectedAssessmentId),
        client.getRelations(selectedAssessmentId),
        client.getMarks(selectedAssessmentId),
        client.getChecks(selectedAssessmentId),
        client.getFindings(selectedAssessmentId),
        client.getObjects(selectedAssessmentId),
        client.getCandidates(selectedAssessmentId),
      ]);
      setRows(Array.isArray(caseRows) ? caseRows : []);
      setRelations(Array.isArray(relationRows) ? relationRows : []);
      setMarks(Array.isArray(markRows) ? markRows : []);
      setChecks(Array.isArray(checkRows) ? checkRows : []);
      setFindings(Array.isArray(findingRows) ? findingRows : []);
      setObjects(Array.isArray(objectRows) ? objectRows : []);
      setCandidates(Array.isArray(candidateRows) ? candidateRows : []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [selectedAssessmentId]);

  useEffect(() => {
    if (usePreloaded) {
      return;
    }
    void reload();
  }, [reload, usePreloaded]);

  useEffect(() => {
    if (usePreloaded || refreshToken === undefined) {
      return;
    }
    void reload();
  }, [refreshToken, reload, usePreloaded]);

  useEffect(() => {
    if (usePreloaded || !caseId) {
      return;
    }
    void reload();
  }, [caseId, reload, usePreloaded]);

  const selected = useMemo(
    () => (caseId ? rows.find((row) => row.id === caseId) ?? null : null),
    [rows, caseId],
  );

  const resolveEntityLabel = useCallback((type: string, id: string) => {
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
      return candidate
        ? normalizeLabel(String((candidate.proposed_payload as { title?: string; name?: string })?.title
          ?? (candidate.proposed_payload as { name?: string })?.name
          ?? candidate.candidate_type))
        : undefined;
    }
    return undefined;
  }, [rows, marks, checks, findings, objects, candidates]);

  const resolveEntityTypeLabel = useCallback((type: string, id: string) => {
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
  }, [marks, checks, findings, objects]);

  const resolveEntityIconKind = useCallback((type: string, id: string) => {
    const normalized = type.toUpperCase();
    if (normalized === "MARK") {
      return (marks.find((item) => item.id === id)?.kind ?? "MARK").toUpperCase();
    }
    if (normalized === "CHECK") {
      const check = checks.find((item) => item.id === id);
      return (check?.check_type ?? check?.category ?? "CHECK").toUpperCase();
    }
    if (normalized === "FINDING") {
      return (findings.find((item) => item.id === id)?.finding_type ?? "FINDING").toUpperCase();
    }
    if (normalized === "OBJECT") {
      const object = objects.find((item) => item.id === id);
      return (object?.kind ?? object?.type ?? "OBJECT").toUpperCase();
    }
    return normalized;
  }, [marks, checks, findings, objects]);

  const resolveEntityLocator = useCallback((type: string, id: string) => {
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
  }, [objects, marks]);

  const resolveEntityRange = useCallback((type: string, id: string) => {
    const normalized = type.toUpperCase();
    if (normalized === "OBJECT") {
      return objects.find((item) => item.id === id)?.range ?? null;
    }
    if (normalized === "MARK") {
      const mark = marks.find((item) => item.id === id);
      if (!mark) {
        return null;
      }
      return objects.find((item) => item.id === mark.object_id)?.range ?? null;
    }
    return null;
  }, [objects, marks]);

  const resolveRelationDescription = useCallback((relationId?: string) => {
    if (!relationId) {
      return null;
    }
    const relation = relations.find((item) => item.id === relationId);
    const properties = (relation?.properties ?? {}) as Record<string, unknown>;
    return String(properties.user_description ?? "").trim() || null;
  }, [relations]);

  const resolveRelationDisplayName = useCallback((relationId?: string) => {
    if (!relationId) {
      return null;
    }
    const relation = relations.find((item) => item.id === relationId);
    const properties = (relation?.properties ?? {}) as Record<string, unknown>;
    return String(properties.display_name ?? "").trim() || null;
  }, [relations]);

  const resolveEntityDescription = useCallback((type: string, id: string) => {
    const normalized = type.toUpperCase();
    if (normalized === "CHECK") {
      return String(checks.find((item) => item.id === id)?.description ?? "").trim() || null;
    }
    if (normalized === "MARK") {
      const mark = marks.find((item) => item.id === id);
      if (!mark) {
        return null;
      }
      const markNote = String(mark.note ?? "").trim();
      const properties = (objects.find((item) => item.id === mark.object_id)?.properties ?? {}) as Record<string, unknown>;
      const objectDesc = String(properties.user_description ?? "").trim();
      return markNote || objectDesc || null;
    }
    if (normalized === "OBJECT") {
      const properties = (objects.find((item) => item.id === id)?.properties ?? {}) as Record<string, unknown>;
      return String(properties.user_description ?? "").trim() || null;
    }
    return null;
  }, [checks, marks, objects]);

  const resolveEntityStatus = useCallback((type: string, id: string) => {
    const normalized = type.toUpperCase();
    if (normalized === "CHECK") {
      return checks.find((item) => item.id === id)?.status ?? null;
    }
    if (normalized === "CASE") {
      return rows.find((item) => item.id === id)?.status ?? null;
    }
    return null;
  }, [checks, rows]);

  const resolveEntityAssetId = useCallback((type: string, id: string) => {
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
  }, [objects, marks]);

  const resolveEntitySnippet = useCallback((type: string, id: string): GraphSnippet | null => {
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
      const highlightStartOffset = typeof properties.context_highlight_start_offset === "number"
        ? properties.context_highlight_start_offset
        : undefined;
      const highlightEndOffset = typeof properties.context_highlight_end_offset === "number"
        ? properties.context_highlight_end_offset
        : undefined;
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
      return fromObject(object);
    }
    if (normalized === "CANDIDATE") {
      const candidate = candidates.find((item) => item.id === id);
      const properties = ((candidate?.proposed_payload as { properties?: Record<string, unknown> })?.properties ?? {}) as Record<string, unknown>;
      const snippet = String(properties.context_snippet ?? "").trimEnd();
      if (!snippet) {
        return null;
      }
      return {
        snippet,
        selectedText: String(properties.selected_text ?? ""),
        highlightStartOffset: typeof properties.context_highlight_start_offset === "number"
          ? properties.context_highlight_start_offset
          : undefined,
        highlightEndOffset: typeof properties.context_highlight_end_offset === "number"
          ? properties.context_highlight_end_offset
          : undefined,
        startLine: typeof properties.context_start_line === "number" ? properties.context_start_line : undefined,
        endLine: typeof properties.context_end_line === "number" ? properties.context_end_line : undefined,
      };
    }
    return null;
  }, [objects, marks, candidates]);

  const relationTree = useMemo(() => {
    if (!selected) {
      return null;
    }
    const emitted = new Set<string>();

    const makeNode = (
      entityType: string,
      entityId: string,
      relationLabel: string | undefined,
      relationId: string | undefined,
      seen: Set<string>,
      inheritedDeadEnd = false,
    ): GraphNode | null => {
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
      if (entityType.toUpperCase() !== "CASE") {
        if (emitted.has(key)) {
          return null;
        }
        emitted.add(key);
      }

      const linked = relations.filter((relation) => {
        const subjectKey = `${relation.subject_type}:${relation.subject_id}`;
        const objectKey = `${relation.object_type}:${relation.object_id}`;
        return subjectKey === key || objectKey === key;
      }).sort((left, right) => {
        const leftProps = (left.properties ?? {}) as Record<string, unknown>;
        const rightProps = (right.properties ?? {}) as Record<string, unknown>;
        const leftOrder = typeof leftProps.linked_entities_order === "number" && Number.isFinite(leftProps.linked_entities_order)
          ? (leftProps.linked_entities_order as number)
          : null;
        const rightOrder = typeof rightProps.linked_entities_order === "number" && Number.isFinite(rightProps.linked_entities_order)
          ? (rightProps.linked_entities_order as number)
          : null;
        if (leftOrder !== null && rightOrder !== null && leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }
        if (leftOrder !== null && rightOrder === null) {
          return -1;
        }
        if (leftOrder === null && rightOrder !== null) {
          return 1;
        }
        const leftTime = left.created_at ? Date.parse(left.created_at) : 0;
        const rightTime = right.created_at ? Date.parse(right.created_at) : 0;
        if (leftTime !== rightTime) {
          return leftTime - rightTime;
        }
        return left.id.localeCompare(right.id);
      });

      const ownDeadEnd = entityType.toUpperCase() === "MARK"
        ? Boolean(marks.find((item) => item.id === entityId)?.is_dead_end)
        : false;
      const effectiveDeadEnd = inheritedDeadEnd || ownDeadEnd;

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
        const child = makeNode(neighborType, neighborId, relation.predicate, relation.id, nextSeen, effectiveDeadEnd);
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
        iconKind: resolveEntityIconKind(entityType, entityId),
        userDescription: resolveRelationDescription(relationId) ?? resolveEntityDescription(entityType, entityId),
        displayName: resolveRelationDisplayName(relationId),
        status: resolveEntityStatus(entityType, entityId),
        locator: resolveEntityLocator(entityType, entityId),
        range: resolveEntityRange(entityType, entityId),
        assetId: resolveEntityAssetId(entityType, entityId),
        relationId,
        snippet: resolveEntitySnippet(entityType, entityId),
        relationLabel,
        caseLinks,
        isDeadEnd: ownDeadEnd,
        isDeadEndInherited: inheritedDeadEnd && !ownDeadEnd,
        children,
      };
    };

    return makeNode("CASE", selected.id, undefined, undefined, new Set<string>());
  }, [
    selected,
    relations,
    marks,
    resolveEntityLabel,
    resolveEntityTypeLabel,
    resolveEntityIconKind,
    resolveRelationDescription,
    resolveRelationDisplayName,
    resolveEntityDescription,
    resolveEntityStatus,
    resolveEntityLocator,
    resolveEntityRange,
    resolveEntityAssetId,
    resolveEntitySnippet,
  ]);

  const relationTreeRoots = relationTree ? relationTree.children : [];

  return {
    selected,
    relations,
    relationTree,
    relationTreeRoots,
    reload,
    error,
    setError,
    selectedAssessmentId,
    isLoading,
  };
}

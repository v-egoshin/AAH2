import type {
  Candidate,
  CaseRecord,
  CheckRecord,
  FindingRecord,
  MarkRecord,
  ObjectRecord,
  RelationRecord,
} from "../../api/client";

export type CaseGraphDataBundle = {
  rows: CaseRecord[];
  relations: RelationRecord[];
  marks: MarkRecord[];
  checks: CheckRecord[];
  findings: FindingRecord[];
  objects: ObjectRecord[];
  candidates: Candidate[];
};

export type GraphSnippet = {
  snippet: string;
  selectedText?: string;
  highlightStartOffset?: number;
  highlightEndOffset?: number;
  startLine?: number;
  endLine?: number;
};

export type GraphNode = {
  entityType: string;
  entityId: string;
  label: string;
  typeLabel: string;
  iconKind?: string;
  userDescription?: string | null;
  displayName?: string | null;
  status?: string | null;
  locator?: string | null;
  range?: { file?: string; start_line?: number; end_line?: number } | null;
  assetId?: string | null;
  relationId?: string;
  relationLabel?: string;
  snippet?: GraphSnippet | null;
  caseLinks: Array<{ id: string; label: string }>;
  isDeadEnd?: boolean;
  isDeadEndInherited?: boolean;
  children: GraphNode[];
};

export type RelationDropState = {
  targetKey: string;
  position: "inside";
};

export type RelationDescriptionModalState = {
  relationId: string;
  label: string;
  draft: string;
  nodeKey: string;
  entityType: string;
  entityId: string;
};

export type RelationDisplayModalState = {
  relationId: string;
  label: string;
  draft: string;
  nodeKey: string;
};

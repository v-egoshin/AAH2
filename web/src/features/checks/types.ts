import type { CaseRecord, CheckRecord, RelationRecord } from "../../api/client";

export type ChecksDataBundle = {
  checks: CheckRecord[];
  cases: CaseRecord[];
  relations: RelationRecord[];
};

export type EmbedChecksHostMutations = {
  createCheck: (assessmentId: string, payload: Record<string, unknown>) => Promise<{ id: string }>;
  updateCheck: (checkId: string, payload: Record<string, unknown>) => Promise<void>;
  deleteCheck: (checkId: string) => Promise<void>;
  createRelation: (assessmentId: string, payload: Record<string, unknown>) => Promise<void>;
  deleteRelation: (relationId: string) => Promise<void>;
  convertCheckToFinding: (checkId: string, payload: Record<string, unknown>) => Promise<void>;
};

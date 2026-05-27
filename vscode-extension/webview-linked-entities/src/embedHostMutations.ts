import type { EmbedHostMutations } from "@web/features/case-linked-entities/CaseLinkedEntitiesPanel";

import { requestHostMutation } from "./hostApi";

export const embedHostMutations: EmbedHostMutations = {
  movePartOf: (payload) => requestHostMutation("movePartOf", {
    subjectType: payload.subjectType,
    subjectId: payload.subjectId,
    objectType: payload.objectType,
    objectId: payload.objectId,
    relations: payload.relations,
  }),
  updateDescription: (payload) => requestHostMutation("updateDescription", payload),
  updateDisplayName: (payload) => requestHostMutation("updateDisplayName", payload),
  deleteRelation: (relationId) => requestHostMutation("deleteRelation", { relationId }),
  createCheckFromNode: (payload) => requestHostMutation("createCheckFromNode", payload),
  toggleDeadEnd: (payload) => requestHostMutation("toggleDeadEnd", payload),
  patchRelationPropertiesBatch: (payload) =>
    requestHostMutation("patchRelationPropertiesBatch", { patches: payload.patches } as Record<string, unknown>),
  changeMarkKind: (payload) => requestHostMutation("changeMarkKind", payload),
};

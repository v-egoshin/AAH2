import { WorkbenchApiClient } from "../api/client";

type RelationRow = {
  id: string;
  predicate?: string;
  subject_type?: string;
  subject_id?: string;
  object_type?: string;
  object_id?: string;
  properties?: Record<string, unknown>;
};

export async function movePartOfRelation(
  client: WorkbenchApiClient,
  relations: RelationRow[],
  subjectType: string,
  subjectId: string,
  objectType: string,
  objectId: string,
) {
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
  if (existingPartOf) {
    await client.updateRelation(existingPartOf.id, {
      object_type: objectType,
      object_id: objectId,
    });
    return;
  }
  await client.createRelation({
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

export async function updateRelationDescription(
  client: WorkbenchApiClient,
  relationId: string,
  entityType: string,
  entityId: string,
  properties: Record<string, unknown>,
  note: string | null,
) {
  await client.updateRelation(relationId, { properties });
  if (entityType.toUpperCase() === "MARK") {
    await client.updateMark(entityId, { note });
  }
}

export async function toggleMarksDeadEnd(
  client: WorkbenchApiClient,
  markIds: string[],
  isDeadEnd: boolean,
) {
  await Promise.all(markIds.map((markId) => client.updateMark(markId, { is_dead_end: isDeadEnd })));
}

export async function createCheckFromNode(
  client: WorkbenchApiClient,
  caseId: string,
  entityType: string,
  entityId: string,
  label: string,
  userDescription: string,
) {
  const created = await client.createCheck({
    title: label,
    description: userDescription,
    status: "NOT_STARTED",
    priority: "MEDIUM",
    source: "OTHER",
  }) as { id: string };
  await client.createRelation({
    subject_type: entityType,
    subject_id: entityId,
    predicate: "CHECKS",
    object_type: "CHECK",
    object_id: created.id,
    confidence: "MEDIUM",
    status: "ACCEPTED",
    source: "OTHER",
    properties: {},
  });
  await client.createRelation({
    subject_type: "CHECK",
    subject_id: created.id,
    predicate: "PART_OF",
    object_type: "CASE",
    object_id: caseId,
    confidence: "MEDIUM",
    status: "ACCEPTED",
    source: "OTHER",
    properties: {},
  });
}

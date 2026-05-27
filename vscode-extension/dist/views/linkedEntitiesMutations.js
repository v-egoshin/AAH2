"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.movePartOfRelation = movePartOfRelation;
exports.updateRelationDescription = updateRelationDescription;
exports.toggleMarksDeadEnd = toggleMarksDeadEnd;
exports.changeMarkKind = changeMarkKind;
exports.createCheckFromNode = createCheckFromNode;
async function movePartOfRelation(client, relations, subjectType, subjectId, objectType, objectId) {
    if (subjectType === objectType && subjectId === objectId) {
        return;
    }
    const exact = relations.find((relation) => relation.predicate === "PART_OF"
        && relation.subject_type === subjectType
        && relation.subject_id === subjectId
        && relation.object_type === objectType
        && relation.object_id === objectId);
    if (exact) {
        return;
    }
    const existingPartOf = relations.find((relation) => relation.predicate === "PART_OF"
        && relation.subject_type === subjectType
        && relation.subject_id === subjectId);
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
async function updateRelationDescription(client, relationId, entityType, entityId, properties, note) {
    await client.updateRelation(relationId, { properties });
    if (entityType.toUpperCase() === "MARK") {
        await client.updateMark(entityId, { note });
    }
}
async function toggleMarksDeadEnd(client, markIds, isDeadEnd) {
    await Promise.all(markIds.map((markId) => client.updateMark(markId, { is_dead_end: isDeadEnd })));
}
async function changeMarkKind(client, markId, kind) {
    await client.updateMark(markId, { kind });
}
async function createCheckFromNode(client, caseId, entityType, entityId, label, userDescription) {
    const created = await client.createCheck({
        title: label,
        description: userDescription,
        status: "NOT_STARTED",
        priority: "MEDIUM",
        source: "OTHER",
    });
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

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadCaseGraphData = loadCaseGraphData;
function asArray(value) {
    return Array.isArray(value) ? value : [];
}
async function loadCaseGraphData(client) {
    const [caseRows, relationRows, markRows, checkRows, findingRows, objectRows, candidateRows] = await Promise.all([
        client.listCases(),
        client.getRelations(),
        client.listMarks(),
        client.listChecks(),
        client.listFindings(),
        client.listObjects(),
        client.listCandidates(),
    ]);
    return {
        rows: asArray(caseRows),
        relations: asArray(relationRows),
        marks: asArray(markRows),
        checks: asArray(checkRows),
        findings: asArray(findingRows),
        objects: asArray(objectRows),
        candidates: asArray(candidateRows),
    };
}

export type CaseGraphDataBundle = {
  rows: unknown[];
  relations: unknown[];
  marks: unknown[];
  checks: unknown[];
  findings: unknown[];
  objects: unknown[];
  candidates: unknown[];
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export async function loadCaseGraphData(
  client: {
    listCases: () => Promise<unknown>;
    getRelations: () => Promise<unknown>;
    listMarks: () => Promise<unknown>;
    listChecks: () => Promise<unknown>;
    listFindings: () => Promise<unknown>;
    listObjects: () => Promise<unknown>;
    listCandidates: () => Promise<unknown>;
  },
): Promise<CaseGraphDataBundle> {
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

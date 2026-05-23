import { describe, expect, it } from "vitest";

import { buildTreeFromFlatRows, collectTreeIds, filterTree, parseBulkChecksInput } from "./tree-utils";

describe("tree-utils", () => {
  it("keeps parents when matching children survive filtering", () => {
    const tree = buildTreeFromFlatRows([
      { id: "group-a", title: "Group A", parentId: null, sortOrder: 0, isGroup: true },
      { id: "check-a1", title: "Check A1", parentId: "group-a", sortOrder: 0, isGroup: false, status: "FAILED" },
      { id: "group-b", title: "Group B", parentId: null, sortOrder: 1, isGroup: true },
      { id: "check-b1", title: "Check B1", parentId: "group-b", sortOrder: 0, isGroup: false, status: "FAILED" },
    ]);

    const filtered = filterTree(tree, (node) => node.status === "FAILED");
    const ids = collectTreeIds(filtered);

    expect(ids.has("group-a")).toBe(true);
    expect(ids.has("group-b")).toBe(true);
    expect(ids.has("check-a1")).toBe(true);
    expect(ids.has("check-b1")).toBe(true);
  });

  it("parses bulk checks by non-empty trimmed lines", () => {
    expect(parseBulkChecksInput(" One \n\n Two \n  \nThree ")).toEqual(["One", "Two", "Three"]);
  });
});

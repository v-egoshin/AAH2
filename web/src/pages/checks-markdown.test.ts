import { describe, expect, it } from "vitest";

import { diffChecksImport, exportChecksToMarkdown, parseChecksMarkdown } from "./checks-markdown";

describe("checks-markdown", () => {
  it("exports checks with ids and descriptions", () => {
    const markdown = exportChecksToMarkdown([
      {
        id: "group-1",
        assessment_id: "assessment-1",
        title: "Dangerous configuration",
        is_group: true,
        status: "NOT_STARTED",
        sort_order: 0,
      },
      {
        id: "check-1",
        assessment_id: "assessment-1",
        title: "StringTemplateResolver uses untrusted template",
        description: "Review template construction path.",
        parent_check_id: "group-1",
        is_group: false,
        is_checked: false,
        status: "NOT_STARTED",
        sort_order: 0,
      },
    ]);

    expect(markdown).toContain("## Group: Dangerous configuration");
    expect(markdown).toContain("<!-- check_id: check-1 -->");
    expect(markdown).toContain("- description: Review template construction path.");
  });

  it("parses markdown and diffs added/updated/skipped entries", () => {
    const parsed = parseChecksMarkdown(`# Checks

## Group: Dangerous configuration

- [ ] StringTemplateResolver uses untrusted template
  <!-- check_id: check-1 -->
  - description: Review template construction path.
  - status: FAILED

- [ ] New check
  - status: NOT_STARTED
`);

    const diff = diffChecksImport([
      {
        id: "check-1",
        assessment_id: "assessment-1",
        title: "StringTemplateResolver uses untrusted template",
        description: "Old description",
        is_group: false,
        status: "NOT_STARTED",
      },
    ], parsed);

    expect(parsed.errors).toEqual([]);
    expect(diff.updated).toHaveLength(1);
    expect(diff.added).toHaveLength(1);
    expect(diff.skipped).toHaveLength(0);
  });
});

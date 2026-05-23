import type { CheckRecord } from "../api/client";
import { buildTreeFromFlatRows } from "../components/tree-utils";

export type ParsedMarkdownCheck = {
  title: string;
  description: string;
  status: string;
  checkId?: string;
  groupTitle?: string;
};

export type ParsedChecksImport = {
  checks: ParsedMarkdownCheck[];
  errors: string[];
};

export type ChecksImportDiff = {
  added: ParsedMarkdownCheck[];
  updated: Array<{ current: CheckRecord; incoming: ParsedMarkdownCheck }>;
  skipped: ParsedMarkdownCheck[];
  errors: string[];
};

function statusCheckbox(status: string, isChecked: boolean) {
  return isChecked || status === "CHECKED_OK" ? "x" : " ";
}

function normalizeStatus(status: string) {
  const normalized = status.trim().toUpperCase().replace(/\s+/g, "_");
  if (normalized === "TODO" || normalized === "NEW") {
    return "NOT_STARTED";
  }
  return normalized || "NOT_STARTED";
}

export function exportChecksToMarkdown(rows: CheckRecord[]) {
  const tree = buildTreeFromFlatRows(rows.map((row) => ({
    ...row,
    parentId: row.parent_check_id ?? null,
    sortOrder: row.sort_order ?? 0,
  })));
  const lines: string[] = ["# Checks", ""];

  const writeCheck = (row: CheckRecord) => {
    lines.push(`- [${statusCheckbox(row.status, Boolean(row.is_checked))}] ${row.title}`);
    lines.push(`  <!-- check_id: ${row.id} -->`);
    if (row.description?.trim()) {
      lines.push(`  - description: ${row.description.trim()}`);
    }
    lines.push(`  - status: ${row.status}`);
    lines.push("");
  };

  const writeGroup = (row: CheckRecord & { children?: CheckRecord[] }, depth = 2) => {
    const heading = `${"#".repeat(depth)} Group: ${row.title}`;
    lines.push(heading);
    lines.push("");
    for (const child of row.children ?? []) {
      if (child.is_group) {
        writeGroup(child as CheckRecord & { children?: CheckRecord[] }, depth + 1);
      } else {
        writeCheck(child);
      }
    }
  };

  const ungrouped = tree.filter((row) => !row.is_group);
  const groups = tree.filter((row) => row.is_group);
  for (const group of groups) {
    writeGroup(group as CheckRecord & { children?: CheckRecord[] });
  }
  if (ungrouped.length) {
    lines.push("## Group: Ungrouped");
    lines.push("");
    for (const row of ungrouped) {
      writeCheck(row);
    }
  }
  return lines.join("\n").trim();
}

export function parseChecksMarkdown(markdown: string): ParsedChecksImport {
  const checks: ParsedMarkdownCheck[] = [];
  const errors: string[] = [];
  let currentGroupTitle: string | undefined;
  let currentCheck: ParsedMarkdownCheck | null = null;

  const flushCurrent = () => {
    if (currentCheck) {
      checks.push(currentCheck);
      currentCheck = null;
    }
  };

  markdown.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trimEnd();
    const groupMatch = line.match(/^##+#\s+Group:\s+(.+)$/);
    if (groupMatch) {
      flushCurrent();
      currentGroupTitle = groupMatch[1].trim();
      return;
    }
    const itemMatch = line.match(/^- \[( |x|X)\] (.+)$/);
    if (itemMatch) {
      flushCurrent();
      currentCheck = {
        title: itemMatch[2].trim(),
        description: "",
        status: itemMatch[1].toLowerCase() === "x" ? "CHECKED_OK" : "NOT_STARTED",
        groupTitle: currentGroupTitle && currentGroupTitle !== "Ungrouped" ? currentGroupTitle : undefined,
      };
      return;
    }
    const idMatch = line.match(/^<!--\s*check_id:\s*(.+?)\s*-->$/);
    if (idMatch && currentCheck) {
      currentCheck.checkId = idMatch[1].trim();
      return;
    }
    const descriptionMatch = line.match(/^- description:\s*(.*)$/);
    if (descriptionMatch && currentCheck) {
      currentCheck.description = descriptionMatch[1].trim();
      return;
    }
    const statusMatch = line.match(/^- status:\s*(.+)$/);
    if (statusMatch && currentCheck) {
      currentCheck.status = normalizeStatus(statusMatch[1]);
      return;
    }
    if (line.startsWith("- ") && !itemMatch) {
      errors.push(`Line ${index + 1}: unsupported item format`);
    }
  });
  flushCurrent();
  return { checks, errors };
}

export function diffChecksImport(currentRows: CheckRecord[], parsed: ParsedChecksImport): ChecksImportDiff {
  const added: ParsedMarkdownCheck[] = [];
  const updated: Array<{ current: CheckRecord; incoming: ParsedMarkdownCheck }> = [];
  const skipped: ParsedMarkdownCheck[] = [];
  for (const incoming of parsed.checks) {
    const current = incoming.checkId
      ? currentRows.find((row) => row.id === incoming.checkId)
      : currentRows.find((row) => row.title === incoming.title);
    if (!current) {
      added.push(incoming);
      continue;
    }
    const changed = current.title !== incoming.title
      || (current.description ?? "") !== incoming.description
      || current.status !== incoming.status;
    if (changed) {
      updated.push({ current, incoming });
    } else {
      skipped.push(incoming);
    }
  }
  return {
    added,
    updated,
    skipped,
    errors: parsed.errors,
  };
}

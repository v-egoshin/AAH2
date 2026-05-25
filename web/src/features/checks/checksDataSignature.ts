import type { ChecksDataBundle } from "./types";

export function checksDataSignature(bundle: ChecksDataBundle | null | undefined) {
  if (!bundle) {
    return "";
  }
  const checkSig = bundle.checks.map((row) =>
    `${row.id}:${row.parent_check_id ?? ""}:${row.sort_order ?? 0}:${row.status}:${row.is_checked ? 1 : 0}:${row.title}`,
  ).join("|");
  const relationSig = bundle.relations.map((row) =>
    `${row.id}:${row.subject_id}:${row.object_id}:${row.predicate}`,
  ).join("|");
  return `${checkSig}#${relationSig}`;
}

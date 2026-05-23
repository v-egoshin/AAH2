import { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { Badge } from "../components/common";

export function shortId(value?: string | null) {
  return value ? value.slice(0, 8) : "—";
}

export function statusTone(value?: string | null): "neutral" | "good" | "warn" | "bad" | "info" {
  const normalized = (value ?? "").toUpperCase();
  if (["ACCEPTED", "CONFIRMED", "CHECKED_OK", "COMPLETED", "ACTIVE"].includes(normalized)) {
    return "good";
  }
  if (["FAILED", "ERROR", "DISMISSED", "REJECTED", "BLOCKED"].includes(normalized)) {
    return "bad";
  }
  if (["NEEDS_REVIEW", "IN_PROGRESS", "OPEN", "NEW", "HIGH", "CRITICAL"].includes(normalized)) {
    return "warn";
  }
  return "info";
}

export function statusBadge(value?: string | null): ReactNode {
  return <Badge value={value ?? "—"} tone={statusTone(value)} />;
}

export function countRelations(entityId: string, relations: Array<{ subject_id: string; object_id: string }>) {
  return relations.filter((relation) => relation.subject_id === entityId || relation.object_id === entityId).length;
}

const ENTITY_ROUTE_MAP: Record<string, string> = {
  ASSET: "/assets",
  IMPORT: "/imports",
  IMPORT_BATCH: "/imports",
  CANDIDATE: "/candidates",
  OBJECT: "/objects",
  MARK: "/marks",
  CHECK: "/checks",
  CASE: "/cases",
  FINDING: "/findings",
  RELATION: "/relations",
  ASSESSMENT: "/",
};

export function entityPath(type?: string | null, id?: string | null) {
  if (!type || !id) {
    return "";
  }
  const route = ENTITY_ROUTE_MAP[String(type).toUpperCase()];
  return route ? `${route}?selected=${id}` : "";
}

export function EntityNavLink({
  type,
  id,
  label,
  fallback,
}: {
  type?: string | null;
  id?: string | null;
  label?: ReactNode;
  fallback?: ReactNode;
}) {
  const href = entityPath(type, id);
  if (!href) {
    return <>{fallback ?? label ?? "—"}</>;
  }
  return <Link className="entity-link" to={href}>{label ?? fallback ?? shortId(id)}</Link>;
}

export function SelectableNameButton({
  selected,
  onClick,
  children,
}: {
  selected?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button className={`link-button ${selected ? "is-active" : ""}`} onClick={onClick} type="button">
      {children}
    </button>
  );
}

export function useSelectedIdParam() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("selected") ?? "";

  const setSelectedId = (value: string) => {
    const next = new URLSearchParams(params);
    if (value) {
      next.set("selected", value);
    } else {
      next.delete("selected");
    }
    setParams(next, { replace: true });
  };

  return [selectedId, setSelectedId] as const;
}

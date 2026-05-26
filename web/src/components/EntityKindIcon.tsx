import sourceIcon from "../assets/entity-icons/source.svg?url";
import sinkIcon from "../assets/entity-icons/sink.svg?url";
import guardIcon from "../assets/entity-icons/guard.svg?url";
import transformIcon from "../assets/entity-icons/transform.svg?url";
import markIcon from "../assets/entity-icons/mark.svg?url";
import checkIcon from "../assets/entity-icons/check.svg?url";
import entityIcon from "../assets/entity-icons/entity.svg?url";
import { useMarkKindAccentByKind } from "../context/MarkKindAccentContext";

const ICONS: Record<string, string> = {
  SOURCE: sourceIcon,
  SINK: sinkIcon,
  GUARD: guardIcon,
  TRANSFORM: transformIcon,
  NOTE: markIcon,
  MARK: markIcon,
  CHECK: checkIcon,
  CASE: entityIcon,
  FINDING: entityIcon,
  OBJECT: entityIcon,
  EVIDENCE: entityIcon,
  CANDIDATE: entityIcon,
};

const STRUCTURAL_KINDS = new Set(["SOURCE", "SINK", "GUARD", "TRANSFORM"]);

export function EntityKindIcon({ kind }: { kind?: string | null }) {
  const accentByKind = useMarkKindAccentByKind();
  const normalized = (kind ?? "MARK").toUpperCase();
  const src = ICONS[normalized] ?? entityIcon;
  const accent = accentByKind[normalized];
  /** Gutter semantics: structured kinds keep SVG; generic/custom marks use catalog-colored dot only */
  const showGlyph = STRUCTURAL_KINDS.has(normalized) || !accent;
  return (
    <span className="entity-kind-icon-wrap">
      {accent ? (
        <span className="entity-kind-accent-dot" style={{ backgroundColor: accent }} aria-hidden />
      ) : null}
      {showGlyph ? (
        <img
          className="entity-kind-icon"
          src={src}
          alt=""
          aria-hidden="true"
          width={16}
          height={16}
        />
      ) : null}
    </span>
  );
}

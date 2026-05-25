import sourceIcon from "../assets/entity-icons/source.svg?url";
import sinkIcon from "../assets/entity-icons/sink.svg?url";
import guardIcon from "../assets/entity-icons/guard.svg?url";
import transformIcon from "../assets/entity-icons/transform.svg?url";
import markIcon from "../assets/entity-icons/mark.svg?url";
import checkIcon from "../assets/entity-icons/check.svg?url";
import entityIcon from "../assets/entity-icons/entity.svg?url";

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

export function EntityKindIcon({ kind }: { kind?: string | null }) {
  const normalized = (kind ?? "MARK").toUpperCase();
  const src = ICONS[normalized] ?? entityIcon;
  return (
    <img
      className="entity-kind-icon"
      src={src}
      alt=""
      aria-hidden="true"
      width={16}
      height={16}
    />
  );
}

import deadEndIcon from "../assets/entity-icons/dead-end.svg?url";

export function EntityDeadEndBadge({ inherited }: { inherited?: boolean }) {
  return (
    <img
      className={`entity-dead-end-badge ${inherited ? "is-inherited" : ""}`}
      src={deadEndIcon}
      alt=""
      title={inherited ? "Dead end (inherited)" : "Dead end"}
      width={12}
      height={12}
    />
  );
}

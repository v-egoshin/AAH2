import deadEndIcon from "../assets/entity-icons/dead-end.svg?url";

export function EntityDeadEndBadge({ inherited }: { inherited?: boolean }) {
  return (
    <img
      className={`entity-dead-end-badge ${inherited ? "is-inherited" : ""}`}
      src={deadEndIcon}
      alt=""
      title={inherited ? "Inherited dead end" : "Dead end: no exploitable path"}
      width={14}
      height={14}
    />
  );
}

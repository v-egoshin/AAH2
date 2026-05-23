import { ReactNode, useEffect, useId, useState } from "react";

export function ModalGlyph({
  children,
  viewBox = "0 0 16 16",
  className = "ui-glyph",
}: {
  children: ReactNode;
  viewBox?: string;
  className?: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function ModalShell({
  title,
  subtitle,
  onClose,
  isDirty = false,
  closeWarningTitle = "Discard changes?",
  closeWarningDetail = "There are unsaved edits in this form.",
  width = "medium",
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  isDirty?: boolean;
  closeWarningTitle?: string;
  closeWarningDetail?: string;
  width?: "narrow" | "medium";
  children: ReactNode;
}) {
  const titleId = useId();
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);

  const requestClose = () => {
    if (isDirty) {
      setShowDiscardWarning(true);
      return;
    }
    onClose();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      if (isDirty) {
        setShowDiscardWarning(true);
        return;
      }
      onClose();
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isDirty, onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onClick={requestClose}>
      <div
        className={`modal-card modal-card-${width}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-copy">
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <div className="small modal-subtitle">{subtitle}</div> : null}
          </div>
          <button className="modal-close-button" type="button" aria-label="Close dialog" onClick={requestClose}>
            <ModalGlyph>
              <path d="M4 4 12 12" />
              <path d="M12 4 4 12" />
            </ModalGlyph>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {showDiscardWarning ? (
          <div className="modal-warning" role="alert">
            <div className="modal-warning-copy">
              <span className="modal-warning-icon" aria-hidden="true">
                <ModalGlyph>
                  <path d="M8 2.75 13 12.25H3z" />
                  <path d="M8 6v2.7" />
                  <path d="M8 11.2h.01" />
                </ModalGlyph>
              </span>
              <div>
                <strong>{closeWarningTitle}</strong>
                <div className="small">{closeWarningDetail}</div>
              </div>
            </div>
            <div className="modal-warning-actions">
              <button className="btn btn-subtle btn-small" type="button" onClick={() => setShowDiscardWarning(false)}>
                Keep editing
              </button>
              <button className="btn btn-danger btn-small" type="button" onClick={onClose}>
                Discard
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

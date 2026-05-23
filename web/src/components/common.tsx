import { FormEvent, KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p className="small">{detail}</p>
    </div>
  );
}

export function SectionHeader({ title, detail, actions }: { title: string; detail?: string; actions?: ReactNode }) {
  return (
    <div className="section-header">
      <div>
        <h1>{title}</h1>
        {detail ? <p className="small">{detail}</p> : null}
      </div>
      {actions ? <div className="section-actions">{actions}</div> : null}
    </div>
  );
}

export function ShortId({ value }: { value?: string | null }) {
  if (!value) {
    return <>—</>;
  }
  return <span className="short-id" title={value}>{value.slice(0, 8)}</span>;
}

export function Badge({ value, tone = "neutral" }: { value: ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "info" }) {
  return <span className={`badge badge-${tone}`}>{value}</span>;
}

export function MetricStrip({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <div className="metric-strip">
      {items.map((item) => (
        <div key={String(item.label)} className="metric-tile card">
          <div className="small">{item.label}</div>
          <div className="metric">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="drawer-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function KeyValueList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <div className="key-value-list">
      {items.map((item) => (
        <div key={String(item.label)} className="key-value-row">
          <span className="small">{item.label}</span>
          <div>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="small">{hint}</span> : null}
    </label>
  );
}

export function InlineEditableText({
  value,
  placeholder = "Untitled",
  disabled = false,
  activation = "double-click",
  className = "",
  displayClassName = "",
  inputClassName = "",
  editing: controlledEditing,
  onCancel,
  onActivate,
  selectOnFocus = true,
  onSave,
}: {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  activation?: "double-click";
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  editing?: boolean;
  onCancel?: () => void;
  onActivate?: () => void;
  selectOnFocus?: boolean;
  onSave: (value: string) => void | Promise<void>;
}) {
  const [uncontrolledEditing, setUncontrolledEditing] = useState(false);
  const editing = controlledEditing ?? uncontrolledEditing;
  const [draft, setDraft] = useState(value);
  const editorRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [editing, value]);

  useEffect(() => {
    if (!editing) {
      return;
    }
    editorRef.current?.focus();
    if (selectOnFocus) {
      const selection = window.getSelection();
      const range = document.createRange();
      if (editorRef.current && selection) {
        range.selectNodeContents(editorRef.current);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      return;
    }
    const selection = window.getSelection();
    const range = document.createRange();
    if (editorRef.current?.firstChild && selection) {
      const length = editorRef.current.textContent?.length ?? 0;
      range.setStart(editorRef.current.firstChild, length);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }, [editing, selectOnFocus]);

  const finish = async () => {
    const trimmed = draft.trim();
    await onSave(trimmed);
    setUncontrolledEditing(false);
  };

  const cancel = () => {
    setDraft(value);
    setUncontrolledEditing(false);
    onCancel?.();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void finish();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  if (editing) {
    return (
      <span
        ref={editorRef}
        className={["inline-edit-input", inputClassName, className].filter(Boolean).join(" ")}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onBlur={() => {
          void finish();
        }}
        onInput={(event: FormEvent<HTMLSpanElement>) => {
          setDraft(event.currentTarget.textContent ?? "");
        }}
        onKeyDown={onKeyDown}
      >
        {draft}
      </span>
    );
  }

  return (
    <span
      className={["inline-edit-display", displayClassName, className, !value.trim() ? "is-placeholder" : ""].filter(Boolean).join(" ")}
      onDoubleClick={() => {
        if (!disabled && activation === "double-click") {
          if (onActivate) {
            onActivate();
          } else {
            setUncontrolledEditing(true);
          }
        }
      }}
      title={disabled ? undefined : "Double click to edit"}
    >
      {value.trim() || placeholder}
    </span>
  );
}

function formatScalar(value: unknown): string {
  if (value == null || value === "") {
    return "—";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}

function StructuredValue({ value }: { value: unknown }) {
  if (value == null || value === "") {
    return <>—</>;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <>{formatScalar(value)}</>;
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      return <>—</>;
    }

    const scalarOnly = value.every((item) => item == null || ["string", "number", "boolean"].includes(typeof item));
    if (scalarOnly) {
      return (
        <div className="pill-row">
          {value.map((item, index) => <span key={index} className="pill">{formatScalar(item)}</span>)}
        </div>
      );
    }

    return (
      <div className="structured-stack">
        {value.map((item, index) => (
          <div key={index} className="structured-card">
            <div className="small">Item {index + 1}</div>
            <StructuredValue value={item} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, entry]) => entry !== undefined);
    if (!entries.length) {
      return <>—</>;
    }

    return (
      <div className="structured-stack">
        {entries.map(([key, entry]) => (
          <div key={key} className="structured-row">
            <span className="small">{key}</span>
            <div><StructuredValue value={entry} /></div>
          </div>
        ))}
      </div>
    );
  }

  return <>{String(value)}</>;
}

export function StructuredDetails({ title, value, empty = "No data." }: { title: string; value: unknown; empty?: string }) {
  const isEmptyObject = typeof value === "object" && value && !Array.isArray(value) && !Object.keys(value as Record<string, unknown>).length;
  const isEmptyArray = Array.isArray(value) && value.length === 0;
  if (value == null || isEmptyObject || isEmptyArray) {
    return <p className="small">{empty}</p>;
  }

  return (
    <section className="drawer-section">
      <h3>{title}</h3>
      <StructuredValue value={value} />
    </section>
  );
}

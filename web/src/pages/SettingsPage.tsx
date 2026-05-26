import { FormEvent, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import type { MarkKindCatalogEntry } from "../api/client";
import { useWorkbench } from "../app/workbench";
import { SectionHeader } from "../components/common";

const KIND_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function normalizePayload(entries: MarkKindCatalogEntry[]): Array<Omit<MarkKindCatalogEntry, "id">> {
  return entries.map(({ kind_key, display_label, enabled, sort_order, color, is_builtin }) => ({
    kind_key,
    display_label,
    enabled,
    sort_order,
    color,
    is_builtin,
  }));
}

function withRenumberedOrder(entries: MarkKindCatalogEntry[]): MarkKindCatalogEntry[] {
  const sorted = [...entries].sort((a, b) => a.sort_order - b.sort_order || a.kind_key.localeCompare(b.kind_key));
  return sorted.map((row, idx) => ({ ...row, sort_order: idx * 10 }));
}

export function SettingsPage() {
  const location = useLocation();
  return (
    <main>
      <SectionHeader title="Settings" detail="Assessment-scoped configuration for the workbench and integrations." />
      <nav className="settings-subnav" aria-label="Settings sections">
        <NavLink to="/settings/mark-kinds" className={({ isActive }) => (isActive ? "active" : "")}>
          Mark kinds
        </NavLink>
      </nav>
      {location.pathname === "/settings" ? <p className="small">Choose a section above.</p> : <Outlet />}
    </main>
  );
}

export function MarkKindsSettingsTab() {
  const { selectedAssessmentId, api, refreshMarkKindCatalog } = useWorkbench();
  const [rows, setRows] = useState<MarkKindCatalogEntry[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");

  const load = async () => {
    if (!selectedAssessmentId) {
      setRows([]);
      return;
    }
    setError("");
    try {
      const data = await api.getMarkKindCatalog(selectedAssessmentId);
      setRows(withRenumberedOrder(data.entries));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void load();
  }, [selectedAssessmentId]);

  const duplicateKeys = useMemo(() => {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const r of rows) {
      const k = r.kind_key.toUpperCase();
      if (seen.has(k)) {
        dups.add(k);
      }
      seen.add(k);
    }
    return dups;
  }, [rows]);

  const persist = async (next: MarkKindCatalogEntry[]) => {
    if (!selectedAssessmentId) {
      return;
    }
    setError("");
    setStatus("");
    try {
      const data = await api.patchMarkKindCatalog(selectedAssessmentId, normalizePayload(withRenumberedOrder(next)));
      setRows(withRenumberedOrder(data.entries));
      await refreshMarkKindCatalog();
      setStatus("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const move = (idx: number, delta: number) => {
    const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order || a.kind_key.localeCompare(b.kind_key));
    const j = idx + delta;
    if (j < 0 || j >= sorted.length) {
      return;
    }
    const a = sorted[idx];
    const b = sorted[j];
    const next = rows.map((row) => {
      if (row.id === a.id) {
        return { ...row, sort_order: b.sort_order };
      }
      if (row.id === b.id) {
        return { ...row, sort_order: a.sort_order };
      }
      return row;
    });
    setRows(withRenumberedOrder(next));
  };

  const onAdd = (event: FormEvent) => {
    event.preventDefault();
    const key = newKey.trim().toUpperCase();
    if (!KIND_KEY_PATTERN.test(key)) {
      setError("Key must match [A-Z][A-Z0-9_]*");
      return;
    }
    if (rows.some((r) => r.kind_key.toUpperCase() === key)) {
      setError("This key already exists");
      return;
    }
    const label = newLabel.trim() || key;
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.sort_order), 0);
    const entry: MarkKindCatalogEntry = {
      id: crypto.randomUUID(),
      kind_key: key,
      display_label: label,
      enabled: true,
      sort_order: maxOrder + 10,
      color: newColor.match(/^#[0-9A-Fa-f]{6}$/) ? newColor.toLowerCase() : "#6366f1",
      is_builtin: false,
    };
    setRows(withRenumberedOrder([...rows, entry]));
    setNewKey("");
    setNewLabel("");
    setError("");
  };

  const removeRow = (entry: MarkKindCatalogEntry) => {
    if (entry.is_builtin) {
      return;
    }
    setRows(rows.filter((r) => r.id !== entry.id));
  };

  if (!selectedAssessmentId) {
    return <p className="small">Select an assessment in the header to edit mark kinds.</p>;
  }

  const sortedRows = [...rows].sort((a, b) => a.sort_order - b.sort_order || a.kind_key.localeCompare(b.kind_key));

  return (
    <section className="stack-blocks">
      <h2 className="settings-section-title">Mark kinds</h2>
      <p className="small">
        Types used for marks (CodeLens, linked entities, API). Builtin kinds cannot be removed; custom kinds can be added or deleted.
      </p>
      {error ? <div className="error-text">{error}</div> : null}
      {status ? <div className="small text-muted">{status}</div> : null}

      <div className="resource-card">
        <table className="dense-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Key</th>
              <th>Label</th>
              <th>Color</th>
              <th>Enabled</th>
              <th> </th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, idx) => (
              <tr key={row.id}>
                <td>
                  <div className="inline-actions">
                    <button type="button" className="btn btn-subtle btn-icon" title="Move up" disabled={idx === 0} onClick={() => move(idx, -1)}>
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn btn-subtle btn-icon"
                      title="Move down"
                      disabled={idx === sortedRows.length - 1}
                      onClick={() => move(idx, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </td>
                <td>
                  <code>{row.kind_key}</code>
                  {row.is_builtin ? <span className="small text-muted"> · builtin</span> : null}
                  {duplicateKeys.has(row.kind_key.toUpperCase()) ? <div className="error-text small">Duplicate key</div> : null}
                </td>
                <td>
                  <input
                    className="input-compact"
                    value={row.display_label}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows(rows.map((r) => (r.id === row.id ? { ...r, display_label: v } : r)));
                    }}
                  />
                </td>
                <td>
                  <input
                    type="color"
                    value={row.color.match(/^#[0-9A-Fa-f]{6}$/) ? row.color : "#64748b"}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRows(rows.map((r) => (r.id === row.id ? { ...r, color: v } : r)));
                    }}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => {
                      const v = e.target.checked;
                      setRows(rows.map((r) => (r.id === row.id ? { ...r, enabled: v } : r)));
                    }}
                  />
                </td>
                <td>
                  {!row.is_builtin ? (
                    <button type="button" className="btn btn-subtle" onClick={() => removeRow(row)}>
                      Remove
                    </button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="inline-row wrap" onSubmit={onAdd}>
        <input placeholder="KEY e.g. FUN" value={newKey} onChange={(e) => setNewKey(e.target.value)} />
        <input placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
        <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} />
        <button type="submit" className="btn btn-accent">
          Add kind
        </button>
      </form>

      <div>
        <button type="button" className="btn btn-accent" onClick={() => void persist(rows)} disabled={Boolean(duplicateKeys.size)}>
          Save catalog
        </button>
        <button type="button" className="btn btn-subtle" onClick={() => void load()}>
          Reload from server
        </button>
      </div>
    </section>
  );
}

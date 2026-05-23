import { useState } from "react";

import { useWorkbench } from "../app/workbench";

const HOME_DIR = "/home/usr";

function normalizeBasePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("~/")) {
    return `${HOME_DIR}/${trimmed.slice(2)}`;
  }
  if (trimmed === "~") {
    return HOME_DIR;
  }
  return trimmed;
}

function parseLocator(locator: string): { path: string; line?: number; column?: number } | null {
  const match = locator.match(/^(.*?)(?::(\d+))?(?::(\d+))?$/);
  if (!match) {
    return null;
  }
  return {
    path: match[1],
    line: match[2] ? Number(match[2]) : undefined,
    column: match[3] ? Number(match[3]) : undefined,
  };
}

function buildEditorUrl(basePath: string, locator: string): string | null {
  const parsed = parseLocator(locator);
  if (!parsed?.path || parsed.path === "local") {
    return null;
  }

  const normalizedBase = normalizeBasePath(basePath);
  const absolutePath = parsed.path.startsWith("/") ? parsed.path : `${normalizedBase.replace(/\/$/, "")}/${parsed.path.replace(/^\//, "")}`;
  const suffix = parsed.line ? `:${parsed.line}${parsed.column ? `:${parsed.column}` : ""}` : "";
  return `vscode://file${encodeURI(absolutePath)}${suffix}`;
}

function FileLocatorIcon() {
  return (
    <svg className="locator-file-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 2.75h4.5l2.5 2.5v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8.5a1 1 0 0 1 1-1z" />
      <path d="M9.5 2.75v2.5H12" />
    </svg>
  );
}

export function LocatorLink({ locator, assetId }: { locator?: string | null; assetId?: string | null }) {
  const { getProjectBasePathForAsset, setProjectBasePathForAsset } = useWorkbench();
  const [editingPath, setEditingPath] = useState(false);
  const [draftPath, setDraftPath] = useState(() => getProjectBasePathForAsset(assetId));

  if (!locator) {
    return <>—</>;
  }

  const url = buildEditorUrl(getProjectBasePathForAsset(assetId), locator);
  if (!url) {
    return (
      <span className="locator-inline">
        <span className="locator-value" title={locator}><FileLocatorIcon /></span>
        {assetId ? (
          editingPath ? (
            <form
              className="locator-path-form"
              onSubmit={(event) => {
                event.preventDefault();
                setProjectBasePathForAsset(assetId, draftPath);
                setEditingPath(false);
              }}
            >
              <input value={draftPath} onChange={(event) => setDraftPath(event.target.value)} placeholder="Project base path" autoFocus />
              <button className="mini-confirm-btn" type="submit">Save</button>
              <button className="mini-cancel-btn" type="button" onClick={() => { setDraftPath(getProjectBasePathForAsset(assetId)); setEditingPath(false); }}>Cancel</button>
            </form>
          ) : (
            <button className="locator-path-button" type="button" onClick={() => setEditingPath(true)}>Path</button>
          )
        ) : null}
      </span>
    );
  }

  return (
    <span className="locator-inline">
      <a className="locator-link" href={url} title={`Open ${locator} in editor`} aria-label={`Open ${locator} in editor`}>
        <FileLocatorIcon />
      </a>
      {assetId ? (
        editingPath ? (
          <form
            className="locator-path-form"
            onSubmit={(event) => {
              event.preventDefault();
              setProjectBasePathForAsset(assetId, draftPath);
              setEditingPath(false);
            }}
          >
            <input value={draftPath} onChange={(event) => setDraftPath(event.target.value)} placeholder="Project base path" autoFocus />
            <button className="mini-confirm-btn" type="submit">Save</button>
            <button className="mini-cancel-btn" type="button" onClick={() => { setDraftPath(getProjectBasePathForAsset(assetId)); setEditingPath(false); }}>Cancel</button>
          </form>
        ) : (
          <button className="locator-path-button" type="button" onClick={() => setEditingPath(true)}>Path</button>
        )
      ) : null}
    </span>
  );
}

import { useEffect, useState } from "react";

import { CaseLinkedEntitiesPanel } from "@web/features/case-linked-entities/CaseLinkedEntitiesPanel";

import { CasePicker } from "./CasePicker";
import { EmbedWorkbenchProvider, type EmbedWorkbenchConfig } from "./EmbedWorkbenchProvider";
import { embedHostMutations } from "./embedHostMutations";
import { useSidebarPanelFocus } from "./useSidebarPanelFocus";
import { vscode } from "./vscode";

const emptyConfig: EmbedWorkbenchConfig = {
  apiBaseUrl: "http://localhost:8000/api",
  assessmentId: "",
  assetId: "",
  caseId: null,
  caseTitle: null,
  caseStatus: null,
  caseContextBeforeLines: null,
  caseContextAfterLines: null,
  caseScopedDecorations: false,
  activeLocator: null,
  projectBasePaths: {},
  workspaceRoot: "",
};

const WEBVIEW_BODY_CLASS = "appsec-linked-entities-webview";

export function App() {
  const [config, setConfig] = useState<EmbedWorkbenchConfig>(emptyConfig);
  const [actionError, setActionError] = useState<string | null>(null);
  const panelFocus = useSidebarPanelFocus(".case-linked-entities-embed-root");

  useEffect(() => {
    document.body.classList.add(WEBVIEW_BODY_CLASS);
    return () => {
      document.body.classList.remove(WEBVIEW_BODY_CLASS);
    };
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const message = event.data as { type?: string; config?: EmbedWorkbenchConfig; activeLocator?: EmbedWorkbenchConfig["activeLocator"]; caseScopedDecorations?: boolean };
      if (message.type === "config" && message.config) {
        setConfig(message.config);
        setActionError(null);
      }
      if (message.type === "activeLocator") {
        setConfig((current) => ({ ...current, activeLocator: message.activeLocator ?? null }));
      }
      if (message.type === "caseScopedDecorations") {
        setConfig((current) => ({ ...current, caseScopedDecorations: Boolean(message.caseScopedDecorations) }));
      }
    };
    window.addEventListener("message", onMessage);
    vscode.postMessage({ type: "ready" });
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (config.loadError) {
    return (
      <div className="case-linked-entities-embed">
        <p className="error-text">{config.loadError}</p>
      </div>
    );
  }

  if (!config.assessmentId) {
    return (
      <div className="case-linked-entities-embed">
        <p className="small">Loading workbench configuration…</p>
      </div>
    );
  }

  return (
    <EmbedWorkbenchProvider config={config}>
      <div
        className="case-linked-entities-embed-root"
        onMouseEnter={panelFocus.onMouseEnter}
        onMouseLeave={panelFocus.onMouseLeave}
        onPointerDownCapture={panelFocus.onPointerDownCapture}
      >
        <CasePicker
          selectedId={config.caseId}
          selectedStatus={config.caseStatus ?? null}
          caseScopedDecorations={Boolean(config.caseScopedDecorations)}
          contextBeforeLines={config.caseContextBeforeLines}
          contextAfterLines={config.caseContextAfterLines}
        />
        {config.graphError ? (
          <p className="case-picker-graph-error error-text">{config.graphError}</p>
        ) : null}
        {actionError ? (
          <p className="case-picker-graph-error error-text">{actionError}</p>
        ) : null}
        <CaseLinkedEntitiesPanel
          caseId={config.caseId}
          refreshToken={config.configVersion}
          preloadedData={config.graphData ?? null}
          preloadedError={config.graphError ?? null}
          variant="embed"
          onRequestReload={() => {
            vscode.postMessage({ type: "reloadGraph" });
          }}
          onOpenLocator={(target, assetId) => {
            if (typeof target === "string") {
              vscode.postMessage({ type: "openLocator", locator: target, assetId: assetId ?? null });
              return;
            }
            vscode.postMessage({
              type: "openLocator",
              filePath: target.filePath,
              line: target.line,
              column: target.column,
              assetId: assetId ?? null,
            });
          }}
          activeLocator={config.activeLocator ?? null}
          onGraphMutated={() => {
            vscode.postMessage({ type: "relationsChanged" });
          }}
          hostMutations={embedHostMutations}
          onSelectCheck={(checkId) => {
            vscode.postMessage({ type: "selectCheck", id: checkId });
          }}
          onError={(message) => setActionError(message)}
        />
      </div>
    </EmbedWorkbenchProvider>
  );
}

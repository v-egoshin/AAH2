import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { ApiClient, Asset, MarkKindCatalogEntry } from "@web/api/client";
import { MarkKindAccentContext } from "@web/context/MarkKindAccentContext";
import type { CaseGraphDataBundle } from "@web/features/case-linked-entities/types";

export type EmbedCaseOption = {
  id: string;
  title: string;
  status?: string;
  asset_id?: string | null;
  context_before_lines?: number | null;
  context_after_lines?: number | null;
};

export type EmbedWorkbenchConfig = {
  apiBaseUrl: string;
  authToken?: string;
  assessmentId: string;
  assetId: string;
  caseId: string | null;
  caseTitle?: string | null;
  caseStatus?: string | null;
  caseContextBeforeLines?: number | null;
  caseContextAfterLines?: number | null;
  cases?: EmbedCaseOption[];
  caseScopedDecorations?: boolean;
  activeLocator?: { file: string; startLine: number; endLine: number } | null;
  projectBasePaths?: Record<string, string>;
  workspaceRoot?: string;
  loadError?: string;
  graphData?: CaseGraphDataBundle;
  graphError?: string;
  /** From extension host (same snapshot as editor decorations); avoids failed fetches in webview */
  markKindAccentByKind?: Record<string, string>;
  /** Full catalog entries from extension host for context-menu type changes */
  markKindCatalogEntries?: MarkKindCatalogEntry[];
  configVersion?: number;
};

type EmbedWorkbenchContextValue = {
  api: ApiClient;
  selectedAssessmentId: string;
  selectedAssetId: string;
  markKindCatalog: MarkKindCatalogEntry[];
  getProjectBasePathForAsset: (assetId?: string | null) => string;
  getWorkspaceRoot: () => string;
  setProjectBasePathForAsset: (assetId: string, value: string) => void;
};

const EmbedWorkbenchContext = createContext<EmbedWorkbenchContextValue | null>(null);

export function EmbedWorkbenchProvider({
  config,
  children,
}: {
  config: EmbedWorkbenchConfig;
  children: React.ReactNode;
}) {
  const [projectBasePathByAsset, setProjectBasePathByAsset] = useState<Record<string, string>>(
    () => config.projectBasePaths ?? {},
  );
  const [markKindCatalog, setMarkKindCatalog] = useState<MarkKindCatalogEntry[]>([]);

  useEffect(() => {
    setProjectBasePathByAsset(config.projectBasePaths ?? {});
  }, [config.projectBasePaths, config.configVersion]);

  const api = useMemo(
    () => new ApiClient(config.apiBaseUrl, { authToken: config.authToken }),
    [config.apiBaseUrl, config.authToken],
  );

  useEffect(() => {
    if (!config.assessmentId) {
      setMarkKindCatalog([]);
      return;
    }
    if (Array.isArray(config.markKindCatalogEntries) && config.markKindCatalogEntries.length > 0) {
      setMarkKindCatalog(config.markKindCatalogEntries);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await api.getMarkKindCatalog(config.assessmentId);
        if (!cancelled) {
          setMarkKindCatalog(Array.isArray(data.entries) ? data.entries : []);
        }
      } catch {
        if (!cancelled) {
          setMarkKindCatalog([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, config.assessmentId, config.configVersion, config.markKindCatalogEntries]);

  const markKindAccentByKind = useMemo(() => {
    const fromHost = config.markKindAccentByKind;
    if (fromHost && Object.keys(fromHost).length > 0) {
      return fromHost;
    }
    const acc: Record<string, string> = {};
    for (const entry of markKindCatalog) {
      acc[entry.kind_key.toUpperCase()] = entry.color;
    }
    return acc;
  }, [config.markKindAccentByKind, markKindCatalog]);

  const value = useMemo<EmbedWorkbenchContextValue>(() => ({
    api,
    selectedAssessmentId: config.assessmentId,
    selectedAssetId: config.assetId,
    markKindCatalog,
    getProjectBasePathForAsset: (assetId?: string | null) => {
      if (!assetId) {
        return projectBasePathByAsset[config.assetId] ?? "";
      }
      return projectBasePathByAsset[assetId] ?? "";
    },
    getWorkspaceRoot: () => config.workspaceRoot ?? "",
    setProjectBasePathForAsset: (assetId: string, path: string) => {
      setProjectBasePathByAsset((current) => ({ ...current, [assetId]: path }));
    },
  }), [api, config.assessmentId, config.assetId, config.workspaceRoot, markKindCatalog, projectBasePathByAsset]);

  return (
    <MarkKindAccentContext.Provider value={markKindAccentByKind}>
      <EmbedWorkbenchContext.Provider value={value}>{children}</EmbedWorkbenchContext.Provider>
    </MarkKindAccentContext.Provider>
  );
}

// Case-linked panel imports useWorkbench from the web app; map embed context to the same hook shape.
export function useEmbedWorkbenchBridge() {
  const embed = useContext(EmbedWorkbenchContext);
  if (!embed) {
    throw new Error("EmbedWorkbenchProvider is missing");
  }
  return {
    api: embed.api,
    selectedAssessmentId: embed.selectedAssessmentId,
    selectedAssetId: embed.selectedAssetId,
    assets: [] as Asset[],
    selectedAsset: null,
    projectBasePath: embed.getProjectBasePathForAsset(embed.selectedAssetId),
    getWorkspaceRoot: embed.getWorkspaceRoot,
    setProjectBasePath: () => undefined,
    getProjectBasePathForAsset: embed.getProjectBasePathForAsset,
    setProjectBasePathForAsset: embed.setProjectBasePathForAsset,
    assessments: [],
    selectedAssessment: null,
    setSelectedAssessmentId: () => undefined,
    setSelectedAssetId: () => undefined,
    baseUrl: "",
    setBaseUrl: () => undefined,
    refreshAssessments: async () => undefined,
    markKindCatalog: embed.markKindCatalog,
    refreshMarkKindCatalog: async () => undefined,
  };
}

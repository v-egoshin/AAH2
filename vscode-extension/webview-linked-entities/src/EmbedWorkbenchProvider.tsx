import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { ApiClient, Asset } from "@web/api/client";
import type { CaseGraphDataBundle } from "@web/features/case-linked-entities/types";

export type EmbedCaseOption = {
  id: string;
  title: string;
  status?: string;
  asset_id?: string | null;
};

export type EmbedWorkbenchConfig = {
  apiBaseUrl: string;
  authToken?: string;
  assessmentId: string;
  assetId: string;
  caseId: string | null;
  caseTitle?: string | null;
  caseStatus?: string | null;
  cases?: EmbedCaseOption[];
  caseScopedDecorations?: boolean;
  activeLocator?: { file: string; startLine: number; endLine: number } | null;
  projectBasePaths?: Record<string, string>;
  workspaceRoot?: string;
  loadError?: string;
  graphData?: CaseGraphDataBundle;
  graphError?: string;
  configVersion?: number;
};

type EmbedWorkbenchContextValue = {
  api: ApiClient;
  selectedAssessmentId: string;
  selectedAssetId: string;
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

  useEffect(() => {
    setProjectBasePathByAsset(config.projectBasePaths ?? {});
  }, [config.projectBasePaths, config.configVersion]);

  const api = useMemo(
    () => new ApiClient(config.apiBaseUrl, { authToken: config.authToken }),
    [config.apiBaseUrl, config.authToken],
  );

  const value = useMemo<EmbedWorkbenchContextValue>(() => ({
    api,
    selectedAssessmentId: config.assessmentId,
    selectedAssetId: config.assetId,
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
  }), [api, config.assessmentId, config.assetId, config.workspaceRoot, projectBasePathByAsset]);

  return (
    <EmbedWorkbenchContext.Provider value={value}>
      {children}
    </EmbedWorkbenchContext.Provider>
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
  };
}

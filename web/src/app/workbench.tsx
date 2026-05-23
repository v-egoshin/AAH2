import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ApiClient, Assessment, Asset } from "../api/client";

const DEFAULT_BASE_URL = "http://localhost:8000/api";
const PROJECT_PATHS_STORAGE_KEY = "appsec.projectBasePathByAsset";

function inferAssetBasePath(asset?: Asset | null) {
  if (!asset) {
    return "";
  }
  if (asset.type !== "REPOSITORY") {
    return "";
  }
  const locator = String(asset.locator ?? "").trim();
  if (!locator) {
    return "";
  }
  return locator.match(/^(.*?)(?::\d+)?(?::\d+)?$/)?.[1] ?? locator;
}

type WorkbenchContextValue = {
  api: ApiClient;
  baseUrl: string;
  setBaseUrl: (value: string) => void;
  assets: Asset[];
  selectedAssetId: string;
  setSelectedAssetId: (value: string) => void;
  selectedAsset: Asset | null;
  projectBasePath: string;
  setProjectBasePath: (value: string) => void;
  getProjectBasePathForAsset: (assetId?: string | null) => string;
  setProjectBasePathForAsset: (assetId: string, value: string) => void;
  assessments: Assessment[];
  selectedAssessmentId: string;
  setSelectedAssessmentId: (value: string) => void;
  selectedAssessment: Assessment | null;
  refreshAssessments: () => Promise<void>;
};

const WorkbenchContext = createContext<WorkbenchContextValue | null>(null);

export function WorkbenchProvider({ children }: { children: React.ReactNode }) {
  const [baseUrl, setBaseUrlState] = useState(() => localStorage.getItem("appsec.baseUrl") || DEFAULT_BASE_URL);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentIdState] = useState(() => localStorage.getItem("appsec.assessmentId") || "");
  const [selectedAssetId, setSelectedAssetIdState] = useState(() => localStorage.getItem("appsec.assetId") || "");
  const [projectBasePathByAsset, setProjectBasePathByAsset] = useState<Record<string, string>>(() => {
    const raw = localStorage.getItem(PROJECT_PATHS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
    } catch {
      return {};
    }
  });

  const api = useMemo(() => new ApiClient(baseUrl), [baseUrl]);

  const refreshAssessments = async () => {
    const rows = await api.getAssessments();
    setAssessments(Array.isArray(rows) ? rows : []);
  };

  const refreshAssets = async (assessmentId: string) => {
    if (!assessmentId) {
      setAssets([]);
      return;
    }
    const rows = await api.getAssets(assessmentId);
    setAssets(Array.isArray(rows) ? rows : []);
  };

  useEffect(() => {
    localStorage.setItem("appsec.baseUrl", baseUrl);
  }, [baseUrl]);

  useEffect(() => {
    localStorage.setItem("appsec.assessmentId", selectedAssessmentId);
  }, [selectedAssessmentId]);

  useEffect(() => {
    localStorage.setItem("appsec.assetId", selectedAssetId);
  }, [selectedAssetId]);

  useEffect(() => {
    localStorage.setItem(PROJECT_PATHS_STORAGE_KEY, JSON.stringify(projectBasePathByAsset));
  }, [projectBasePathByAsset]);

  useEffect(() => {
    void refreshAssessments().catch(() => setAssessments([]));
  }, [api]);

  useEffect(() => {
    void refreshAssets(selectedAssessmentId).catch(() => setAssets([]));
  }, [api, selectedAssessmentId]);

  useEffect(() => {
    if (!selectedAssessmentId && assessments[0]) {
      setSelectedAssessmentIdState(assessments[0].id);
    }
  }, [assessments, selectedAssessmentId]);

  useEffect(() => {
    if (!assets.length) {
      if (selectedAssetId) {
        setSelectedAssetIdState("");
      }
      return;
    }
    if (!selectedAssetId || !assets.some((item) => item.id === selectedAssetId)) {
      setSelectedAssetIdState(assets[0].id);
    }
  }, [assets, selectedAssetId]);

  const selectedAsset = assets.find((item) => item.id === selectedAssetId) ?? null;
  const inferredSelectedAssetBasePath = inferAssetBasePath(selectedAsset);
  const projectBasePath = selectedAssetId
    ? (projectBasePathByAsset[selectedAssetId] ?? inferredSelectedAssetBasePath)
    : "";

  const setProjectBasePath = (value: string) => {
    if (!selectedAssetId) {
      return;
    }
    setProjectBasePathByAsset((current) => ({ ...current, [selectedAssetId]: value }));
  };

  const setProjectBasePathForAsset = (assetId: string, value: string) => {
    setProjectBasePathByAsset((current) => ({ ...current, [assetId]: value }));
  };

  const getProjectBasePathForAsset = (assetId?: string | null) => {
    if (!assetId) {
      return projectBasePath;
    }
    const stored = projectBasePathByAsset[assetId];
    if (stored) {
      return stored;
    }
    return inferAssetBasePath(assets.find((item) => item.id === assetId) ?? null);
  };

  const value: WorkbenchContextValue = {
    api,
    baseUrl,
    setBaseUrl: setBaseUrlState,
    assets,
    selectedAssetId,
    setSelectedAssetId: setSelectedAssetIdState,
    selectedAsset,
    projectBasePath,
    setProjectBasePath,
    getProjectBasePathForAsset,
    setProjectBasePathForAsset,
    assessments,
    selectedAssessmentId,
    setSelectedAssessmentId: setSelectedAssessmentIdState,
    selectedAssessment: assessments.find((item) => item.id === selectedAssessmentId) ?? null,
    refreshAssessments,
  };

  return <WorkbenchContext.Provider value={value}>{children}</WorkbenchContext.Provider>;
}

export function useWorkbench() {
  const value = useContext(WorkbenchContext);
  if (!value) {
    throw new Error("WorkbenchProvider is missing");
  }
  return value;
}

import * as vscode from "vscode";

import { readState } from "../state/assessmentState";

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function basename(value: string): string {
  const normalized = toPosixPath(value).replace(/\/$/, "");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function dirname(value: string): string {
  const normalized = toPosixPath(value).replace(/\/$/, "");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index) : "";
}

function parseLocatorDirectory(locator: string): string {
  const match = locator.match(/^(.+?)(?::\d+)?(?::\d+)?$/);
  return match?.[1] ?? locator;
}

function inferHomeDirectory(): string {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  if (!workspaceRoot) {
    return "";
  }
  const posix = toPosixPath(workspaceRoot);
  const documentsIndex = posix.indexOf("/Documents/");
  if (documentsIndex > 0) {
    return posix.slice(0, documentsIndex);
  }
  if (basename(workspaceRoot) === "app") {
    const parent = dirname(workspaceRoot);
    const parentDocumentsIndex = parent.indexOf("/Documents/");
    if (parentDocumentsIndex > 0) {
      return parent.slice(0, parentDocumentsIndex);
    }
  }
  return "";
}

export function expandHomePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("~/") && !trimmed.startsWith("~\\")) {
    return trimmed;
  }
  const home = inferHomeDirectory();
  if (!home) {
    return trimmed;
  }
  const suffix = trimmed.slice(2).replace(/^[\\/]+/, "");
  return `${home}/${suffix}`;
}

export function normalizeRepositoryRoot(root: string): string {
  const expanded = expandHomePath(root.trim());
  if (!expanded) {
    return "";
  }
  if (basename(expanded) === "app") {
    return dirname(expanded);
  }
  return expanded;
}

export function readProjectBasePathsFromWorkspace(): Record<string, string> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  for (const folder of folders) {
    const value = vscode.workspace
      .getConfiguration("appsecWorkbench", folder.uri)
      .get<Record<string, string>>("projectBasePathByAsset");
    if (value && typeof value === "object") {
      return value;
    }
  }
  return {};
}

export function getRepositoryRoot(assetId?: string, apiLocator?: string): string {
  const state = readState();
  const resolvedAssetId = assetId ?? state.assetId;
  const configured = resolvedAssetId
    ? readProjectBasePathsFromWorkspace()[resolvedAssetId]?.trim()
    : "";
  if (configured) {
    return normalizeRepositoryRoot(configured);
  }

  const apiPath = apiLocator?.trim();
  if (apiPath) {
    return normalizeRepositoryRoot(parseLocatorDirectory(apiPath));
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  if (!workspaceRoot) {
    return "";
  }
  const workspaceCandidate = basename(workspaceRoot) === "app"
    ? dirname(workspaceRoot)
    : workspaceRoot;
  return normalizeRepositoryRoot(workspaceCandidate);
}

function isPathInsideRoot(root: string, filePath: string): boolean {
  const rootPosix = toPosixPath(root).replace(/\/$/, "");
  const filePosix = toPosixPath(filePath);
  if (filePosix === rootPosix) {
    return true;
  }
  return filePosix.startsWith(`${rootPosix}/`);
}

function relativePathFromRoot(root: string, filePath: string): string {
  const rootPosix = toPosixPath(root).replace(/\/$/, "");
  const filePosix = toPosixPath(filePath);
  if (filePosix === rootPosix) {
    return "";
  }
  return filePosix.slice(rootPosix.length + 1);
}

export function relativeFilePathFromUri(uri: vscode.Uri, assetId?: string, apiLocator?: string): string {
  const repositoryRoot = getRepositoryRoot(assetId, apiLocator);
  const filePath = uri.fsPath;
  if (repositoryRoot && isPathInsideRoot(repositoryRoot, filePath)) {
    return relativePathFromRoot(repositoryRoot, filePath);
  }
  return vscode.workspace.asRelativePath(uri);
}

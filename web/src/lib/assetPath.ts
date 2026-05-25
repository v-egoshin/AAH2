export type OpenLocatorTarget = {
  filePath: string;
  line?: number;
  column?: number;
};

export type ResolvedOpenTarget = {
  absolutePath: string;
  line: number;
  column: number;
};

const HOME_PATH_KEY = "appsec.homePath";

export function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value);
}

export function expandHomePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed.startsWith("~/") && !trimmed.startsWith("~\\")) {
    return trimmed;
  }
  const home = typeof localStorage !== "undefined"
    ? localStorage.getItem(HOME_PATH_KEY)?.trim()
    : "";
  if (!home) {
    return trimmed;
  }
  return `${home.replace(/[\\/]+$/, "")}${trimmed.slice(1)}`;
}

export function joinAssetPath(base: string, relative: string): string {
  const separator = base.includes("\\") ? "\\" : "/";
  return `${base.replace(/[\\/]$/, "")}${separator}${relative.replace(/^[\\/]+/, "")}`;
}

export function resolveOpenTargetPath(
  filePath: string,
  line: number | undefined,
  column: number | undefined,
  assetRoot: string,
  workspaceRoot = "",
): ResolvedOpenTarget | null {
  const root = expandHomePath(assetRoot.trim() || workspaceRoot.trim());
  const relativeFile = filePath.trim().replace(/^[\\/]+/, "");
  if (!relativeFile) {
    return null;
  }

  const absolutePath = isAbsolutePath(relativeFile)
    ? expandHomePath(relativeFile)
    : root
      ? expandHomePath(joinAssetPath(root, relativeFile))
      : relativeFile;

  if (!isAbsolutePath(absolutePath)) {
    return null;
  }

  return {
    absolutePath,
    line: line ?? 1,
    column: column ?? 1,
  };
}

export function resolveOpenTargetFromParts(
  target: OpenLocatorTarget,
  assetBasePath: string,
  workspaceRoot = "",
): string | null {
  const resolved = resolveOpenTargetPath(
    target.filePath,
    target.line,
    target.column,
    assetBasePath,
    workspaceRoot,
  );
  if (!resolved) {
    return null;
  }
  const suffix = resolved.line
    ? `:${resolved.line}${resolved.column ? `:${resolved.column}` : ""}`
    : "";
  return `${resolved.absolutePath}${suffix}`;
}

export function buildEditorUrlFromAbsolute(absolutePath: string, line?: number, column?: number): string {
  const suffix = line ? `:${line}${column ? `:${column}` : ""}` : "";
  return `vscode://file${encodeURI(absolutePath)}${suffix}`;
}

export function buildEditorUrlForTarget(
  target: OpenLocatorTarget,
  assetBasePath: string,
  workspaceRoot = "",
): string | null {
  const resolved = resolveOpenTargetPath(
    target.filePath,
    target.line,
    target.column,
    assetBasePath,
    workspaceRoot,
  );
  if (!resolved) {
    return null;
  }
  return buildEditorUrlFromAbsolute(resolved.absolutePath, resolved.line, resolved.column);
}

export function buildEditorUrl(basePath: string, locator: string): string | null {
  const match = locator.match(/^(.+?)(?::(\d+))?(?::(\d+))?$/);
  if (!match?.[1] || match[1] === "local") {
    return null;
  }
  return buildEditorUrlForTarget(
    {
      filePath: match[1],
      line: match[2] ? Number(match[2]) : undefined,
      column: match[3] ? Number(match[3]) : undefined,
    },
    basePath,
  );
}

export function resolveOpenTargetLabel(basePath: string, locator: string): string | null {
  const match = locator.match(/^(.+?)(?::(\d+))?(?::(\d+))?$/);
  if (!match?.[1] || match[1] === "local") {
    return null;
  }
  return resolveOpenTargetFromParts(
    {
      filePath: match[1],
      line: match[2] ? Number(match[2]) : undefined,
      column: match[3] ? Number(match[3]) : undefined,
    },
    basePath,
  );
}

export function parseLocatorParts(locator: string) {
  const match = locator.match(/^(.+?)(?::(\d+))?(?::(\d+))?$/);
  if (!match?.[1]) {
    return null;
  }
  return {
    filePath: match[1],
    line: match[2] ? Number(match[2]) : undefined,
    column: match[3] ? Number(match[3]) : undefined,
  };
}

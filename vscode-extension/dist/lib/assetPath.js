"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandHomePath = expandHomePath;
exports.normalizeRepositoryRoot = normalizeRepositoryRoot;
exports.readProjectBasePathsFromWorkspace = readProjectBasePathsFromWorkspace;
exports.getRepositoryRoot = getRepositoryRoot;
exports.relativeFilePathFromUri = relativeFilePathFromUri;
const vscode = __importStar(require("vscode"));
const assessmentState_1 = require("../state/assessmentState");
function toPosixPath(value) {
    return value.replace(/\\/g, "/");
}
function basename(value) {
    const normalized = toPosixPath(value).replace(/\/$/, "");
    const index = normalized.lastIndexOf("/");
    return index >= 0 ? normalized.slice(index + 1) : normalized;
}
function dirname(value) {
    const normalized = toPosixPath(value).replace(/\/$/, "");
    const index = normalized.lastIndexOf("/");
    return index >= 0 ? normalized.slice(0, index) : "";
}
function parseLocatorDirectory(locator) {
    const match = locator.match(/^(.+?)(?::\d+)?(?::\d+)?$/);
    return match?.[1] ?? locator;
}
function inferHomeDirectory() {
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
function expandHomePath(value) {
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
function normalizeRepositoryRoot(root) {
    const expanded = expandHomePath(root.trim());
    if (!expanded) {
        return "";
    }
    if (basename(expanded) === "app") {
        return dirname(expanded);
    }
    return expanded;
}
function readProjectBasePathsFromWorkspace() {
    const folders = vscode.workspace.workspaceFolders ?? [];
    for (const folder of folders) {
        const value = vscode.workspace
            .getConfiguration("appsecWorkbench", folder.uri)
            .get("projectBasePathByAsset");
        if (value && typeof value === "object") {
            return value;
        }
    }
    return {};
}
function getRepositoryRoot(assetId, apiLocator) {
    const state = (0, assessmentState_1.readState)();
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
function isPathInsideRoot(root, filePath) {
    const rootPosix = toPosixPath(root).replace(/\/$/, "");
    const filePosix = toPosixPath(filePath);
    if (filePosix === rootPosix) {
        return true;
    }
    return filePosix.startsWith(`${rootPosix}/`);
}
function relativePathFromRoot(root, filePath) {
    const rootPosix = toPosixPath(root).replace(/\/$/, "");
    const filePosix = toPosixPath(filePath);
    if (filePosix === rootPosix) {
        return "";
    }
    return filePosix.slice(rootPosix.length + 1);
}
function relativeFilePathFromUri(uri, assetId, apiLocator) {
    const repositoryRoot = getRepositoryRoot(assetId, apiLocator);
    const filePath = uri.fsPath;
    if (repositoryRoot && isPathInsideRoot(repositoryRoot, filePath)) {
        return relativePathFromRoot(repositoryRoot, filePath);
    }
    return vscode.workspace.asRelativePath(uri);
}

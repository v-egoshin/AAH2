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
exports.ReviewedFilesProvider = void 0;
exports.resolveCommandUri = resolveCommandUri;
const vscode = __importStar(require("vscode"));
const REVIEWED_FILES_KEY = "appsecWorkbench.reviewedFiles";
function normalizeUri(uri) {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
    const fsPath = uri.fsPath;
    return workspaceRoot && fsPath.startsWith(`${workspaceRoot}/`)
        ? fsPath.slice(workspaceRoot.length + 1)
        : fsPath;
}
class ReviewedFilesProvider {
    constructor(workspaceState) {
        this.workspaceState = workspaceState;
        this.emitter = new vscode.EventEmitter();
        this.onDidChangeFileDecorations = this.emitter.event;
    }
    isReviewed(uri) {
        return this.read().has(normalizeUri(uri));
    }
    async markReviewed(uri) {
        const uris = await this.collectFileUris(uri);
        const next = this.read();
        for (const item of uris) {
            next.add(normalizeUri(item));
        }
        await this.write(next);
        this.emitter.fire(uris);
    }
    async clearReviewed(uri) {
        const uris = await this.collectFileUris(uri);
        const next = this.read();
        for (const item of uris) {
            next.delete(normalizeUri(item));
        }
        await this.write(next);
        this.emitter.fire(uris);
    }
    provideFileDecoration(uri) {
        if (!this.isReviewed(uri)) {
            return undefined;
        }
        return {
            badge: "R",
            tooltip: "AppSec: reviewed",
            color: new vscode.ThemeColor("charts.green"),
        };
    }
    read() {
        return new Set(this.workspaceState.get(REVIEWED_FILES_KEY, []));
    }
    async write(value) {
        await this.workspaceState.update(REVIEWED_FILES_KEY, [...value].sort());
    }
    async collectFileUris(uri) {
        try {
            const stat = await vscode.workspace.fs.stat(uri);
            if (stat.type !== vscode.FileType.Directory) {
                return [uri];
            }
            const result = [];
            const walk = async (folder) => {
                const entries = await vscode.workspace.fs.readDirectory(folder);
                for (const [name, type] of entries) {
                    const child = vscode.Uri.joinPath(folder, name);
                    if (type === vscode.FileType.Directory) {
                        await walk(child);
                    }
                    else if (type === vscode.FileType.File) {
                        result.push(child);
                    }
                }
            };
            await walk(uri);
            return result;
        }
        catch {
            return [uri];
        }
    }
}
exports.ReviewedFilesProvider = ReviewedFilesProvider;
function resolveCommandUri(candidate) {
    if (candidate instanceof vscode.Uri) {
        return candidate;
    }
    return vscode.window.activeTextEditor?.document.uri ?? null;
}

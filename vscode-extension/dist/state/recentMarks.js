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
exports.RecentMarksPanel = void 0;
exports.pushRecentMark = pushRecentMark;
exports.getRecentMarks = getRecentMarks;
exports.getRecentMarkById = getRecentMarkById;
const vscode = __importStar(require("vscode"));
const LIMIT = 12;
let entries = [];
function entityLabel(entity) {
    return entity.title || entity.name || entity.kind || "Untitled";
}
function pushRecentMark(entity) {
    if (!entity.id || !entity.locator) {
        return;
    }
    const entry = {
        ...entity,
        label: entityLabel(entity),
        locator: entity.locator,
    };
    entries = [entry, ...entries.filter((item) => item.id !== entity.id)].slice(0, LIMIT);
}
function getRecentMarks(kind) {
    return kind ? entries.filter((entry) => entry.kind === kind) : entries;
}
function getRecentMarkById(id) {
    return entries.find((entry) => entry.id === id) ?? null;
}
class RecentMarkItem extends vscode.TreeItem {
    constructor(entry) {
        super(`[${entry.kind ?? "MARK"}] ${entry.label}`, vscode.TreeItemCollapsibleState.None);
        this.entry = entry;
        this.description = entry.locator;
        this.tooltip = `${entry.label}\n${entry.locator}`;
        this.command = {
            command: "appsecWorkbench.openEntitySource",
            title: "Open Source",
            arguments: [entry],
        };
    }
}
class RecentMarksPanel {
    constructor() {
        this.emitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this.emitter.event;
    }
    register(context) {
        const view = vscode.window.createTreeView("appsecRecentMarks", { treeDataProvider: this });
        context.subscriptions.push(view);
    }
    refresh() {
        this.emitter.fire(undefined);
    }
    getTreeItem(element) {
        return element;
    }
    getChildren() {
        if (!entries.length) {
            return [new vscode.TreeItem("No recent marks yet", vscode.TreeItemCollapsibleState.None)];
        }
        return entries.map((entry) => new RecentMarkItem(entry));
    }
}
exports.RecentMarksPanel = RecentMarksPanel;

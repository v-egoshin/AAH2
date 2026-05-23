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
exports.registerAssessmentCommands = registerAssessmentCommands;
const vscode = __importStar(require("vscode"));
const client_1 = require("../api/client");
const assessmentState_1 = require("../state/assessmentState");
function registerAssessmentCommands(context) {
    context.subscriptions.push(vscode.commands.registerCommand("appsecWorkbench.createAssessment", async () => {
        const title = await vscode.window.showInputBox({ prompt: "Assessment title" });
        if (!title)
            return;
        const trimmedTitle = title.trim();
        if (!trimmedTitle)
            return;
        const api = new client_1.WorkbenchApiClient((0, assessmentState_1.readState)());
        const existing = await api.findAssessmentByName(trimmedTitle);
        const cfg = vscode.workspace.getConfiguration("appsecWorkbench");
        if (existing) {
            await cfg.update("assessmentId", trimmedTitle, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(`AppSec: using existing assessment ${existing.title} (${existing.id})`);
            return;
        }
        const description = (await vscode.window.showInputBox({ prompt: "Assessment description", value: "" })) ?? "";
        const created = await api.createAssessment({ title: trimmedTitle, description });
        await cfg.update("assessmentId", trimmedTitle, vscode.ConfigurationTarget.Workspace);
        vscode.window.showInformationMessage(`AppSec: assessment created: ${created.title} (${created.id})`);
    }));
}

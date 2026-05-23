import * as vscode from "vscode";

export type ActiveCaseState = {
  id: string;
  title: string;
};

const ACTIVE_CASE_STORAGE_KEY = "appsecWorkbench.activeCase";

let activeCase: ActiveCaseState | null = null;
let activeCaseStorage: vscode.Memento | null = null;

export function configureActiveCaseStorage(storage: vscode.Memento) {
  activeCaseStorage = storage;
  const stored = storage.get<ActiveCaseState | null>(ACTIVE_CASE_STORAGE_KEY, null);
  activeCase = stored && stored.id ? stored : null;
}

export function getActiveCase() {
  return activeCase;
}

export function setActiveCase(next: ActiveCaseState | null) {
  activeCase = next;
  void activeCaseStorage?.update(ACTIVE_CASE_STORAGE_KEY, next);
}

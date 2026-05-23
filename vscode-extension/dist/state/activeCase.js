"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureActiveCaseStorage = configureActiveCaseStorage;
exports.getActiveCase = getActiveCase;
exports.setActiveCase = setActiveCase;
const ACTIVE_CASE_STORAGE_KEY = "appsecWorkbench.activeCase";
let activeCase = null;
let activeCaseStorage = null;
function configureActiveCaseStorage(storage) {
    activeCaseStorage = storage;
    const stored = storage.get(ACTIVE_CASE_STORAGE_KEY, null);
    activeCase = stored && stored.id ? stored : null;
}
function getActiveCase() {
    return activeCase;
}
function setActiveCase(next) {
    activeCase = next;
    void activeCaseStorage?.update(ACTIVE_CASE_STORAGE_KEY, next);
}

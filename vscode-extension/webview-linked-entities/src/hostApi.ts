import { vscode } from "./vscode";

export type HostMutationAction =
  | "movePartOf"
  | "updateDescription"
  | "updateDisplayName"
  | "deleteRelation"
  | "createCheckFromNode"
  | "toggleDeadEnd";

type PendingMutation = {
  resolve: () => void;
  reject: (error: Error) => void;
};

const pendingMutations = new Map<string, PendingMutation>();
let listenerInstalled = false;

function ensureListener() {
  if (listenerInstalled) {
    return;
  }
  listenerInstalled = true;
  window.addEventListener("message", (event: MessageEvent) => {
    const message = event.data as {
      type?: string;
      requestId?: string;
      ok?: boolean;
      error?: string;
    };
    if (message.type !== "mutateResult" || typeof message.requestId !== "string") {
      return;
    }
    const pending = pendingMutations.get(message.requestId);
    if (!pending) {
      return;
    }
    pendingMutations.delete(message.requestId);
    if (message.ok) {
      pending.resolve();
      return;
    }
    pending.reject(new Error(message.error ?? "Mutation failed"));
  });
}

export function requestHostMutation(
  action: HostMutationAction,
  payload: Record<string, unknown>,
): Promise<void> {
  ensureListener();
  const requestId = globalThis.crypto?.randomUUID?.() ?? `mut-${Date.now()}-${Math.random()}`;
  return new Promise((resolve, reject) => {
    pendingMutations.set(requestId, {
      resolve,
      reject,
    });
    vscode.postMessage({
      type: "mutate",
      requestId,
      action,
      payload,
    });
  });
}

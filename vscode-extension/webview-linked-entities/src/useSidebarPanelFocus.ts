import { useCallback, useEffect, useRef } from "react";

import { vscode } from "./vscode";

export function useSidebarPanelFocus(rootSelector: string) {
  const focusSentRef = useRef(false);

  const sendPanelFocus = useCallback(() => {
    if (focusSentRef.current) {
      return;
    }
    focusSentRef.current = true;
    vscode.postMessage({ type: "panelFocus" });
  }, []);

  const announcePanelFocus = sendPanelFocus;

  const sendPanelBlur = useCallback(() => {
    if (!focusSentRef.current) {
      return;
    }
    focusSentRef.current = false;
    vscode.postMessage({ type: "panelBlur" });
  }, []);

  const onPointerDownCapture = useCallback(() => {
    announcePanelFocus();
  }, [announcePanelFocus]);

  useEffect(() => {
    const root = document.querySelector(rootSelector);
    if (root?.matches(":hover")) {
      sendPanelFocus();
    }

    const onPointerMove = () => {
      sendPanelFocus();
      window.removeEventListener("pointermove", onPointerMove, true);
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && root?.contains(target)) {
        announcePanelFocus();
      }
    };

    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerdown", onPointerDown, true);

    return () => {
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [announcePanelFocus, rootSelector, sendPanelFocus]);

  return {
    onMouseEnter: sendPanelFocus,
    onMouseLeave: sendPanelBlur,
    onPointerDownCapture,
  };
}

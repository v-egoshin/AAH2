// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import ReactDOM from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ModalShell } from "./modal";

function renderIntoBody(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  act(() => {
    root.render(node);
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("ModalShell", () => {
  it("shows a discard warning on Escape before closing a dirty form", () => {
    const onClose = vi.fn();
    const view = renderIntoBody(
      <ModalShell title="Edit Case" onClose={onClose} isDirty>
        <div>Body</div>
      </ModalShell>,
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Discard changes?");

    const discardButton = [...document.body.querySelectorAll("button")]
      .find((node) => node.textContent?.includes("Discard"));
    expect(discardButton).not.toBeNull();

    act(() => {
      discardButton!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});

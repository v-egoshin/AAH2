// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import ReactDOM from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "./context-menu";

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

function dispatchContextMenu(target: Element, coords: { x: number; y: number }) {
  act(() => {
    target.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: coords.x,
      clientY: coords.y,
    }));
  });
}

function dispatchKey(key: string, init: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key,
      ...init,
    }));
  });
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("ContextMenu", () => {
  it("opens on right click and closes on outside pointer and Escape", () => {
    const view = renderIntoBody(
      <ContextMenu>
        <ContextMenuTrigger>
          <div data-testid="trigger">Row</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => {}}>Open</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    const trigger = view.container.querySelector("[data-testid='trigger']");
    expect(trigger).not.toBeNull();

    dispatchContextMenu(trigger!, { x: 48, y: 64 });
    expect(document.body.querySelector("[role='menu']")).not.toBeNull();

    act(() => {
      document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(document.body.querySelector("[role='menu']")).toBeNull();

    dispatchContextMenu(trigger!, { x: 48, y: 64 });
    expect(document.body.querySelector("[role='menu']")).not.toBeNull();

    dispatchKey("Escape");
    expect(document.body.querySelector("[role='menu']")).toBeNull();

    view.unmount();
  });

  it("opens from keyboard, skips disabled items, and selects the active item", () => {
    const onSelect = vi.fn();
    const view = renderIntoBody(
      <ContextMenu>
        <ContextMenuTrigger>
          <button data-testid="trigger" type="button">Open Menu</button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem disabled onSelect={() => {}}>Disabled</ContextMenuItem>
          <ContextMenuItem onSelect={onSelect}>Enabled</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    const trigger = view.container.querySelector("[data-testid='trigger']") as HTMLButtonElement | null;
    expect(trigger).not.toBeNull();

    act(() => {
      trigger!.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "F10",
        shiftKey: true,
      }));
    });

    const menu = document.body.querySelector("[role='menu']") as HTMLElement | null;
    expect(menu).not.toBeNull();
    expect(document.activeElement).toBe(menu);

    const items = [...document.body.querySelectorAll<HTMLButtonElement>("[role='menuitem']")];
    expect(items[0].disabled).toBe(true);
    expect(items[1].className).toContain("is-active");

    dispatchKey("Enter");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector("[role='menu']")).toBeNull();

    view.unmount();
  });

  it("clamps the menu inside the viewport", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 500 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 400 });

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function mockRect() {
      const element = this as HTMLElement;
      if (element.classList.contains("context-menu")) {
        return DOMRect.fromRect({ x: 490, y: 390, width: 120, height: 100 });
      }
      if (element.dataset.testid === "trigger") {
        return DOMRect.fromRect({ x: 16, y: 16, width: 80, height: 24 });
      }
      return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 });
    });

    const view = renderIntoBody(
      <ContextMenu>
        <ContextMenuTrigger>
          <div data-testid="trigger">Row</div>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => {}}>Open</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    );

    const trigger = view.container.querySelector("[data-testid='trigger']");
    expect(trigger).not.toBeNull();

    dispatchContextMenu(trigger!, { x: 490, y: 390 });
    const menu = document.body.querySelector(".context-menu") as HTMLElement | null;
    expect(menu).not.toBeNull();
    expect(menu?.style.left).toBe("372px");
    expect(menu?.style.top).toBe("292px");

    view.unmount();
  });
});

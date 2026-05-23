// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const workbenchMocks = vi.hoisted(() => ({
  getChecks: vi.fn(),
  getCases: vi.fn(),
  getRelations: vi.fn(),
  updateCheck: vi.fn(),
  deleteCheck: vi.fn(),
  createCheck: vi.fn(),
  createRelation: vi.fn(),
  deleteRelation: vi.fn(),
  convertCheckToFinding: vi.fn(),
}));

vi.mock("../app/workbench", () => ({
  useWorkbench: () => ({
    api: {
      getChecks: workbenchMocks.getChecks,
      getCases: workbenchMocks.getCases,
      getRelations: workbenchMocks.getRelations,
      updateCheck: workbenchMocks.updateCheck,
      deleteCheck: workbenchMocks.deleteCheck,
      createCheck: workbenchMocks.createCheck,
      createRelation: workbenchMocks.createRelation,
      deleteRelation: workbenchMocks.deleteRelation,
      convertCheckToFinding: workbenchMocks.convertCheckToFinding,
    },
    selectedAssessmentId: "assessment-1",
  }),
}));

import { ChecksPage } from "./ChecksPage";

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

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
  });
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("ChecksPage", () => {
  it("shows only the group submenu for group rows in the context menu", async () => {
    workbenchMocks.getCases.mockResolvedValue([]);
    workbenchMocks.getRelations.mockResolvedValue([]);
    workbenchMocks.getChecks.mockResolvedValue([
      {
        id: "group-1",
        assessment_id: "assessment-1",
        title: "Root Group",
        is_group: true,
        is_checked: false,
        status: "NOT_STARTED",
        sort_order: 0,
      },
      {
        id: "check-1",
        assessment_id: "assessment-1",
        title: "Root Check",
        is_group: false,
        is_checked: false,
        status: "IN_PROGRESS",
        sort_order: 1,
      },
    ]);

    const view = renderIntoBody(
      <MemoryRouter
        initialEntries={["/checks"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ChecksPage />
      </MemoryRouter>,
    );

    await flushAsyncWork();

    const row = [...view.container.querySelectorAll<HTMLElement>(".tree-node")]
      .find((node) => node.textContent?.includes("Root Group"));
    expect(row).not.toBeNull();

    act(() => {
      row!.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 80,
        clientY: 100,
      }));
    });

    const menuButtons = [...document.body.querySelectorAll<HTMLButtonElement>(".context-menu button")];
    const statusItem = menuButtons.find((node) => node.textContent?.includes("NOT_STARTED"));
    const groupItem = menuButtons.find((node) => node.textContent?.includes("Group"));
    expect(statusItem).toBeUndefined();
    expect(groupItem).not.toBeUndefined();

    view.unmount();
  });

  it("marks the check complete when CHECKED_OK is selected from the context menu", async () => {
    workbenchMocks.getCases.mockResolvedValue([]);
    workbenchMocks.getRelations.mockResolvedValue([]);
    workbenchMocks.getChecks.mockResolvedValue([
      {
        id: "check-1",
        assessment_id: "assessment-1",
        title: "Root Check",
        is_group: false,
        is_checked: false,
        status: "IN_PROGRESS",
        sort_order: 0,
      },
    ]);

    const view = renderIntoBody(
      <MemoryRouter
        initialEntries={["/checks"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <ChecksPage />
      </MemoryRouter>,
    );

    await flushAsyncWork();

    const row = [...view.container.querySelectorAll<HTMLElement>(".tree-node")]
      .find((node) => node.textContent?.includes("Root Check"));
    expect(row).not.toBeNull();

    act(() => {
      row!.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 80,
        clientY: 100,
      }));
    });

    const checkedOkItem = [...document.body.querySelectorAll<HTMLButtonElement>("[role='menuitem']")]
      .find((node) => node.textContent?.includes("CHECKED_OK"));
    expect(checkedOkItem).not.toBeNull();

    act(() => {
      checkedOkItem!.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(workbenchMocks.updateCheck).toHaveBeenCalledWith("check-1", {
      status: "CHECKED_OK",
      is_checked: true,
    });

    view.unmount();
  });

  it("deletes the selected check from the context menu", async () => {
    workbenchMocks.getCases.mockResolvedValue([]);
    workbenchMocks.getRelations.mockResolvedValue([]);
    workbenchMocks.getChecks.mockResolvedValue([
      {
        id: "check-1",
        assessment_id: "assessment-1",
        title: "Root Check",
        is_group: false,
        is_checked: false,
        status: "IN_PROGRESS",
        sort_order: 0,
      },
    ]);
    workbenchMocks.deleteCheck.mockResolvedValue({ deleted: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const view = renderIntoBody(
      <MemoryRouter initialEntries={["/checks"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ChecksPage />
      </MemoryRouter>,
    );

    await flushAsyncWork();

    const row = [...view.container.querySelectorAll<HTMLElement>(".tree-node")]
      .find((node) => node.textContent?.includes("Root Check"));
    expect(row).not.toBeNull();

    act(() => {
      row!.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 80,
        clientY: 100,
      }));
    });

    const deleteItem = [...document.body.querySelectorAll<HTMLButtonElement>("[role='menuitem']")]
      .find((node) => node.textContent?.includes("Delete check"));
    expect(deleteItem).not.toBeNull();

    await act(async () => {
      deleteItem!.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }));
      await Promise.resolve();
    });

    expect(workbenchMocks.deleteCheck).toHaveBeenCalledWith("check-1");
    view.unmount();
  });

  it("confirms and deletes a check with nested children", async () => {
    workbenchMocks.getCases.mockResolvedValue([]);
    workbenchMocks.getRelations.mockResolvedValue([]);
    workbenchMocks.getChecks.mockResolvedValue([
      {
        id: "check-1",
        assessment_id: "assessment-1",
        title: "Parent Check",
        is_group: false,
        is_checked: false,
        status: "IN_PROGRESS",
        sort_order: 0,
      },
      {
        id: "check-2",
        assessment_id: "assessment-1",
        title: "Child Check",
        parent_check_id: "check-1",
        is_group: false,
        is_checked: false,
        status: "NOT_STARTED",
        sort_order: 0,
      },
    ]);
    workbenchMocks.deleteCheck.mockResolvedValue({ deleted: true });
    const confirmSpy = vi.spyOn(window, "confirm")
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true);

    const view = renderIntoBody(
      <MemoryRouter initialEntries={["/checks"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ChecksPage />
      </MemoryRouter>,
    );

    await flushAsyncWork();

    const row = [...view.container.querySelectorAll<HTMLElement>(".tree-node")]
      .find((node) => node.textContent?.includes("Parent Check"));
    expect(row).not.toBeNull();

    act(() => {
      row!.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 80,
        clientY: 100,
      }));
    });

    const deleteItem = [...document.body.querySelectorAll<HTMLButtonElement>("[role='menuitem']")]
      .find((node) => node.textContent?.includes("Delete check"));

    await act(async () => {
      deleteItem!.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }));
      await Promise.resolve();
    });

    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(workbenchMocks.deleteCheck).toHaveBeenCalledWith("check-1");
    view.unmount();
  });

  it("deletes all selected checks from the context menu", async () => {
    workbenchMocks.getCases.mockResolvedValue([]);
    workbenchMocks.getRelations.mockResolvedValue([]);
    workbenchMocks.getChecks.mockResolvedValue([
      {
        id: "check-1",
        assessment_id: "assessment-1",
        title: "First Check",
        is_group: false,
        is_checked: false,
        status: "IN_PROGRESS",
        sort_order: 0,
      },
      {
        id: "check-2",
        assessment_id: "assessment-1",
        title: "Second Check",
        is_group: false,
        is_checked: false,
        status: "NOT_STARTED",
        sort_order: 1,
      },
    ]);
    workbenchMocks.deleteCheck.mockResolvedValue({ deleted: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const view = renderIntoBody(
      <MemoryRouter initialEntries={["/checks"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ChecksPage />
      </MemoryRouter>,
    );

    await flushAsyncWork();

    const firstRow = [...view.container.querySelectorAll<HTMLElement>(".tree-node")]
      .find((node) => node.textContent?.includes("First Check"));
    const secondRow = [...view.container.querySelectorAll<HTMLElement>(".tree-node")]
      .find((node) => node.textContent?.includes("Second Check"));
    expect(firstRow).not.toBeNull();
    expect(secondRow).not.toBeNull();

    act(() => {
      firstRow!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    act(() => {
      secondRow!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }));
    });

    act(() => {
      secondRow!.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 80,
        clientY: 100,
      }));
    });

    const deleteItem = [...document.body.querySelectorAll<HTMLButtonElement>("[role='menuitem']")]
      .find((node) => node.textContent?.includes("Delete selected (2)"));
    expect(deleteItem).not.toBeNull();

    await act(async () => {
      deleteItem!.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }));
      await Promise.resolve();
    });

    expect(workbenchMocks.deleteCheck).toHaveBeenCalledTimes(2);
    expect(workbenchMocks.deleteCheck).toHaveBeenCalledWith("check-1");
    expect(workbenchMocks.deleteCheck).toHaveBeenCalledWith("check-2");
    view.unmount();
  });

  it("creates bulk checks as children of the target check", async () => {
    workbenchMocks.getCases.mockResolvedValue([]);
    workbenchMocks.getRelations.mockResolvedValue([]);
    workbenchMocks.getChecks.mockResolvedValue([
      {
        id: "check-1",
        assessment_id: "assessment-1",
        title: "Parent Check",
        is_group: false,
        is_checked: false,
        status: "IN_PROGRESS",
        sort_order: 0,
      },
      {
        id: "check-2",
        assessment_id: "assessment-1",
        title: "Existing Child",
        parent_check_id: "check-1",
        is_group: false,
        is_checked: false,
        status: "NOT_STARTED",
        sort_order: 0,
      },
    ]);
    workbenchMocks.createCheck.mockImplementation(async (_assessmentId, payload) => ({
      id: `created-${payload.title}`,
      assessment_id: "assessment-1",
      ...payload,
      is_checked: false,
      status: "NOT_STARTED",
      sort_order: 0,
    }));

    const view = renderIntoBody(
      <MemoryRouter initialEntries={["/checks"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ChecksPage />
      </MemoryRouter>,
    );

    await flushAsyncWork();

    const parentRow = [...view.container.querySelectorAll<HTMLElement>(".tree-node")]
      .find((node) => node.textContent?.includes("Parent Check"));
    expect(parentRow).not.toBeNull();

    act(() => {
      parentRow!.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 80,
        clientY: 100,
      }));
    });

    const bulkItem = [...document.body.querySelectorAll<HTMLButtonElement>("[role='menuitem']")]
      .find((node) => node.textContent?.includes("Add checks in bulk"));
    expect(bulkItem).not.toBeNull();

    act(() => {
      bulkItem!.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }));
    });

    const textarea = document.body.querySelector<HTMLTextAreaElement>("textarea");
    expect(textarea).not.toBeNull();

    act(() => {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      nativeInputValueSetter?.call(textarea, "Bulk One\nBulk Two");
      textarea!.dispatchEvent(new Event("input", { bubbles: true }));
      textarea!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    const addButton = [...document.body.querySelectorAll<HTMLButtonElement>("button")]
      .find((node) => node.textContent?.includes("Add checks"));
    expect(addButton).not.toBeNull();

    await act(async () => {
      addButton!.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(workbenchMocks.createCheck).toHaveBeenCalledTimes(2);
    expect(workbenchMocks.createCheck).toHaveBeenNthCalledWith(1, "assessment-1", expect.objectContaining({
      title: "Bulk One",
      parent_check_id: "check-1",
    }));
    expect(workbenchMocks.createCheck).toHaveBeenNthCalledWith(2, "assessment-1", expect.objectContaining({
      title: "Bulk Two",
      parent_check_id: "check-1",
    }));
    view.unmount();
  });
});

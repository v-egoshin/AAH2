// @vitest-environment jsdom

import React from "react";
import { act } from "react";
import ReactDOM from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const workbenchMocks = vi.hoisted(() => ({
  getCases: vi.fn(),
  getRelations: vi.fn(),
  getMarks: vi.fn(),
  getChecks: vi.fn(),
  getFindings: vi.fn(),
  getObjects: vi.fn(),
  getCandidates: vi.fn(),
  createCheck: vi.fn(),
  createRelation: vi.fn(),
  deleteRelation: vi.fn(),
  updateRelation: vi.fn(),
  updateMark: vi.fn(),
  updateCase: vi.fn(),
}));

vi.mock("../app/workbench", () => ({
  useWorkbench: () => ({
    api: {
      getCases: workbenchMocks.getCases,
      getRelations: workbenchMocks.getRelations,
      getMarks: workbenchMocks.getMarks,
      getChecks: workbenchMocks.getChecks,
      getFindings: workbenchMocks.getFindings,
      getObjects: workbenchMocks.getObjects,
      getCandidates: workbenchMocks.getCandidates,
      createCheck: workbenchMocks.createCheck,
      createRelation: workbenchMocks.createRelation,
      deleteRelation: workbenchMocks.deleteRelation,
      updateRelation: workbenchMocks.updateRelation,
      updateMark: workbenchMocks.updateMark,
      updateCase: workbenchMocks.updateCase,
    },
    selectedAssessmentId: "assessment-1",
  }),
}));

import { CasesPage } from "./CasesPage";

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

async function waitForGraphLoaded(container: HTMLElement) {
  await act(async () => {
    await vi.waitFor(() => {
      expect(container.querySelector(".case-tree-entity-label")).toBeTruthy();
    }, { timeout: 3000 });
  });
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("CasesPage", () => {
  it("shows user description next to ↗ and creates a nested check from the entity context menu", async () => {
    workbenchMocks.getCases.mockResolvedValue([
      {
        id: "case-1",
        assessment_id: "assessment-1",
        title: "Case 1",
        description: "Case description",
        status: "OPEN",
      },
    ]);
    workbenchMocks.getRelations.mockResolvedValue([
      {
        id: "relation-1",
        assessment_id: "assessment-1",
        subject_type: "MARK",
        subject_id: "mark-1",
        predicate: "PART_OF",
        object_type: "CASE",
        object_id: "case-1",
        properties: { user_description: "Manual description" },
      },
      {
        id: "relation-2",
        assessment_id: "assessment-1",
        subject_type: "MARK",
        subject_id: "mark-1",
        predicate: "CHECKS",
        object_type: "CHECK",
        object_id: "check-1",
      },
      {
        id: "relation-3",
        assessment_id: "assessment-1",
        subject_type: "CHECK",
        subject_id: "check-1",
        predicate: "PART_OF",
        object_type: "CASE",
        object_id: "case-1",
      },
    ]);
    workbenchMocks.getMarks.mockResolvedValue([
      {
        id: "mark-1",
        assessment_id: "assessment-1",
        object_id: "object-1",
        kind: "SOURCE",
        title: "Import flow",
        note: "Description from mark",
        confidence: "MEDIUM",
        status: "OPEN",
      },
    ]);
    workbenchMocks.getChecks.mockResolvedValue([
      {
        id: "check-1",
        assessment_id: "assessment-1",
        title: "Generated Check",
        description: "",
        status: "NOT_STARTED",
      },
    ]);
    workbenchMocks.getFindings.mockResolvedValue([]);
    workbenchMocks.getObjects.mockResolvedValue([]);
    workbenchMocks.getCandidates.mockResolvedValue([]);
    workbenchMocks.createCheck.mockResolvedValue({ id: "check-1" });
    workbenchMocks.createRelation.mockResolvedValue({});

    const view = renderIntoBody(
      <MemoryRouter
        initialEntries={["/cases?selected=case-1"]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <CasesPage />
      </MemoryRouter>,
    );

    await flushAsyncWork();
    await waitForGraphLoaded(view.container);

    const description = [...view.container.querySelectorAll(".case-tree-description")]
      .find((node) => node.textContent?.includes("Manual description"));
    expect(description).not.toBeUndefined();
    expect(view.container.textContent?.match(/Generated Check/g)?.length ?? 0).toBe(1);

    const entityLabel = [...view.container.querySelectorAll(".case-tree-entity-label")]
      .find((node) => node.textContent?.includes("Import flow"));
    expect(entityLabel).not.toBeUndefined();

    const row = entityLabel?.closest(".relation-tree-hit");
    expect(row).not.toBeNull();

    act(() => {
      row!.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 80,
        clientY: 100,
      }));
    });

    const createCheckItem = [...document.body.querySelectorAll<HTMLButtonElement>("[role='menuitem']")]
      .find((node) => node.textContent?.includes("Create check"));
    expect(createCheckItem).not.toBeNull();

    await act(async () => {
      createCheckItem!.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }));
      await Promise.resolve();
    });

    expect(workbenchMocks.createCheck).toHaveBeenCalledWith("assessment-1", expect.objectContaining({
      title: "Import flow",
      description: "Manual description",
    }));
    expect(workbenchMocks.createRelation).toHaveBeenNthCalledWith(1, "assessment-1", expect.objectContaining({
      subject_type: "MARK",
      subject_id: "mark-1",
      predicate: "CHECKS",
      object_type: "CHECK",
      object_id: "check-1",
    }));
    expect(workbenchMocks.createRelation).toHaveBeenNthCalledWith(2, "assessment-1", expect.objectContaining({
      subject_type: "CHECK",
      subject_id: "check-1",
      predicate: "PART_OF",
      object_type: "CASE",
      object_id: "case-1",
    }));

    view.unmount();
  });
});

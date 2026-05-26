import { createBrowserRouter, Navigate } from "react-router-dom";
import { Layout } from "./Layout";
import { AssetsPage } from "../pages/AssetsPage";
import { CandidateInboxPage } from "../pages/CandidateInboxPage";
import { CoveragePage } from "../pages/CoveragePage";
import { DashboardPage } from "../pages/DashboardPage";
import { CasesPage } from "../pages/CasesPage";
import { FindingsPage } from "../pages/FindingsPage";
import { ImportsPage } from "../pages/ImportsPage";
import { ObjectsPage } from "../pages/ObjectsPage";
import { MarksPage } from "../pages/MarksPage";
import { ChecksPage } from "../pages/ChecksPage";
import { RelationsPage } from "../pages/RelationsPage";
import { ReviewContextPage } from "../pages/ReviewContextPage";
import { MarkKindsSettingsTab, SettingsPage } from "../pages/SettingsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "assets", element: <AssetsPage /> },
      { path: "imports", element: <ImportsPage /> },
      { path: "candidates", element: <CandidateInboxPage /> },
      { path: "objects", element: <ObjectsPage /> },
      { path: "marks", element: <MarksPage /> },
      { path: "checks", element: <ChecksPage /> },
      { path: "cases", element: <CasesPage /> },
      { path: "findings", element: <FindingsPage /> },
      { path: "relations", element: <RelationsPage /> },
      { path: "coverage", element: <CoveragePage /> },
      { path: "review-context", element: <ReviewContextPage /> },
      {
        path: "settings",
        element: <SettingsPage />,
        children: [
          { index: true, element: <Navigate to="mark-kinds" replace /> },
          { path: "mark-kinds", element: <MarkKindsSettingsTab /> },
        ],
      },
    ],
  },
]);

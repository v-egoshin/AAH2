import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./Layout";
import { CandidateInboxPage } from "../pages/CandidateInboxPage";
import { CoveragePage } from "../pages/CoveragePage";
import { DashboardPage } from "../pages/DashboardPage";
import { CasesPage } from "../pages/CasesPage";
import { FindingsPage } from "../pages/FindingsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: "candidates", element: <CandidateInboxPage /> },
      { path: "coverage", element: <CoveragePage /> },
      { path: "cases", element: <CasesPage /> },
      { path: "findings", element: <FindingsPage /> },
    ],
  },
]);

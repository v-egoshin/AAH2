import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./app/router";
import { WorkbenchProvider } from "./app/workbench";
import "./app/styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <WorkbenchProvider>
      <RouterProvider router={router} />
    </WorkbenchProvider>
  </React.StrictMode>
);

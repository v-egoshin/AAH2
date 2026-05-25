import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@web/app/styles.css";
import "./embed.css";

import { App } from "./App";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

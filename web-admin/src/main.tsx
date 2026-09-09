import { createRoot } from "react-dom/client";
import React from "react";
import { AppRouter } from "./appRoutes";
import "./styles.css";

if (new URLSearchParams(window.location.search).get("view") === "overlay") {
  document.documentElement.classList.add("court-overlay-document");
}

createRoot(document.getElementById("root")!).render(<AppRouter />);

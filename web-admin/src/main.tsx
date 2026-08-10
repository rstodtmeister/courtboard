import { createRoot } from "react-dom/client";
import React from "react";
import { AppRouter } from "./appRoutes";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<AppRouter />);

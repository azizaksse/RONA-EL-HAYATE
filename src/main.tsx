import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { captureSource } from "./store/pixels";
import "./styles/styles.css";

/* Slow network / low-end phone: turn off decorative animations (see .lite in styles.css). */
const conn: any = (navigator as any).connection || {};
if (conn.saveData || /(^|-)2g|3g/.test(conn.effectiveType || "") || ((navigator as any).deviceMemory && (navigator as any).deviceMemory <= 2)) document.documentElement.classList.add("lite");
if ("serviceWorker" in navigator && import.meta.env.PROD && location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      reg.addEventListener("updatefound", () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            newWorker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      // Tabs left open (common on phones) pick up a new deploy when the user comes back.
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
    }).catch(() => {});
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}
try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch { /* ignore */ }
captureSource();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

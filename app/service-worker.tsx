"use client";

import { useEffect } from "react";

// Installe public/sw.js, qui garde une copie de l'appli sur le téléphone
// pour qu'elle s'ouvre même sans réseau.
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Les fichiers déjà chargés avant l'installation sont gardés aussi
        const fichiers = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((url) => url.startsWith(`${location.origin}/_next/static/`));
        reg.active?.postMessage({ type: "garder", fichiers });
      })
      .catch(() => {});
  }, []);
  return null;
}

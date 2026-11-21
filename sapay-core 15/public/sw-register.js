'use strict';
// Kept out of index.html: the API serves public/ behind helmet's CSP
// (script-src 'self'), which blocks inline scripts.
// Register the worker, check for a new version whenever the app returns
// to the foreground (a home-screen app on iOS is resumed, not reloaded),
// and reload once when a new worker takes over so no stale code keeps running.
if ("serviceWorker" in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js", { updateViaCache: "none" }).then((registration) => {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") registration.update().catch(() => {});
      });
    }).catch(() => {});
  });
}

import { portalAction } from "./portal.js";
const APP_ORIGINS = new Set([
  "https://vthacks-2026-production.up.railway.app",
  "http://127.0.0.1:8000",
]);
const PORTAL = "https://hokies.healthcenter.vt.edu";
const busy = new Set();

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    if (
      !sender.tab ||
      sender.frameId !== 0 ||
      !APP_ORIGINS.has(new URL(sender.url).origin)
    )
      throw Error("Unsupported app origin.");
    if (message.command === "ping")
      return { state: "installed", version: "0.1.0" };
    const key = `portal-${sender.tab.id}`;
    if (busy.has(key)) throw Error("A companion action is already running.");
    busy.add(key);
    try {
      const stored = await chrome.storage.session.get(key);
      let tab;
      try {
        tab = await chrome.tabs.get(stored[key]);
      } catch {
        /* closed or never opened */
      }
      if (message.command === "open") {
        if (tab) {
          await chrome.windows.update(tab.windowId, { focused: true });
          await chrome.tabs.update(tab.id, { active: true });
        } else {
          const window = await chrome.windows.create({
            url: `${PORTAL}/Home`,
            type: "popup",
            width: 1000,
            height: 800,
          });
          tab = window.tabs[0];
          await chrome.storage.session.set({ [key]: tab.id });
        }
        return {
          state: "user_step",
          message:
            "Sign in directly with Virginia Tech and Duo. Choose Schedule an Appointment, complete screening, and search for appointments. Return here to read times.",
        };
      }
      if (!["read", "select"].includes(message.command))
        throw Error("Unsupported action.");
      if (!tab) throw Error("Open the portal with the companion first.");
      // The extension has no permission on the VT login domain. Never inject there.
      if (!tab.url?.startsWith(`${PORTAL}/`))
        return {
          state: "login",
          message: "Complete VT sign-in and Duo in the portal window first.",
        };
      const result = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: portalAction,
        args: [message.command, message.slot ?? null],
      });
      if (message.command === "select")
        await chrome.windows.update(tab.windowId, { focused: true });
      return (
        result[0]?.result || {
          error:
            "Unable to read the portal. Open it and check the current screen.",
        }
      );
    } finally {
      busy.delete(key);
    }
  })()
    .then(respond)
    .catch(() =>
      respond({
        error:
          "Companion could not complete this step. Reopen the portal and try again.",
      }),
    );
  return true;
});

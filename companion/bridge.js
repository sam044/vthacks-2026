// No page-supplied code, URL, or selector is accepted.
window.addEventListener("message", async (event) => {
  const m = event.data;
  if (
    event.source !== window ||
    event.origin !== location.origin ||
    m?.source !== "hokiecare-app" ||
    typeof m.id !== "string" ||
    m.id.length > 80 ||
    !["ping", "open", "read", "select"].includes(m.command)
  )
    return;
  try {
    const result = await chrome.runtime.sendMessage({
      command: m.command,
      slot: m.slot,
    });
    window.postMessage(
      { source: "hokiecare-companion", id: m.id, ...result },
      location.origin,
    );
  } catch {
    window.postMessage(
      {
        source: "hokiecare-companion",
        id: m.id,
        error: "Reload HokieCare after installing or updating the companion.",
      },
      location.origin,
    );
  }
});

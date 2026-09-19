// Self-contained: chrome.scripting injects this function in an isolated world.
// Only availability-page fields are read. No account, clinical, credential, or cookie reads.
export function portalAction(command, expected) {
  if (location.origin !== "https://hokies.healthcenter.vt.edu")
    return { state: "login" };
  if (location.pathname !== "/Mvc/Appointment/Available") {
    return {
      state: "user_step",
      message:
        "In the portal, choose Schedule an Appointment and complete department selection and screening yourself. Then search for appointments.",
    };
  }
  const tidy = (text) => (text || "").replace(/\s+/g, " ").trim().slice(0, 180);
  const slots = [];
  const elements = new Map();
  for (const group of document.querySelectorAll(".appt-group.day")) {
    const date = tidy(group.querySelector(".appt-group-header")?.textContent);
    let provider = "";
    let place = "";
    for (const child of group.children) {
      if (child.classList.contains("appt-group-subheader")) {
        provider = tidy(child.querySelector("a.bio")?.textContent);
        place = tidy(child.textContent)
          .replace(provider, "")
          .replace(/^\s*at\s+/, "")
          .trim();
      }
      for (const radio of child.querySelectorAll(
        'input.appt-radio-button[name="rbgAppt"]',
      )) {
        const button = radio.closest('button[type="button"]');
        if (
          !date ||
          !provider ||
          !button ||
          radio.disabled ||
          button.disabled ||
          !button.getClientRects().length
        )
          continue;
        const time = tidy(radio.parentElement.textContent);
        const slot = { id: radio.value, date, time, provider, location: place };
        if (!/^-?\d+$/.test(slot.id) || !/^\d{1,2}:\d{2} [AP]M$/.test(time))
          continue;
        slots.push(slot);
        elements.set(slot.id, { radio, button });
      }
    }
  }
  if (command === "select") {
    const slot = slots.find((s) =>
      ["id", "date", "time", "provider", "location"].every(
        (key) => s[key] === expected?.[key],
      ),
    );
    if (!slot)
      return { error: "That time changed. Read the current times again." };
    // Selecting this observed type=button does not submit the appointment form.
    const { radio, button } = elements.get(slot.id);
    button.click();
    if (!radio.checked)
      return {
        error:
          "The portal did not select that time. Select it in the portal yourself.",
      };
    return {
      state: "selected",
      slot,
      message:
        "Selected in the portal, not booked. Review and complete the remaining steps there.",
    };
  }
  return {
    state: slots.length ? "available" : "search_needed",
    slots: slots.slice(0, 100),
    total: slots.length,
    fetched_at: new Date().toISOString(),
    message: slots.length
      ? "Live portal results. Times may change before confirmation."
      : "Use Search for appointments in the portal, then read times again.",
  };
}

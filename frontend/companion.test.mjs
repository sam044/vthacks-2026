import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import { portalAction } from "../companion/portal.js";

function fixture() {
  // Fictional data only, preserving the observed portal's availability structure.
  const { document } = parseHTML(`<div class="appt-group day">
    <div class="appt-group-header mt-4">Monday, January 5, 2032</div>
    <div class="appt-group-subheader mt-3"><div><a class="bio">EXAMPLE CLINICIAN</a> at Example Clinic</div></div>
    <div class="row"><div class="appt-group-time-container">
      <button type="button">9:00 AM<label><input type="radio" name="rbgAppt" class="appt-radio-button" value="123"> 9:00 AM</label></button>
      <button type="button" disabled>10:00 AM<label><input type="radio" name="rbgAppt" class="appt-radio-button" value="456"> 10:00 AM</label></button>
    </div></div></div><button type="submit" id="final">Continue</button>`);
  globalThis.document = document;
  globalThis.location = {
    origin: "https://hokies.healthcenter.vt.edu",
    pathname: "/Mvc/Appointment/Available",
  };
  for (const button of document.querySelectorAll("button"))
    button.getClientRects = () => [{}];
  let clicked = 0;
  document.querySelector("button").addEventListener("click", () => {
    clicked++;
    document.querySelector("input").checked = true;
  });
  document
    .querySelector("#final")
    .addEventListener("click", () =>
      assert.fail("Must never submit final booking"),
    );
  return { document, clicks: () => clicked };
}
test("extracts only complete enabled availability; selection does not submit", () => {
  const f = fixture();
  const result = portalAction("read");
  assert.equal(result.slots.length, 1);
  assert.deepEqual(result.slots[0], {
    id: "123",
    date: "Monday, January 5, 2032",
    time: "9:00 AM",
    provider: "EXAMPLE CLINICIAN",
    location: "Example Clinic",
  });
  assert.equal(f.clicks(), 0);
  assert.equal(portalAction("select", result.slots[0]).state, "selected");
  assert.equal(f.clicks(), 1);
});
test("rejects stale or changed slots before interaction", () => {
  const f = fixture();
  const slot = portalAction("read").slots[0];
  assert.ok(portalAction("select", { ...slot, time: "11:00 AM" }).error);
  assert.equal(f.clicks(), 0);
  f.document.querySelector(".appt-group-header").remove();
  assert.equal(portalAction("read").state, "search_needed");
});
test("does not read screening or login contents", () => {
  fixture();
  globalThis.document = {
    querySelectorAll: () => assert.fail("Must not read this page"),
  };
  globalThis.location.pathname = "/Mvc/Branch";
  assert.equal(portalAction("read").state, "user_step");
  globalThis.location.origin = "https://login.vt.edu";
  assert.equal(portalAction("read").state, "login");
});

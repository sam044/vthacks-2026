# Schiffert companion: focused feasibility result

Checked September 19, 2026 with the user's authorized, signed-in browser. No real appointment was booked, cancelled, or changed.

## What worked

1. Healthy Hokies at `https://hokies.healthcenter.vt.edu/Home` reaches Virginia Tech sign-in. The user entered their own credentials and completed Duo.
2. The authenticated portal exposes Schedule an Appointment → department selection → Appointment Screening. The user completed screening directly; the agent did not answer medical questions.
3. `/Mvc/Appointment/Available` exposes a Search for appointments action. Running that search returned actual selectable dates, times, clinicians, and clinic locations.
4. Availability has `.appt-group.day` containers, `.appt-group-header` date labels, `.appt-group-subheader` clinician/location groups, and `input.appt-radio-button[name="rbgAppt"]` inside `button[type="button"]` time controls. These structural selectors were inspected directly. No patient details, real slot IDs, or authenticated page dumps were saved in the repository.

This establishes feasibility for reading availability after user authentication and screening. It does **not** prove a final-booking API, a confirmation-screen contract, ongoing access rights, or reliable unattended booking.

## Implementation decision

Use a narrow Chrome/Edge Manifest V3 companion, with an official portal window beside HokieCare. VT login sends `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'`; an iframe is not a viable login experience. A normal webpage cannot read a separate provider site's authenticated DOM. The extension supplies that explicit, user-installed bridge.

The companion has host access only to Healthy Hokies and content scripts only on HokieCare's production/local origin. It has no permission on `login.vt.edu`; no cookie, history, or network interception permissions. The user handles login, Duo, department choice, screening, and availability search. The companion reads only the recognized availability DOM. It rechecks all displayed slot fields before selecting a time, never clicks final Continue, and reports **selected, not booked**. Portal details stay in frontend memory; only paired tab IDs enter extension session storage. Nothing from the patient portal is sent to Databricks or the demo database.

The packaged developer preview and sanitized DOM tests are in [companion](../companion/README.md). The agent's browser inspection and parser tests are separate from end-to-end testing of an installed extension. The installed-extension handshake/selection flow and final provider confirmation remain unverified. If the portal changes or authentication expires, the user continues directly in the official portal.

## Next integration gate

Install the preview in the user's Chrome/Edge browser and validate open → user sign-in → user screening → read → user-selected time. Use a provider-sanctioned test account to verify the final booking and cancellation contract before implementing final submission or importing a provider-confirmed record. The current product must not infer a booking from selection, a changed URL, or a closed window.

No public API or provider partnership has been established. Do not extrapolate Schiffert's feasibility to Carilion, TimelyCare, or Hokie Wellness. Those currently retain service-specific official links. Cook alone has synthetic, internally reserved times.

Sources: [official Schiffert appointments](https://healthcenter.vt.edu/appointments.html), [Healthy Hokies](https://hokies.healthcenter.vt.edu/Home), [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), plus the authorized live DOM/header observations described above.

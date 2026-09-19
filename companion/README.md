# Schiffert companion (developer preview)

1. Download and extract the companion ZIP linked in HokieCare.
2. In Chrome or Edge, open the Extensions page, turn on Developer mode, choose **Load unpacked**, and select the extracted folder containing `manifest.json`.
3. Reload HokieCare in that same browser. Open Appointments → Schiffert → Open VT portal.
4. Sign in directly with VT and Duo. Choose Schedule an Appointment, select your department, answer screening yourself, and search for appointments.
5. Return to HokieCare and choose **Read portal times**. Select a displayed time to highlight it in the portal. Finish and verify the booking there.

This preview reads only scheduling availability. It cannot access VT login pages, passwords, Duo, cookies, or medical records. It does not submit the final booking. Selection is not confirmation. No real booking is saved to HokieCare's demo database. Live slot details stay in browser memory; closing/reloading HokieCare clears them. The extension stores only the paired tab ID for the browser session.

Supported app origins: the production Railway app and `http://127.0.0.1:8000`. It intentionally cannot attach to arbitrary sites or existing patient tabs. The authenticated feasibility test proved login → user screening → live availability, not the final booking or a fully installed extension flow. DOM changes fail closed; use the official portal if the companion cannot recognize the page.

For distribution beyond this hackathon preview, obtain provider approval, verify the final confirmation contract with a sanctioned test account, and complete extension-store review. No iframe embedding is used: the VT login page disallows framing.

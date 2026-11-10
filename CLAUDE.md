# LCC Acquisition Scan — notes for Claude

Owner: Jonathan. Sign-off on process changes: Jonathan.

This app is a copy of **Check-In Scan** (littlecountrycars/lcc-check-in-scan), made Nov 9, 2026, with its own name (Acquisition Scan), its own offline cache (`lcc-acquisition-scan-*`), its own saved-settings keys on the phone (`lccAcq.*`) and its own address. Purpose (per Jonathan): appraising vehicles at physical auctions, including ones he may not buy. **It does not touch monday.com** (removed Nov 9, 2026); appraisals are saved on the phone and shared by the user (Share summary / Save PDF).

Auction use differs from Dylan's check-ins: limited minutes per vehicle, a ~300 m lane drive topping out around 45 mph, no stock # (a lane/run # instead), many vehicles back to back, poor signal. The test drive is a "lane drive" (firm launch to 35-45 mph, firm stop); torque converter shudder can't be checked without a steady 40+ mph. Estimated recon is a number to factor into the bid.

Auction features (Nov 9, 2026):
- **Quick appraisal**: scan + freeze frame + Ford modules + 15-second idle (if running), then the call.
- **The call**: Bid / Caution / Walk away from red flags (`redFlags()` in app.js). Hard flags = walk away: codes cleared recently with 2+ self-tests unfinished, odometer mismatch (computer vs typed dash > 1,000 mi), transmission codes, airbag faults, active transmission-module faults, slipping/shudder on the lane drive, or max bid at or below $0.
- **Max bid** = expected sale price (typed, from SCOUT's expected sale price) − this vehicle's estimated recon − minimum profit (setting, default $2,500 per Jonathan) − buyer fee + transport (setting, default $0). Don't use SCOUT's max bid as the input: SCOUT already subtracts its own typical recon and gross.
- **SCOUT**: LCC's SCOUT Buy Guide is a private claude.ai artifact (https://claude.ai/artifact/6bBGxC5drP42KJE9sGJYgZ). "Look up in SCOUT" copies the VIN and opens it. Never copy SCOUT's sales data, costs or gross into this public repo.
- **Next vehicle**: saves, clears, keeps the scanner connected, bumps a numeric lane/run # by one.
- **No signal**: VIN decode and recall lookups retry for saved appraisals when the phone comes back online (and every minute).

- Repo: littlecountrycars/lcc-aquisition-scan (moved from golittle Nov 9, 2026). Live at https://littlecountrycars.github.io/lcc-aquisition-scan/ via GitHub Pages from `main` (root).
- Never change littlecountrycars/lcc-check-in-scan from work on this app.
- `HANDOFF.md` is the history of the original Check-In Scan app (decisions, troubleshooting). Read it for background; its addresses and owner refer to Check-In Scan, not this app.

## What this is
A web app for Android phones (Chrome 137+). It talks to a Veepeak Bluetooth OBD2 adapter (ELM327). No monday.com. Pushing to `main` publishes; phones pick up the new version next open.

## Files
- `obd.js` — scanner engine: transports (Web Serial classic BT, Web Bluetooth LE, demo truck), ELM327 commands, code parsing, idle/misfire, cranking test, freeze frame, Ford module codes (UDS 0x19), test-drive analysis, fix/parts/cost table (`FIXES`), parts links (`SHOPS`).
- `app.js` — screens, recon-cost builder, saved appraisals, share/PDF. No network calls except NHTSA VIN decode/recalls.
- `index.html` — layout and styles. `sw.js` — offline cache (bump `CACHE` version when files change). `manifest.webmanifest` — home-screen install.

## monday.com
- None. This app must not read or write monday.com unless Jonathan asks for it.

## Rules
- Read-only scanner: never send mode 04 (clear codes).
- Use the LCC Brand Kit (lcc-brand skill): Country Orange #FF8C00, black, white, #666666 small print; status green #2E7D32 / red #C62828 only for state. Fjalla One headings, Arial body. Rounded corners. Nebraska orange icon as favicon/app icon. Plain, specific wording.
- Parts: AutoZone Pro (button copies the VIN for Pro's VIN lookup), Advance, NAPA, Amazon.
- Test with the demo truck before pushing.

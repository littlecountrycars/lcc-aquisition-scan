# LCC Acquisition Scan — notes for Claude

Owner: Jonathan. Sign-off on process changes: Jonathan.

This app is a copy of **Check-In Scan** (littlecountrycars/lcc-check-in-scan), made Nov 9, 2026, with its own name (Acquisition Scan), its own offline cache (`lcc-acquisition-scan-*`), its own saved-settings keys on the phone (`lccAcq.*`) and its own address. Everything else, including posting to the Inventory Recon board, still works exactly like Check-In Scan until someone changes it. Purpose (per Jonathan): pre-purchase/appraisal scanning, kept separate from inventory recon.

- Repo: golittle/lcc-aquisition-scan. Live at https://golittle.github.io/lcc-aquisition-scan/ via GitHub Pages from `main` (root).
- Never change littlecountrycars/lcc-check-in-scan from work on this app.
- `HANDOFF.md` is the history of the original Check-In Scan app (decisions, troubleshooting). Read it for background; its addresses and owner refer to Check-In Scan, not this app.

## What this is
A web app for Android phones (Chrome 137+). It talks to a Veepeak Bluetooth OBD2 adapter (ELM327) and posts results to monday.com. Pushing to `main` publishes; phones pick up the new version next open.

## Files
- `obd.js` — scanner engine: transports (Web Serial classic BT, Web Bluetooth LE, demo truck), ELM327 commands, code parsing, idle/misfire, cranking test, freeze frame, Ford module codes (UDS 0x19), test-drive analysis, fix/parts/cost table (`FIXES`), parts links (`SHOPS`).
- `app.js` — screens, estimate builder, monday.com GraphQL calls.
- `index.html` — layout and styles. `sw.js` — offline cache (bump `CACHE` version when files change). `manifest.webmanifest` — home-screen install.

## monday.com
- Board: Inventory Recon (new) `18410463373`; subitems board `18410479838`.
- Columns: Stock # `text_mm2txesd`, Stage `color_mm2tny8k`, Location `color_mm2yxmdw`, Day-1 Estimate `numeric_mm8x1pk1`.
- Subitem columns: Status `color_mm2t1egg`, Notes `long_text_mm2t42xe`, Parts Needed `text_mm2tdxxp`.
- Stock # = last 6 of VIN. Over $1,000 notifies Jonathan (user `101601751`).
- Each user's API token is stored only on their phone (localStorage). Never commit tokens.

## Rules
- Read-only scanner: never send mode 04 (clear codes).
- Use the LCC Brand Kit (lcc-brand skill): Country Orange #FF8C00, black, white, #666666 small print; status green #2E7D32 / red #C62828 only for state. Fjalla One headings, Arial body. Rounded corners. Nebraska orange icon as favicon/app icon. Plain, specific wording.
- Parts: AutoZone Pro (button copies the VIN for Pro's VIN lookup), Advance, NAPA, Amazon.
- Process lives in the SOP "Recon Intake And The Day-1 Estimate" (Recon & Lot folder). Keep the app and SOP in step.
- Test with the demo truck before pushing; nothing posts to monday from the demo.

# LCC Acquisition Scan

Copied from Check-In Scan (littlecountrycars/lcc-check-in-scan) on Nov 9, 2026, with its own name, offline cache and address. It still behaves like Check-In Scan until it is changed.

Internal tool for Little Country Cars recon. Reads trucks through the Veepeak Bluetooth OBD2 scanner on an Android phone (Chrome 138+), checks battery, idle/misfires and a recorded test drive, builds the Day-1 estimate, and posts it all to the Inventory Recon board in monday.com.

- Read-only: it never clears codes.
- No keys or customer data live here. Each user's monday.com token is stored only on their own phone.
- Files: `index.html` (screens), `app.js` (screens + monday.com), `obd.js` (scanner engine), `sw.js` (offline), `manifest.webmanifest` (home-screen install).

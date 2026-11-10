# LCC Acquisition Scan

Live: https://littlecountrycars.github.io/lcc-aquisition-scan/

Copied from Check-In Scan (littlecountrycars/lcc-check-in-scan) on Nov 9, 2026, with its own name, offline cache and address.

Internal tool for Little Country Cars auction appraisals. Reads vehicles through the Veepeak Bluetooth OBD2 scanner on an Android phone (Chrome 137+), checks codes, battery, idle/misfires and a short lane drive, and builds an estimated recon cost to factor into the bid.

- Read-only: it never clears codes.
- Does not connect to monday.com. Appraisals are saved on the phone and shared by the user.
- Files: `index.html` (screens), `app.js` (screens, saved appraisals, share/PDF), `obd.js` (scanner engine), `sw.js` (offline), `manifest.webmanifest` (home-screen install).

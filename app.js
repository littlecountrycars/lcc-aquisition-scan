/* LCC Acquisition Scan (copied from Check-In Scan): screens for appraising vehicles at auction. No monday.com: results stay on the phone or get shared by the user. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const LEVEL_WORD = { good: 'Good to go', watch: 'Needs a look', problem: 'Needs work' };
  const LS = { settings: 'lccAcq.settings', hist: 'lccAcq.history', port: 'lccAcq.lastTransport' };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  let settings = Object.assign({ name: '', minProfit: 2500, fees: 0, keepDays: 1 }, store.get(LS.settings, {}));
  const SCOUT_URL = 'https://claude.ai/artifact/6bBGxC5drP42KJE9sGJYgZ';
  let elm = null, transport = null, current = null, busy = false;

  /* ---------- helpers ---------- */
  const show = (el, on = true) => el.classList.toggle('hidden', !on);
  const fmtMi = (n) => n == null ? '—' : Math.round(n).toLocaleString() + ' mi';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function setPill() {
    const p = $('connPill');
    p.className = 'pill' + (transport ? (transport.name === 'Demo' ? ' demo' : ' on') : '');
    p.textContent = transport ? (transport.name === 'Demo' ? 'Demo truck' : 'Connected') : 'Not connected';
    show($('disconnectBtn'), !!transport);
    show($('connectBtn'), !transport);
    $('scanBtn').disabled = !transport || busy;
    $('quickBtn').disabled = !transport || busy;
  }
  function err(box, msg) { box.textContent = msg; show(box, !!msg); }
  function renderFindings(ul, findings) {
    ul.textContent = '';
    for (const f of findings) {
      const li = document.createElement('li'); li.className = f.level;
      const d = document.createElement('div');
      const b = document.createElement('b'); b.textContent = f.title; d.appendChild(b);
      if (f.detail) { const s = document.createElement('span'); s.textContent = f.detail; d.appendChild(s); }
      if (f.code) d.appendChild(fixBlock(f.code));
      else if (f.moduleCode) d.appendChild(fixBlock(f.moduleCode, f.module));
      else if (f.parts && f.parts.length) d.appendChild(partsBlock(f.parts));
      li.appendChild(d); ul.appendChild(li);
    }
  }
  function vehicleQuery(rec) {
    const d = rec && rec.decoded; return d ? [d.year, titleCase(d.make), d.model].filter(Boolean).join(' ') : '';
  }
  function toast(msg) { const t = $('toast'); t.textContent = msg; show(t); clearTimeout(toast.t); toast.t = setTimeout(() => show(t, false), 3500); }
  function shopLink(l) {
    const a = document.createElement('a'); a.href = l.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = l.name;
    if (l.copy) a.addEventListener('click', () => { try { navigator.clipboard.writeText(l.copy); toast(/^[A-HJ-NPR-Z0-9]{17}$/.test(l.copy) ? 'VIN copied. Paste it into AutoZone Pro\u2019s VIN lookup, then search \u201c' + l.part + '\u201d.' : 'Copied \u201c' + l.copy + '\u201d. Paste it into the AutoZone Pro search.'); } catch (e) {} });
    return a;
  }
  function fixBlock(code, moduleName) {
    const fx = moduleName ? OBD.moduleFix(moduleName) : OBD.fixFor(code);
    const box = document.createElement('div'); box.className = 'fix';
    const p = document.createElement('p'); p.textContent = 'Likely fix: ' + fx.fix; box.appendChild(p);
    if (fx.tierWord) { const t = document.createElement('p'); t.className = 'tier t' + fx.tier.length; t.textContent = fx.tier + '  ' + fx.tierWord; box.appendChild(t); }
    for (const part of fx.parts) {
      const row = document.createElement('div'); row.className = 'parts';
      const n = document.createElement('span'); n.textContent = part; row.appendChild(n);
      for (const l of OBD.partLinks(part, vehicleQuery(current), current && current.vin)) row.appendChild(shopLink(l));
      box.appendChild(row);
    }
    return box;
  }
  function partsBlock(parts) {
    const box = document.createElement('div'); box.className = 'fix';
    for (const part of parts) {
      const row = document.createElement('div'); row.className = 'parts';
      const n = document.createElement('span'); n.textContent = part; row.appendChild(n);
      for (const l of OBD.partLinks(part, vehicleQuery(current), current && current.vin)) row.appendChild(shopLink(l));
      box.appendChild(row);
    }
    return box;
  }
  function partsHtml(parts, rec) {
    return '<br><i>Parts:</i> ' + parts.map((p) => esc(p) + ' (' + OBD.partLinks(p, vehicleQuery(rec), rec.vin).map((l) => '<a href="' + esc(l.url) + '">' + l.name + '</a>').join(' \u00b7 ') + ')').join('; ');
  }
  function makeOf(rec) {
    if (rec.decoded && rec.decoded.make) return rec.decoded.make;
    return /^(1F|2F|3F|NM0|MAJ|5LM|1LN|2LM|3LN)/.test(rec.vin || '') ? 'Ford' : '';
  }
  function codesOf(rec) { return rec.assessment.findings.filter((f) => f.code).map((f) => f.code); }
  function bigTicket(rec) {
    const c = codesOf(rec).filter((x) => OBD.fixFor(x).tier === '$$$');
    const idleBad = rec.idleAssessment && rec.idleAssessment.findings.some((f) => /Misfires on cylinder|Rough idle/.test(f.title) && f.level === 'problem');
    const total = estTotal(rec);
    return { codes: c, any: c.length > 0 || total > 1000, idleBad, total };
  }
  function renderVerdict(el, level, sub) {
    el.className = 'verdict ' + level;
    el.textContent = '';
    const k = document.createElement('span'); k.className = 'kpi'; k.textContent = LEVEL_WORD[level]; el.appendChild(k);
    if (sub) { const s = document.createElement('span'); s.textContent = sub; el.appendChild(s); }
  }

  /* ---------- connecting ---------- */
  function supportMsg() {
    const m = [];
    if (!('serial' in navigator) && !('bluetooth' in navigator)) {
      m.push('This browser can\u2019t reach Bluetooth scanners. Open this page in Chrome on an Android phone (Chrome 138 or newer). The demo truck still works here.');
    }
    return m.join(' ');
  }

  /* Connection log: every step and every scanner message, so a failed connect can be screenshotted */
  const clog = [];
  function connLog(msg) {
    const d = new Date();
    const ts = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    clog.push(ts + '  ' + msg); if (clog.length > 400) clog.shift();
    const el = $('connLog'); if (el) { el.textContent = clog.join('\n'); el.scrollTop = el.scrollHeight; }
  }
  function explain(e) {
    const n = (e && e.name) || '', m = (e && e.message) || '';
    if (m === 'NO_ADAPTER') return 'The phone opened a Bluetooth link but the Veepeak didn\u2019t reply. Force-stop Car Scanner (or any other scan app), unplug the Veepeak for 5 seconds, plug it back in, and connect again.';
    if (n === 'NetworkError' || /failed to open|connection|rfcomm|socket/i.test(m)) return 'Couldn\u2019t open a link to the Veepeak. Most often another app (Car Scanner, Torque) is still holding it: force-stop that app, unplug the Veepeak for 5 seconds, plug it back in, and try again. Also check the key is ON and the Veepeak light is on.';
    if (n === 'SecurityError') return 'Chrome isn\u2019t allowed to use Bluetooth. Android Settings \u2192 Apps \u2192 Chrome \u2192 Permissions \u2192 Nearby devices \u2192 Allow.';
    return m || 'Couldn\u2019t connect.';
  }

  async function connect(kind) {
    err($('connectErr'), '');
    let t;
    try {
      if (transport) await disconnect();
      connLog('--- Connect (' + kind + ') \u00b7 ' + navigator.userAgent.replace(/^.*?\(/, '(').slice(0, 140));
      if (kind === 'demo') { t = new OBD.DemoTransport(); OBD.DEMO_TRUCK.demoRunning = false; }
      else if (kind === 'ble') {
        if (!OBD.BleTransport.supported()) throw new Error('Bluetooth LE isn\u2019t available in this browser.');
        t = await OBD.BleTransport.pick();
      } else {
        if (!OBD.SerialTransport.supported()) {
          throw new Error(OBD.BleTransport.supported()
            ? 'This Chrome can\u2019t reach classic Bluetooth scanners yet. Update Chrome (138 or newer), or use a Bluetooth LE scanner.'
            : supportMsg());
        }
        if (kind !== 'choose') connLog('Previously picked scanners: ' + (await navigator.serial.getPorts()).length);
        t = kind === 'choose' ? await OBD.SerialTransport.choose() : await OBD.SerialTransport.pick();
        t.log = connLog;
        connLog('Scanner chosen: ' + t.info());
      }
      $('connectMsg').textContent = 'Connecting\u2026';
      await t.open();
      const e2 = new OBD.Elm(t); e2.onLog = connLog;
      if (kind !== 'demo') {
        $('connectMsg').textContent = 'Linked. Checking the Veepeak answers\u2026';
        const id = await e2.hello();
        connLog('Adapter answered: ' + id);
      }
      transport = t; elm = e2;
      if (t.port) t.port.addEventListener('disconnect', () => { connLog('Android reported the scanner disconnected'); lost(); });
      if (t.device) t.device.addEventListener('gattserverdisconnected', () => { connLog('Bluetooth LE scanner disconnected'); lost(); });
      store.set(LS.port, kind);
      connLog('Connected');
      $('connectMsg').textContent = kind === 'demo'
        ? 'Demo truck connected. Practice appraisals are marked (demo) in your history.'
        : 'Scanner connected. Enter the dash mileage and tap Scan truck.';
      setPill();
    } catch (e) {
      connLog('Failed: ' + ((e && e.name) || 'Error') + ': ' + ((e && e.message) || e));
      if (t && t.close && !transport) { try { await t.close(); } catch (x) {} }
      if (e && e.name === 'NotFoundError') { $('connectMsg').textContent = 'No scanner picked. If the Veepeak isn\u2019t in the list, pair it in Android Bluetooth settings first.'; return; }
      $('connectMsg').textContent = 'Plug the scanner in, turn the key to ON (or start the truck), then connect. If it keeps failing, tap Pick a different scanner and choose OBDII.';
      err($('connectErr'), explain(e));
      $('logBox').open = true;
    }
  }
  async function disconnect() {
    const t = transport; transport = null; elm = null; setPill();
    if (t) try { await t.close(); } catch (e) {}
    $('connectMsg').textContent = 'Disconnected.';
  }
  function lost() {
    if (!transport) return;
    transport = null; elm = null; setPill();
    $('connectMsg').textContent = 'Lost the scanner. Check it\u2019s still plugged in, then tap Connect.';
  }

  /* ---------- scan ---------- */
  function buildAssessment(r, miles) {
    const a = OBD.assess(r, miles);
    if (r.freeze) a.findings.forEach((f) => { if (f.code === r.freeze.code) f.detail += ' ' + OBD.describeFreeze(r.freeze); });
    if (r.modules) {
      a.findings.push(...OBD.assessModules(r.modules));
      const order = { problem: 0, watch: 1, good: 2, info: 3 };
      a.findings.sort((x, y) => order[x.level] - order[y.level]);
      a.overall = a.findings.some((f) => f.level === 'problem') ? 'problem' : a.findings.some((f) => f.level === 'watch') ? 'watch' : 'good';
    }
    return a;
  }
  const STEPS = ['Waking up the adapter', 'Finding the truck\u2019s computer', 'Checking what this truck reports', 'Reading the VIN',
    'Reading check engine light and monitors', 'Reading trouble codes', 'Reading battery and engine data'];
  let lastStep = 0;
  function progress(step) {
    let i = STEPS.indexOf(step); if (i < 0) i = Math.min(lastStep + 0.3, STEPS.length - 0.2); lastStep = i;
    $('scanStep').textContent = step + '\u2026';
    $('scanBar').style.width = Math.round(((i + 1) / (STEPS.length + 1)) * 100) + '%';
  }

  async function scan() {
    if (!elm || busy) return;
    busy = true; setPill(); err($('scanErr'), ''); show($('autoNote'), false);
    show($('scanProgress')); show($('callCard'), false); show($('resultCard'), false); show($('idleCard'), false); show($('sendCard'), false); show($('driveCard'), false);
    show($('idleResult'), false); show($('idleLive'), false);
    $('sendMsg').classList.add('hidden');
    try {
      if (transport.name === 'Demo') OBD.DEMO_TRUCK.demoRunning = false;
      await elm.init(progress);
      const r = await OBD.runScan(elm, progress);
      if ((r.stored || []).length || (r.status && r.status.mil)) { progress('Reading freeze frame'); r.freeze = await OBD.freezeFrame(elm); }
      if ($('doModules').checked) r.modules = await OBD.moduleScan(elm, makeOf({ vin: r.vin }), progress);
      $('scanBar').style.width = '100%'; $('scanStep').textContent = 'Done.';
      // Dash miles typed in win; otherwise use what the truck's computer reports
      const typed = +$('miles').value || null;
      const miles = typed || (r.odometerMi ? Math.round(r.odometerMi) : null);
      const a = buildAssessment(r, typed);
      current = {
        id: Date.now().toString(36), at: r.at, demo: transport.name === 'Demo', tech: settings.name || '',
        vin: r.vin, stock: $('stock').value.trim().toUpperCase(), miles,
        scan: r, assessment: a, idle: null, idleAssessment: null, decoded: null, sent: null
      };
      if (!typed && miles) $('miles').value = miles;
      current.milesSource = typed ? 'dash' : (miles ? 'truck' : null);
      $('autoNote').textContent = [
        r.vin ? 'VIN ' + r.vin + ' read from the vehicle.' : 'Couldn\u2019t read the VIN from this vehicle. Note it from the dash or door jamb.',
        typed ? '' : (miles ? 'Miles read from the truck\u2019s computer. Glance at the dash; if it\u2019s different, type the dash number.' : 'This truck doesn\u2019t report mileage. Type it from the dash.')
      ].join(' ');
      show($('autoNote'));
      renderScan();
      saveHist();
      decodeVin(current);
      show($('idleCard'));
      prepIdle();
      show($('driveCard')); show($('driveResult'), false); show($('driveLive'), false);
      show($('sendCard'));
      current.estimate = { lines: [], removed: [] };
      renderEstimate();
      $('notes').value = ''; $('salePrice').value = '';
      renderBid(); renderCall();
      return true;
    } catch (e) {
      const msg = e && e.message === 'NO_ECU'
        ? 'The scanner is connected but the truck didn\u2019t answer. Turn the key to ON or start the truck, wait 5 seconds, and tap Scan again.'
        : /timeout/.test((e && e.message) || '')
          ? 'The scanner stopped answering. Unplug it for 5 seconds, plug it back in, reconnect, and scan again.'
          : 'Scan stopped: ' + ((e && e.message) || 'unknown error');
      err($('scanErr'), msg);
    } finally {
      busy = false; setPill();
      setTimeout(() => show($('scanProgress'), false), 800);
    }
  }

  function renderScan() {
    const r = current.scan, a = current.assessment;
    const codes = (r.stored || []).length + (r.pending || []).length;
    renderVerdict($('verdict'), a.overall, codes ? codes + ' trouble code' + (codes > 1 ? 's' : '') + ' found' : 'No trouble codes stored');
    renderFindings($('findings'), a.findings);
    const dl = $('readings'); dl.textContent = '';
    const add = (k, v, wide) => { if (v == null || v === '') return; const d = document.createElement('div'); if (wide) d.className = 'wide';
      const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; d.append(dt, dd); dl.appendChild(d); };
    add('VIN', r.vin || 'Not readable', true);
    if (current.decoded) add('Vehicle', current.decoded.label, true);
    add('Lane / run #', current.stock || '—');
    add('Battery', r.voltage != null ? r.voltage.toFixed(1) + ' V' : null);
    add('Engine', r.engineRunning == null ? null : r.engineRunning ? 'Running, ' + Math.round(r.rpm) + ' RPM' : 'Off (key on)');
    add('Coolant', r.coolantF != null ? r.coolantF + '\u00b0F' : null);
    add('Since codes cleared', r.distSinceClearMi != null ? fmtMi(r.distSinceClearMi) + (r.warmupsSinceClear != null ? ', ' + r.warmupsSinceClear + ' warm-ups' : '') : null, true);
    add('Driven with light on', r.milDistanceMi ? fmtMi(r.milDistanceMi) : null);
    add('Computer odometer', r.odometerMi ? fmtMi(r.odometerMi) : null);
    add('Fuel level', r.fuelPct != null ? r.fuelPct + '%' : null);
    const mons = r.status ? r.status.monitors : [];
    show($('monWrap'), mons.length > 0);
    const mw = $('mons'); mw.textContent = '';
    mons.forEach((m) => { const s = document.createElement('span'); s.className = m.complete ? 'done' : 'not'; s.textContent = (m.complete ? '\u2713 ' : '\u2022 ') + m.name; mw.appendChild(s); });
    const extra = $('extraNotes'); extra.textContent = '';
    const bt = bigTicket(current);
    if (bt.any) {
      const n = document.createElement('div'); n.className = 'notice err';
      n.textContent = 'Likely over $1,000' + (bt.codes.length ? ' (' + bt.codes.join(', ') + ')' : '') + '. Factor it into your bid or pass.';
      extra.appendChild(n);
    }
    if (current.vin) {
      const n = document.createElement('div'); n.className = 'notice';
      const a = document.createElement('a'); a.href = 'https://www.nhtsa.gov/recalls?vin=' + current.vin; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Check this VIN for open recalls';
      const t = document.createElement('span');
      t.textContent = current.recalls ? current.recalls.count + ' recall' + (current.recalls.count === 1 ? '' : 's') + ' on file for this year/model. ' : '';
      n.append(t, a); extra.appendChild(n);
    }
    show($('resultCard'));
    $('resultCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function decodeVin(rec) {
    if (!rec.vin || rec.vin.length !== 17 || !navigator.onLine) return false;
    try {
      const res = await fetch('https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/' + rec.vin + '?format=json');
      const j = await res.json(); const v = j.Results && j.Results[0];
      if (!v || !v.ModelYear) return;
      const eng = [v.DisplacementL ? (+v.DisplacementL).toFixed(1) + 'L' : '', v.EngineCylinders ? 'V' + v.EngineCylinders : '', /diesel/i.test(v.FuelTypePrimary || '') ? 'diesel' : ''].filter(Boolean).join(' ');
      rec.decoded = { year: v.ModelYear, make: v.Make, model: v.Model, trim: v.Trim || v.Series || '', engine: eng, drive: v.DriveType || '',
        label: [v.ModelYear, titleCase(v.Make), v.Model, v.Trim].filter(Boolean).join(' ') + (eng ? ' \u00b7 ' + eng : '') };
      if (rec === current) { renderScan(); renderEstimate(); renderBid(); renderCall(); }
      updateHist(rec);
      try {
        const rr = await fetch('https://api.nhtsa.gov/recalls/recallsByVehicle?make=' + encodeURIComponent(v.Make) + '&model=' + encodeURIComponent(v.Model) + '&modelYear=' + v.ModelYear);
        const rj = await rr.json();
        rec.recalls = { count: (rj.results || rj.Results || []).length, items: (rj.results || rj.Results || []).slice(0, 8).map((x) => ({ id: x.NHTSACampaignNumber, part: x.Component })) };
        if (rec === current) renderScan();
        updateHist(rec);
      } catch (e) {}
    } catch (e) { /* offline or NHTSA down: fine */ }
  }
  const titleCase = (s) => (s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  /* ---------- idle check ---------- */
  async function runCrank() {
    if (!elm || busy || !current) return;
    busy = true; setPill(); $('crankBtn').disabled = true;
    show($('crankLive')); show($('crankFindings'), false);
    if (current.demo) { OBD.DEMO_TRUCK.demoRunning = false; OBD.DEMO_TRUCK.crankAt = Date.now(); }
    try {
      const r = await OBD.crankTest(elm, { seconds: 12, onSample: (v, frac) => {
        $('voltNow').textContent = v.toFixed(1); $('crankBar').style.width = Math.min(100, frac * 100) + '%';
        $('crankCue').textContent = frac < 0.45 ? 'Start the truck now' : 'Keep it running';
      } });
      const a = OBD.assessCrank(r);
      current.crank = r; current.crankAssessment = a;
      renderFindings($('crankFindings'), a.findings); show($('crankFindings'));
      current.scan.engineRunning = a.last > 13 || current.scan.engineRunning;
      prepIdle(); renderEstimate(); renderBid(); renderCall(); saveHist();
    } finally {
      if (current.demo) OBD.DEMO_TRUCK.crankAt = 0;
      busy = false; setPill(); $('crankBtn').disabled = false; $('crankCue').textContent = '';
    }
  }

  function prepIdle() {
    const running = current.scan.engineRunning;
    const demo = current.demo;
    show($('crankBox'), !current.crankAssessment ? !running : true);
    if (!current.crankAssessment) { show($('crankLive'), false); show($('crankFindings'), false); }
    $('idleIntro').textContent = running || demo
      ? 'Truck warmed up, in park, A/C and lights off. Takes 30 seconds; don\u2019t touch the gas.'
      : 'Start the engine and let it warm up, then run this. It watches the idle for 30 seconds and reads the engine\u2019s own misfire counters.';
    $('idleBtn').textContent = demo && !running ? 'Run idle check (demo starts the engine)' : 'Run 30-second idle check';
  }

  async function runIdle(seconds) {
    seconds = typeof seconds === 'number' ? seconds : 30;
    if (!elm || busy || !current) return;
    busy = true; setPill(); $('idleBtn').disabled = true;
    show($('idleLive')); show($('idleResult'), false);
    let wake = null; try { wake = await navigator.wakeLock.request('screen'); } catch (e) {}
    if (current.demo) OBD.DEMO_TRUCK.demoRunning = true;
    const pts = [];
    try {
      const r = await OBD.idleCheck(elm, {
        seconds, supported: current.scan.supported,
        onSample: (rpm, frac) => { pts.push(rpm); $('rpmNow').textContent = Math.round(rpm); $('idleBar').style.width = Math.min(100, frac * 100) + '%'; drawSpark(pts); }
      });
      $('idleBar').style.width = '100%';
      const a = OBD.assessIdle(r);
      current.idle = r; current.idleAssessment = a;
      renderVerdict($('idleVerdict'), a.overall, a.stats ? 'Average idle ' + a.stats.mean + ' RPM over ' + a.stats.samples + ' readings' : '');
      renderFindings($('idleFindings'), a.findings);
      show($('idleResult'));
      renderEstimate(); renderBid(); renderCall(); saveHist();
    } catch (e) {
      err($('scanErr'), 'Idle check stopped: ' + ((e && e.message) || 'unknown error'));
    } finally {
      if (wake) try { wake.release(); } catch (e) {}
      busy = false; setPill(); $('idleBtn').disabled = false;
    }
  }

  function drawSpark(pts) {
    const c = $('spark'), g = c.getContext('2d');
    const W = c.width, H = c.height, pad = 16;
    g.clearRect(0, 0, W, H);
    if (pts.length < 2) return;
    const lo = Math.min(...pts) - 20, hi = Math.max(...pts) + 20;
    const css = getComputedStyle(document.documentElement);
    g.strokeStyle = css.getPropertyValue('--muted').trim() || '#666'; g.lineWidth = 1; g.setLineDash([6, 6]);
    const mean = pts.reduce((a, b) => a + b, 0) / pts.length;
    const y = (v) => H - pad - ((v - lo) / (hi - lo || 1)) * (H - pad * 2);
    g.beginPath(); g.moveTo(0, y(mean)); g.lineTo(W, y(mean)); g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#FF8C00'; g.lineWidth = 4; g.lineJoin = 'round'; g.beginPath();
    pts.forEach((v, i) => { const x = (i / Math.max(pts.length - 1, 1)) * W; i ? g.lineTo(x, y(v)) : g.moveTo(x, y(v)); });
    g.stroke();
  }

  /* ---------- test drive ---------- */
  let driveAbort = null;
  async function startDrive() {
    if (!elm || busy || !current) return;
    busy = true; setPill(); show($('driveBtn'), false); show($('driveLive')); show($('driveResult'), false);
    let wake = null; try { wake = await navigator.wakeLock.request('screen'); } catch (e) {}
    if (current.demo) { OBD.DEMO_TRUCK.demoRunning = true; OBD.DEMO_TRUCK.driveAt = Date.now(); }
    driveAbort = new AbortController();
    const t0 = Date.now(); let miles = 0, last = null;
    try {
      const r = await OBD.driveLog(elm, { signal: driveAbort.signal, supported: current.scan.supported, onSample: (smp) => {
        if (smp.mph != null) $('mphNow').textContent = Math.round(smp.mph);
        if (smp.rpm != null) $('driveRpm').textContent = Math.round(smp.rpm);
        if (last && smp.mph != null && last.mph != null) miles += ((smp.mph + last.mph) / 2) * ((smp.t - last.t) / 3600000);
        if (smp.mph != null) last = smp;
        $('driveSoFar').textContent = Math.floor((Date.now() - t0) / 60000) + ' min \u00b7 ' + miles.toFixed(1) + ' mi';
      } });
      if (current.demo) OBD.DEMO_TRUCK.driveAt = 0;
      $('driveSoFar').textContent = 'Checking for new codes\u2026';
      const after = await OBD.afterDrive(elm);
      const a = OBD.assessDrive(r, { stored: current.scan.stored, pending: current.scan.pending }, after);
      current.drive = { start: r.start, end: r.end, stats: a.stats }; current.driveAssessment = a;
      renderVerdict($('driveVerdict'), a.overall, a.stats ? a.stats.minutes + ' min, ' + a.stats.miles + ' mi, top ' + a.stats.maxMph + ' mph' : '');
      renderFindings($('driveFindings'), a.findings); show($('driveResult'));
      renderEstimate(); renderBid(); renderCall(); saveHist();
    } catch (e) {
      err($('scanErr'), 'Test drive stopped: ' + ((e && e.message) || 'unknown error'));
    } finally {
      if (wake) try { wake.release(); } catch (e) {}
      busy = false; setPill(); show($('driveLive'), false); show($('driveBtn')); $('driveBtn').textContent = 'Record another lane drive';
    }
  }

  /* ---------- estimate ---------- */
  const mid = (r) => Math.round(((r[0] + r[1]) / 2) / 10) * 10;
  function suggestedLines(rec) {
    const L = []; const add = (id, label, range, sub) => { if (range && range[1] > 0 && !L.some((x) => x.id === id)) L.push({ id, label, sub: sub || '', range, amount: mid(range) }); };
    const a = rec.assessment;
    const codes = new Set();
    for (const f of a.findings) {
      if (f.code && f.level !== 'good') { const fx = OBD.fixFor(f.code); codes.add(f.code); add('code:' + f.code, f.code + ' ' + OBD.describeCode(f.code), fx.range, fx.parts.join(', ')); }
      if (f.moduleCode && f.level !== 'good') { const fx = OBD.moduleFix(f.module); add('mod:' + f.module + ':' + f.moduleCode, f.module + ' ' + f.moduleCode, fx.range, fx.parts.join(', ')); }
    }
    const misfireCode = [...codes].some((c) => /^P03/.test(c));
    if (rec.crankAssessment && rec.crankAssessment.findings.some((f) => /battery/i.test(f.title) && f.level !== 'good')) add('battery', 'Battery', [180, 300], 'battery');
    else if (a.findings.some((f) => /^Battery low/.test(f.title))) add('battery', 'Battery', [180, 300], 'battery');
    if (rec.idleAssessment) for (const f of rec.idleAssessment.findings) {
      if (f.level === 'good' || f.level === 'info') continue;
      if (/Misfire|Rough|unsteady/i.test(f.title) && !misfireCode) add('tuneup', 'Tune-up: plugs and coils', [250, 700], 'spark plugs, ignition coil');
      if (/lean/i.test(f.title) && !codes.has('P0171') && !codes.has('P0174')) add('vacuum', 'Vacuum leak / MAF cleaning', [50, 300]);
    }
    if (rec.driveAssessment) for (const f of rec.driveAssessment.findings) {
      if (f.level !== 'problem') continue;
      if (/flared/i.test(f.title)) add('trans', 'Transmission: shop diagnosis/repair', [300, 4500], 'get a transmission shop quote');
      if (/wavering/i.test(f.title)) add('tcc', 'Torque converter shudder', [300, 3000], 'fluid service first');
      if (/Ran hot/i.test(f.title)) add('cooling', 'Cooling system', [200, 800], 'thermostat, coolant');
      if (f.code && !codes.has(f.code)) { const fx = OBD.fixFor(f.code); add('code:' + f.code, f.code + ' ' + OBD.describeCode(f.code), fx.range, fx.parts.join(', ')); }
    }
    return L;
  }
  function renderEstimate() {
    if (!current) return;
    const est = current.estimate || (current.estimate = { lines: [], removed: [] });
    const keep = new Map(est.lines.map((l) => [l.id, l]));
    const lines = [];
    for (const l of suggestedLines(current)) { if (est.removed.includes(l.id)) continue; lines.push(keep.has(l.id) ? keep.get(l.id) : l); keep.delete(l.id); }
    for (const l of keep.values()) if (l.manual) lines.push(l);
    est.lines = lines;
    const ul = $('estLines'); ul.textContent = '';
    for (const l of lines) {
      const li = document.createElement('li');
      const lab = document.createElement('span'); lab.textContent = l.label;
      const sm = document.createElement('small'); sm.textContent = l.manual ? 'Added by hand' : 'Typical $' + l.range[0].toLocaleString() + '\u2013$' + l.range[1].toLocaleString() + (l.sub ? ' \u00b7 ' + l.sub : ''); lab.appendChild(sm);
      const inp = document.createElement('input'); inp.type = 'number'; inp.inputMode = 'numeric'; inp.value = l.amount; inp.setAttribute('aria-label', 'Amount for ' + l.label);
      inp.oninput = () => { l.amount = Math.max(0, +inp.value || 0); totals(); };
      inp.onchange = () => saveHist();
      const x = document.createElement('button'); x.textContent = '\u00d7'; x.setAttribute('aria-label', 'Remove ' + l.label);
      x.onclick = () => { if (!l.manual) est.removed.push(l.id); est.lines = est.lines.filter((y) => y !== l); renderEstimate(); saveHist(); };
      li.append(lab, inp, x); ul.appendChild(li);
    }
    totals();
  }
  function estTotal(rec) { return ((rec && rec.estimate && rec.estimate.lines) || []).reduce((s, l) => s + (+l.amount || 0), 0); }
  function totals() {
    const t = estTotal(current);
    $('estTotal').textContent = '$' + t.toLocaleString();
    const over = bigTicket(current).any;
    $('estWarn').textContent = over ? 'Over $1,000 in likely recon, or a big-ticket repair. Factor it into your bid or pass.' : '';
    show($('estWarn'), over);
    renderBid(); renderCall();
  }
  function addLine() {
    const d = $('estNewDesc').value.trim(), amt = +$('estNewAmt').value || 0;
    if (!d || !current) return;
    current.estimate.lines.push({ id: 'm' + Date.now(), label: d, amount: amt, manual: true, range: [0, 0] });
    $('estNewDesc').value = ''; $('estNewAmt').value = '';
    renderEstimate(); saveHist();
  }


  /* ---------- red flags, the call, max bid (auction) ---------- */
  const money = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString();
  function redFlags(rec) {
    const F = []; const add = (sev, title, detail) => F.push({ sev, title, detail: detail || '' });
    const s = rec.scan || {}, st = s.status;
    const recent = (s.distSinceClearMi != null && s.distSinceClearMi < 60) || (s.warmupsSinceClear != null && s.warmupsSinceClear < 5);
    const notReady = st ? st.monitors.filter((m) => !m.complete) : [];
    if (recent) add(notReady.length >= 2 ? 'hard' : 'soft', 'Codes cleared recently',
      [s.distSinceClearMi != null ? s.distSinceClearMi + ' mi' : '', s.warmupsSinceClear != null ? s.warmupsSinceClear + ' warm-ups' : ''].filter(Boolean).join(', ') + ' since the last reset. Problems may be hidden.');
    if (notReady.length >= 2) add('soft', notReady.length + ' self-tests not finished', notReady.map((m) => m.name).join(', '));
    const dash = rec.milesSource === 'dash' ? rec.miles : null;
    if (dash && s.odometerMi && Math.abs(s.odometerMi - dash) > 1000) add('hard', 'Odometer mismatch', 'Computer says ' + Math.round(s.odometerMi).toLocaleString() + ' mi, dash ' + (+dash).toLocaleString() + ' mi.');
    if (rec.vin && s.vinValid === false) add('soft', 'VIN doesn’t check out', 'Compare the computer VIN to the dash plate and door jamb.');
    if (st && st.mil) add('soft', 'Check engine light is on', '');
    const codes = [...new Set([...(s.stored || []), ...(s.pending || []), ...(s.permanent || [])])];
    const trans = codes.filter((c) => /^P0(7|8)/.test(c));
    if (trans.length) add('hard', 'Transmission code' + (trans.length > 1 ? 's' : ''), trans.join(', '));
    const mods = (s.modules && s.modules.modules) || [];
    mods.forEach((m) => {
      if (!m.codes.length) return;
      if (/Airbag/.test(m.name)) add('hard', 'Airbag fault', m.codes.map((c) => c.code).join(', ') + '. Must be fixed before sale.');
      else if (/Transmission/.test(m.name) && m.codes.some((c) => c.active)) add('hard', 'Transmission module fault', m.codes.map((c) => c.code).join(', '));
      else if (/ABS|steering|4x4/i.test(m.name) && m.codes.some((c) => c.active)) add('soft', m.name + ' fault', m.codes.map((c) => c.code).join(', '));
    });
    const big = codes.filter((c) => OBD.fixFor(c).tier === '$$$' && !/^P0(7|8)/.test(c));
    if (big.length) add('soft', 'Big-ticket code' + (big.length > 1 ? 's' : ''), big.map((c) => c + ' ' + OBD.describeCode(c)).join('; '));
    const ia = rec.idleAssessment;
    if (ia) ia.findings.forEach((f) => { if (f.level === 'problem' && /Misfire|Rough|lean|rich/i.test(f.title)) add('soft', f.title, ''); });
    const da = rec.driveAssessment;
    if (da) da.findings.forEach((f) => { if (f.level === 'problem') add(/flared|wavering/i.test(f.title) ? 'hard' : 'soft', f.title, ''); });
    if (rec.crankAssessment) rec.crankAssessment.findings.forEach((f) => { if (f.level === 'problem') add('soft', f.title, ''); });
    F.sort((a, b) => (a.sev === 'hard' ? 0 : 1) - (b.sev === 'hard' ? 0 : 1));
    return F;
  }
  function maxBid(rec) {
    const sale = +rec.salePrice || 0;
    if (!sale) return null;
    const recon = estTotal(rec), profit = +settings.minProfit || 0, fees = +settings.fees || 0;
    return { sale, recon, profit, fees, bid: sale - recon - profit - fees };
  }
  function theCall(rec) {
    const flags = redFlags(rec), hard = flags.filter((f) => f.sev === 'hard'), soft = flags.filter((f) => f.sev === 'soft');
    const mb = maxBid(rec), recon = estTotal(rec);
    let level = 'good', word = 'Bid', why = 'Nothing serious found.';
    if (hard.length) { level = 'problem'; word = 'Walk away'; why = hard.map((f) => f.title).join(', ') + '.'; }
    else if (mb && mb.bid <= 0) { level = 'problem'; word = 'Walk away'; why = 'Recon and profit eat the whole expected sale price.'; }
    else if (soft.length || recon > 1000) { level = 'watch'; word = 'Caution'; why = (soft.length ? soft.map((f) => f.title).join(', ') + '. ' : '') + (recon > 1000 ? 'About ' + money(recon) + ' in likely recon.' : ''); }
    const checked = ['scan'];
    if (rec.idleAssessment) checked.push('idle'); if (rec.driveAssessment) checked.push('lane drive'); if (rec.crankAssessment) checked.push('battery');
    return { level, word, why: why.trim(), flags, mb, checked };
  }
  function renderCall() {
    if (!current) return;
    const c = theCall(current); current.call = { word: c.word, level: c.level, bid: c.mb ? c.mb.bid : null };
    $('callCard').className = 'card callcard ' + c.level;
    const w = $('callWord'); w.className = 'word ' + c.level; w.textContent = c.word;
    $('callWho').textContent = [current.decoded ? current.decoded.label : (current.vin || ''), current.stock ? 'lane ' + current.stock : ''].filter(Boolean).join(' · ');
    $('callWhy').textContent = c.why + ' Checked: ' + c.checked.join(', ') + (c.checked.includes('lane drive') ? '.' : '. Lane drive not done yet.');
    const ul = $('flags'); ul.textContent = '';
    for (const f of c.flags) { const li = document.createElement('li'); li.className = f.sev; li.textContent = f.title; if (f.detail) { const sp = document.createElement('span'); sp.textContent = f.detail; li.appendChild(sp); } ul.appendChild(li); }
    show($('callBid'), !!c.mb);
    show($('scoutCallBtn'), !c.mb);
    if (c.mb) $('callBidAmt').textContent = c.mb.bid > 0 ? money(c.mb.bid) : 'None';
    show($('callCard'));
  }
  function renderBid() {
    if (!current) return;
    const el = $('bidMath'); el.textContent = '';
    const mb = maxBid(current);
    const row = (k, v, cls) => { const a = document.createElement('span'); a.textContent = k; const b = document.createElement('span'); b.textContent = v; if (cls) { a.className = cls; b.className = cls; } el.append(a, b); };
    if (!mb) { row('Enter the expected sale price to get a max bid.', ''); return; }
    row('Expected sale price', money(mb.sale));
    row('Estimated recon (this vehicle)', '− ' + money(mb.recon));
    row('Minimum profit', '− ' + money(mb.profit));
    if (mb.fees) row('Buyer fee + transport', '− ' + money(mb.fees));
    row('Max bid', mb.bid > 0 ? money(mb.bid) : 'None', 'tot');
  }
  let awaitingScout = false;
  function lookupScout() {
    if (current) { current.notes = $('notes').value.trim(); updateHist(current); }
    const vin = current && current.vin;
    if (vin) { try { navigator.clipboard.writeText(vin); } catch (e) {} }
    awaitingScout = !!current;
    show($('scoutHint'), !!current);
    window.open(SCOUT_URL, '_blank', 'noopener');
  }
  // Back from SCOUT: put the cursor where the number goes
  function backFromScout() {
    if (document.visibilityState !== 'visible' || !awaitingScout || !current) return;
    awaitingScout = false;
    show($('sendCard'));
    $('bidBox').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => { try { $('salePrice').focus(); } catch (e) {} }, 400);
    toast('Type SCOUT\u2019s expected sale price.');
  }
  // A link back from SCOUT can carry the number: ...#vin=1FT...&sale=24500
  function takeFromLink() {
    const q = new URLSearchParams((location.hash || '').replace(/^#/, '') || location.search.replace(/^\?/, ''));
    const sale = +String(q.get('sale') || '').replace(/[^0-9.]/g, '');
    if (!sale) return;
    const vin = String(q.get('vin') || '').toUpperCase();
    let rec = current && (!vin || current.vin === vin) ? current : null;
    if (!rec) rec = store.get(LS.hist, []).find((r) => !vin || r.vin === vin) || null;
    history.replaceState(null, '', location.pathname);
    if (!rec) { toast('Got a sale price from SCOUT, but no matching appraisal on this phone.'); return; }
    rec.salePrice = sale;
    if (rec !== current) { current = rec; }
    updateHist(rec);
    if (current && current.scan) { $('salePrice').value = sale; renderBid(); renderCall(); show($('callCard')); }
    toast('Expected sale price ' + money(sale) + ' from SCOUT.');
  }

  /* ---------- quick appraisal and next vehicle ---------- */
  async function quick() {
    if (!elm || busy) return;
    $('doModules').checked = true;
    const ok = await scan();
    if (!ok || !current) return;
    if (current.scan.engineRunning || current.demo) {
      $('idleCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
      await runIdle(15);
    }
    renderCall();
    $('callCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function nextVehicle() {
    if (busy) return;
    if (current) { current.notes = $('notes').value.trim(); current.salePrice = +$('salePrice').value || null; saveHist(current); }
    const lane = $('stock').value.trim();
    current = null;
    ['callCard', 'resultCard', 'idleCard', 'driveCard', 'sendCard', 'autoNote', 'idleResult', 'idleLive', 'driveResult', 'driveLive', 'crankLive', 'crankFindings'].forEach((id) => { const e = $(id); if (e) show(e, false); });
    show($('driveBtn')); $('driveBtn').textContent = 'Start lane drive';
    $('miles').value = ''; $('notes').value = ''; $('salePrice').value = ''; $('sendMsg').classList.add('hidden'); show($('scoutHint'), false); awaitingScout = false;
    $('stock').value = /^\d+$/.test(lane) ? String(+lane + 1) : '';
    err($('scanErr'), '');
    if (transport && transport.name === 'Demo') { OBD.DEMO_TRUCK.demoRunning = false; OBD.DEMO_TRUCK.driveAt = 0; }
    $('vehicleCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast(transport ? 'Ready. Move the scanner to the next vehicle and tap Quick appraisal.' : 'Ready for the next vehicle.');
  }

  /* ---------- lookups that waited for signal ---------- */
  let retrying = false;
  async function retryPending() {
    if (retrying || !navigator.onLine) return;
    retrying = true;
    try {
      const h = store.get(LS.hist, []);
      for (const rec of h) {
        if (rec.vin && rec.vin.length === 17 && (!rec.decoded || !rec.recalls)) {
          const live = current && current.id === rec.id ? current : rec;
          await decodeVin(live);
        }
      }
    } finally { retrying = false; renderHist(); }
  }

  /* ---------- report (Save PDF / Share) ---------- */
  function reportLines(rec) {
    const L = [];
    const a = rec.assessment, s = rec.scan;
    const call = theCall(rec);
    L.push('<b>' + esc(call.word.toUpperCase()) + '</b>' + (call.mb ? ' \u00b7 Max bid ' + esc(call.mb.bid > 0 ? money(call.mb.bid) : 'none') : '') + (rec.stock ? ' \u00b7 Lane/run ' + esc(rec.stock) : ''));
    if (call.flags.length) L.push('<b>Red flags:</b><ul>' + call.flags.map((f) => '<li>' + esc(f.title) + (f.detail ? ' \u2014 ' + esc(f.detail) : '') + '</li>').join('') + '</ul>');
    if (call.mb) L.push('Max bid math: sale ' + money(call.mb.sale) + ' \u2212 recon ' + money(call.mb.recon) + ' \u2212 profit ' + money(call.mb.profit) + (call.mb.fees ? ' \u2212 fees/transport ' + money(call.mb.fees) : '') + ' = ' + (call.mb.bid > 0 ? money(call.mb.bid) : 'none'));
    L.push('<b>Scan health: ' + esc(LEVEL_WORD[a.overall]) + '</b>');
    L.push(esc(new Date(rec.at).toLocaleString()) + (rec.tech ? ' \u00b7 ' + esc(rec.tech) : ''));
    const info = [];
    if (rec.vin) info.push('VIN ' + esc(rec.vin));
    if (rec.decoded) info.push(esc(rec.decoded.label));
    if (rec.miles) info.push((rec.milesSource === 'truck' ? 'Truck computer ' : 'Dash ') + (+rec.miles).toLocaleString() + ' mi');
    if (info.length) L.push(info.join(' \u00b7 '));
    const tag = { problem: 'PROBLEM', watch: 'WATCH', good: 'OK', info: 'NOTE' };
    const bt = bigTicket(rec);
    if (bt.any) L.push('<b>LIKELY OVER $1,000 IN RECON' + (bt.codes.length ? ' (' + esc(bt.codes.join(', ')) + ')' : '') + '. Factor into bid or pass.</b>');
    L.push('<ul>' + a.findings.map((f) => '<li><b>' + tag[f.level] + ':</b> ' + esc(f.title) + (f.detail ? ' \u2014 ' + esc(f.detail) : '') + (f.code ? fixHtml(f.code, rec) : f.moduleCode ? fixHtml(f.moduleCode, rec, f.module) : '') + '</li>').join('') + '</ul>');
    if (rec.crankAssessment) L.push('<b>Cranking test:</b><ul>' + rec.crankAssessment.findings.map((f) => '<li>' + tag[f.level] + ': ' + esc(f.title) + (f.parts ? partsHtml(f.parts, rec) : '') + '</li>').join('') + '</ul>');
    if (rec.driveAssessment) {
      const da = rec.driveAssessment;
      L.push('<b>Lane drive: ' + esc(LEVEL_WORD[da.overall]) + '</b>' + (da.stats ? ' (' + da.stats.minutes + ' min, ' + da.stats.miles + ' mi, top ' + da.stats.maxMph + ' mph)' : ''));
      L.push('<ul>' + da.findings.map((f) => '<li><b>' + tag[f.level] + ':</b> ' + esc(f.title) + (f.detail ? ' \u2014 ' + esc(f.detail) : '') + (f.code ? fixHtml(f.code, rec) : f.parts ? partsHtml(f.parts, rec) : '') + '</li>').join('') + '</ul>');
    } else L.push('Lane drive not recorded.');
    if (rec.estimate && rec.estimate.lines.length) {
      L.push('<b>Estimated recon: $' + estTotal(rec).toLocaleString() + '</b><ul>' + rec.estimate.lines.map((l) => '<li>' + esc(l.label) + ': $' + (+l.amount || 0).toLocaleString() + '</li>').join('') + '</ul>');
    }
    if (rec.idleAssessment) {
      const ia = rec.idleAssessment;
      L.push('<b>Idle &amp; misfire check: ' + esc(LEVEL_WORD[ia.overall]) + '</b>' + (ia.stats ? ' (avg ' + ia.stats.mean + ' RPM, range ' + ia.stats.min + '\u2013' + ia.stats.max + ')' : ''));
      L.push('<ul>' + ia.findings.map((f) => '<li><b>' + tag[f.level] + ':</b> ' + esc(f.title) + (f.detail ? ' \u2014 ' + esc(f.detail) : '') + (f.parts ? partsHtml(f.parts, rec) : '') + '</li>').join('') + '</ul>');
      if (rec.idle && rec.idle.misfires) L.push('Misfire counters by cylinder: ' + rec.idle.misfires.map((m) => m.cyl + ': ' + Math.max(m.avg10 || 0, m.lastTrip || 0)).join(', '));
    } else L.push('Idle check not run.');
    const extra = [];
    if (s.distSinceClearMi != null) extra.push('Since codes cleared: ' + s.distSinceClearMi + ' mi' + (s.warmupsSinceClear != null ? ', ' + s.warmupsSinceClear + ' warm-ups' : ''));
    if (s.status && s.status.monitors.length) extra.push('Self-tests not finished: ' + (s.status.monitors.filter((m) => !m.complete).map((m) => m.name).join(', ') || 'none'));
    if (rec.recalls) extra.push(rec.recalls.count + ' recall(s) on file for this year/model');
    if (extra.length) L.push(extra.map(esc).join('<br>'));
    if (rec.vin) L.push('<a href="https://www.nhtsa.gov/recalls?vin=' + esc(rec.vin) + '">Check this VIN for open recalls</a>');
    if (rec.notes) L.push('<b>Notes:</b> ' + esc(rec.notes).replace(/\n/g, '<br>'));
    L.push('<i>Read-only scan from the Acquisition Scan app; no codes were cleared.</i>');
    return L.join('<br>');
  }

  function fixHtml(code, rec, moduleName) {
    const fx = moduleName ? OBD.moduleFix(moduleName) : OBD.fixFor(code);
    let h = '<br><i>Likely fix:</i> ' + esc(fx.fix);
    if (fx.tierWord) h += '<br><i>Cost:</i> ' + esc(fx.tier + ' ' + fx.tierWord);
    if (fx.parts.length) h += '<br><i>Parts:</i> ' + fx.parts.map((p) => esc(p) + ' (' + OBD.partLinks(p, vehicleQuery(rec), rec.vin).map((l) => '<a href="' + esc(l.url) + '">' + l.name + '</a>').join(' \u00b7 ') + ')').join('; ');
    return h;
  }
  function shareText(rec) {
    const html = reportLines(rec).replace(/<br\s*\/?>(?!<ul>)/g, '\n').replace(/<li>/g, '\n\u2022 ').replace(/<\/(ul|li)>/g, '');
    const t = document.createElement('div'); t.innerHTML = html.replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g, '$2 ($1)');
    return t.textContent.replace(/\n{3,}/g, '\n\n').trim();
  }
  async function share(rec) {
    rec = rec || current; if (!rec) return;
    if (rec === current) { rec.notes = $('notes').value.trim(); rec.salePrice = +$('salePrice').value || null; }
    saveHist(rec);
    const title = 'Appraisal: ' + ((rec.decoded && rec.decoded.label) || rec.vin || 'vehicle') + (rec.stock ? ' (lane ' + rec.stock + ')' : '');
    const text = title + '\n\n' + shareText(rec);
    const msg = $('sendMsg');
    try {
      if (navigator.share) { await navigator.share({ title, text }); return; }
      await navigator.clipboard.writeText(text);
      msg.className = 'notice ok'; msg.textContent = 'Summary copied. Paste it into a text or email.'; show(msg);
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      msg.className = 'notice err'; msg.textContent = 'Couldn\u2019t share. Use Save PDF instead.'; show(msg);
    }
  }

  /* ---------- history ---------- */
  function saveHist(rec) {
    rec = rec || current; if (!rec) return;
    const h = store.get(LS.hist, []).filter((x) => x.id !== rec.id);
    h.unshift(rec);
    store.set(LS.hist, keepRecent(h));
    renderHist();
  }
  // Appraisals are held on the phone for the auction day (or a week), then cleared automatically
  function keepRecent(h) {
    const cutoff = Date.now() - (+settings.keepDays || 1) * 86400000;
    return h.filter((r) => new Date(r.at).getTime() >= cutoff || (current && r.id === current.id)).slice(0, 300);
  }
  function purgeOld() {
    const h = store.get(LS.hist, []); const k = keepRecent(h);
    if (k.length !== h.length) store.set(LS.hist, k);
  }
  function updateHist(rec) {
    if (!rec) return;
    const h = store.get(LS.hist, []); const i = h.findIndex((x) => x.id === rec.id);
    if (i >= 0) { h[i] = rec; store.set(LS.hist, h); renderHist(); } else saveHist(rec);
  }
  function renderHist() {
    const h = store.get(LS.hist, []);
    const kn = $('keepNote'); if (kn) kn.textContent = 'Kept on this phone for ' + ((+settings.keepDays || 1) === 7 ? '7 days' : '1 day') + ', then cleared automatically. Change it in Settings.';
    show($('histCard'), h.length > 0);
    const ul = $('hist'); ul.textContent = '';
    for (const rec of h.slice(0, 60)) {
      const li = document.createElement('li');
      const left = document.createElement('span');
      const dot = document.createElement('i'); dot.className = 'dot ' + ((rec.call && rec.call.level) || rec.assessment.overall);
      left.appendChild(dot);
      const label = (rec.decoded && rec.decoded.label) || rec.vin || 'No VIN';
      const est = rec.call ? ' \u00b7 ' + rec.call.word + (rec.call.bid != null ? ' \u00b7 max ' + (rec.call.bid > 0 ? money(rec.call.bid) : 'none') : '') : (rec.estimate && rec.estimate.lines && rec.estimate.lines.length ? ' \u00b7 recon ~$' + estTotal(rec).toLocaleString() : '');
      const pend = rec.vin && !rec.decoded && !rec.demo ? ' \u00b7 lookup waiting for signal' : '';
      left.appendChild(document.createTextNode(label + (rec.stock ? ' \u00b7 lane ' + rec.stock : '') + est + ' \u00b7 ' + new Date(rec.at).toLocaleDateString() + (rec.demo ? ' (demo)' : '') + pend));
      li.appendChild(left);
      const b = document.createElement('button'); b.className = 'btn'; b.style.minHeight = '40px'; b.textContent = 'Share'; b.onclick = () => share(rec); li.appendChild(b);
      ul.appendChild(li);
    }
  }

  /* ---------- settings ---------- */
  function openSettings() {
    $('techName').value = settings.name; $('minProfit').value = settings.minProfit; $('feesTransport').value = settings.fees || ''; $('keepDays').value = String(settings.keepDays || 1);
    $('settings').showModal();
  }
  function saveSettings() {
    settings = { name: $('techName').value.trim(), minProfit: $('minProfit').value === '' ? 2500 : +$('minProfit').value, fees: +$('feesTransport').value || 0, keepDays: +$('keepDays').value || 1 };
    purgeOld(); renderHist();
    store.set(LS.settings, settings);
    if (current) { renderBid(); renderCall(); }
    updateSetup();
  }
  function updateSetup() {
    show($('setupCard'), store.get(LS.port, null) == null);
  }

  /* ---------- wire up ---------- */
  $('connectBtn').onclick = () => connect('serial');
  $('otherBtn').onclick = () => connect('choose');
  $('bleBtn').onclick = () => connect('ble');
  $('demoBtn').onclick = () => connect('demo');
  $('logCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(clog.join('\n')); $('logCopy').textContent = 'Copied'; }
    catch (e) { $('logCopy').textContent = 'Select the text to copy'; }
    setTimeout(() => { $('logCopy').textContent = 'Copy log'; }, 2000);
  };
  $('logClear').onclick = () => { clog.length = 0; $('connLog').textContent = ''; };
  $('disconnectBtn').onclick = disconnect;
  $('scanBtn').onclick = scan;
  $('quickBtn').onclick = quick;
  $('nextBtn').onclick = nextVehicle; $('nextTop').onclick = nextVehicle;
  $('scoutBtn').onclick = lookupScout;
  $('scoutCallBtn').onclick = lookupScout;
  document.addEventListener('visibilitychange', backFromScout);
  window.addEventListener('hashchange', takeFromLink);
  $('salePrice').addEventListener('input', () => { if (current) { current.salePrice = +$('salePrice').value || null; renderBid(); renderCall(); } });
  $('salePrice').addEventListener('change', () => { if (current) updateHist(current); });
  window.addEventListener('online', retryPending);
  setInterval(retryPending, 60000);
  $('idleBtn').onclick = () => runIdle(30);
  $('crankBtn').onclick = runCrank;
  $('driveBtn').onclick = startDrive;
  $('driveEnd').onclick = () => { if (driveAbort) driveAbort.abort(); };
  $('estAdd').onclick = addLine;
  $('shareBtn').onclick = () => share(current);
  $('printBtn').onclick = () => { if (current) { current.notes = $('notes').value.trim(); saveHist(current); } window.print(); };
  $('miles').addEventListener('change', () => { if (current) { current.miles = +$('miles').value || null; current.milesSource = 'dash'; renderScan(); renderCall(); updateHist(current); } });
  $('stock').addEventListener('change', () => { if (current) { current.stock = $('stock').value.trim().toUpperCase(); $('stock').value = current.stock; saveHist(); } });
  $('settingsBtn').onclick = openSettings;
  $('settings').addEventListener('close', saveSettings);
  $('clearHist').onclick = () => { if (confirm('Delete the appraisals saved on this phone now?')) { store.set(LS.hist, []); renderHist(); } };

  const sm = supportMsg(); if (sm) err($('connectErr'), sm);
  if ('serial' in navigator && !('bluetooth' in navigator)) show($('bleBtn'), false);
  if (!('bluetooth' in navigator)) show($('bleBtn'), false);
  purgeOld(); setPill(); updateSetup(); renderHist(); takeFromLink(); setTimeout(retryPending, 3000);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
})();

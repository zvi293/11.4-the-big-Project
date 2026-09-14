// Zstore AI "One Ribbon" — merciless phone QA.
// Usage: node tests/mobile-check.cjs [--url http://localhost:5190/] [--out tests/qa] [--jobs 4] [--only views,stacked,links,form,anchors,deeplink,legal,filter,edge,reduced,nogl,rename,frames,safearea,overlap]
//                              [--views 390x844,320x568]
// Viewports: 320, 360, 375, 390, 414, 768 portrait and 844x390 landscape (isMobile + hasTouch), plus 1440 desktop.
// Prints PASS / FAIL / WARN / INFO lines, writes qa/mobile-check-report.json and screenshots into qa/.
// Exit code: 1 when any FAIL is recorded, 2 on a crash. WARN and INFO never fail the run.
// Needs Playwright (not a dependency of the site):  npm i --no-save playwright
// Uses Google Chrome when found (real GPU, so WebGL runs; set CHROME_PATH to point at it), otherwise Playwright's Chromium
// (then also run: npx playwright install chromium). Start the site first: npm start. The --url must end with "/".
'use strict';
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.error('This test needs Playwright. In the package folder run:  npm i --no-save playwright');
  process.exit(2);
}
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i < 0 ? d : args[i + 1]; };
const URL_ = opt('url', 'http://localhost:5190/');
const ORIGIN = new URL(URL_).origin;
const ONLY = opt('only', '') ? new Set(opt('only').split(',')) : null;
const want = (k) => !ONLY || ONLY.has(k);
const OUT = path.resolve(opt('out', path.join(__dirname, 'qa')));
fs.mkdirSync(OUT, { recursive: true });
const EMAIL = 'zstore.ai295@gmail.com';
const WA_TEXT = "Hi Zvi! I came across Zstore AI and I'd love to talk about a project I have in mind.";
const STUDIES = { atelier: 'Atelier Studio', lume: 'Lume', meridian: 'Meridian' };

const CHROME = process.env.CHROME_PATH || [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean).map((d) => path.join(d, 'Google', 'Chrome', 'Application', 'chrome.exe')).concat([
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome']).find((f) => fs.existsSync(f));
const LAUNCH = {
  ...(CHROME ? { executablePath: CHROME } : {}), headless: false,
  args: ['--window-position=-2600,-2600', '--disable-features=CalculateNativeWinOcclusion', '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--ignore-gpu-blocklist'],
};
const ALL_VIEWS = [
  { id: '320x568', w: 320, h: 568, touch: true },
  { id: '360x780', w: 360, h: 780, touch: true },
  { id: '375x812', w: 375, h: 812, touch: true },
  { id: '390x844', w: 390, h: 844, touch: true },
  { id: '414x896', w: 414, h: 896, touch: true },
  { id: '768x1024', w: 768, h: 1024, touch: true },
  { id: '844x390', w: 844, h: 390, touch: true },
  { id: '1440x900', w: 1440, h: 900, touch: false },
];
const VIEWS = opt('views', '') ? ALL_VIEWS.filter((v) => opt('views').split(',').includes(v.id)) : ALL_VIEWS;
// The per-viewport suites take ~3 min each, so by default they run in parallel child processes (--jobs 1 = sequential).
const CHILD = args.includes('--child');
const JOBS = Math.max(1, Number(opt('jobs', '4')));

/* ------------------------------------------------------------------ reporting */
const results = [];
const rec = (g, n, s, info = '') => { results.push({ g, n, s, info: String(info) }); console.log(`${s.padEnd(4)}  [${g}] ${n}${info !== '' ? '  — ' + info : ''}`); };
const check = (g, n, ok, info) => rec(g, n, ok ? 'PASS' : 'FAIL', info);
const warn = (g, n, info) => rec(g, n, 'WARN', info);
const note = (g, n, info) => rec(g, n, 'INFO', info);
const J = (v) => JSON.stringify(v);
const r1 = (x) => Math.round(x * 10) / 10;

/* ------------------------------------------------------------------ page helpers */
function instrument() {
  window.__draws = [];
  window.__long = [];
  const P = window.WebGL2RenderingContext && WebGL2RenderingContext.prototype;
  if (P) {
    const d = P.drawElements;
    P.drawElements = function (...a) { const arr = window.__draws; arr.push(performance.now()); if (arr.length > 6000) arr.splice(0, 3000); return d.apply(this, a); };
  }
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
}
function noWebGL() {
  const orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { if (/webgl/i.test(String(type))) return null; return orig.call(this, type, ...rest); };
}

async function openPage(browser, v, extra = {}) {
  const ctx = await browser.newContext({
    viewport: { width: v.w, height: v.h }, deviceScaleFactor: extra.dsf || (v.touch ? 2 : 1),
    isMobile: v.touch, hasTouch: v.touch, reducedMotion: extra.reduced ? 'reduce' : 'no-preference',
  });
  await ctx.addInitScript(instrument);
  if (extra.nogl) await ctx.addInitScript(noWebGL);
  const page = await ctx.newPage();
  const log = { errors: [], posts: [], failed: [] };
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') log.errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => log.errors.push('pageerror: ' + e.message));
  page.on('request', (r) => { if (r.method() !== 'GET' || /script\.google/.test(r.url())) log.posts.push(`${r.method()} ${r.url()}`); });
  page.on('requestfailed', (r) => { if (!/wa\.me|zstore-ai\.co\.il/.test(r.url())) log.failed.push(`${r.url()} ${(r.failure() || {}).errorText || ''}`); });
  page.on('response', (r) => { if (r.status() >= 400) log.failed.push(`${r.status()} ${r.url()}`); });
  await page.goto('about:blank');
  await page.goto(extra.url || URL_, { waitUntil: 'load' });
  await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => 0) : 0));
  await page.waitForTimeout(extra.wait || 1600);
  await page.evaluate(() => { window.__doc = Math.random().toString(36).slice(2); });
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, log, cdp, v };
}

const tapL = (env, loc) => (env.v.touch ? loc.tap({ timeout: 5000 }) : loc.click({ timeout: 5000 }));
const tap = (env, sel) => tapL(env, env.page.locator(sel).first());
const scrollToY = async (page, y) => { await page.evaluate((yy) => window.scrollTo({ top: yy, left: 0, behavior: 'instant' }), y); await page.waitForTimeout(260); };
const back = async (page) => { await page.goBack({ timeout: 4000 }).catch(() => null); await page.waitForTimeout(650); };
async function waitScrollEnd(page, max = 6000) {
  await page.waitForTimeout(450);
  const t0 = Date.now(); let last = -1, same = 0;
  while (Date.now() - t0 < max) {
    const y = await page.evaluate(() => scrollY);
    if (Math.abs(y - last) < 0.5) { if (++same >= 5) break; } else same = 0;
    last = y; await page.waitForTimeout(70);
  }
}
async function swipe(cdp, x, y0, y1, steps = 12) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / steps }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const state = (page) => page.evaluate(() => {
  const m = document.getElementById('menu'), p = document.getElementById('project');
  const open = [m, p].filter((d) => d && d.open);
  const sc = document.querySelector('dialog[open] .sheet-scroll');
  const ae = document.activeElement;
  return {
    menu: !!(m && m.open), project: !!(p && p.open), openCount: open.length,
    y: scrollY, mainTop: document.querySelector('main').getBoundingClientRect().top,
    navTop: document.querySelector('.nav-pill').getBoundingClientRect().top,
    len: history.length, depth: (history.state && history.state.zsPopup) || 0,
    // history.length does not grow when a pushState replaces a forward entry, so entry indices come from the Navigation API
    idx: window.navigation ? navigation.currentEntry.index : -1, entries: window.navigation ? navigation.entries().length : -1,
    doc: window.__doc, url: location.href,
    locked: document.documentElement.classList.contains('is-locked'), bodyPos: document.body.style.position,
    focusOk: !!window.__qaOpener && ae === window.__qaOpener,
    active: ae ? `${ae.tagName.toLowerCase()}${ae.id ? '#' + ae.id : ''}.${String(ae.className || '').split(' ')[0]}` : 'none',
    sheetScroll: sc ? { top: sc.scrollTop, max: sc.scrollHeight - sc.clientHeight } : null,
    // element geometry, not clientWidth: with overflow:hidden + scrollbar-gutter:stable Chrome reports the gutter inside clientWidth
    docW: (() => { const m = document.querySelector('main').getBoundingClientRect(), n = document.querySelector('.nav-pill').getBoundingClientRect(); return `${Math.round(m.left * 10) / 10}/${Math.round(m.width * 10) / 10}/${Math.round(n.left * 10) / 10}/${Math.round(n.right * 10) / 10}`; })(),
    glLive: document.documentElement.classList.contains('gl-live'),
    motion: !document.documentElement.classList.contains('motion-off'),
    glVisible: [...document.querySelectorAll('[data-gl]')].some((el) => { const r = el.getBoundingClientRect(); return r.bottom > -80 && r.top < innerHeight + 80; }),
  };
});
const drawsBetween = async (page, ms) => {
  const t0 = await page.evaluate(() => performance.now());
  await page.waitForTimeout(ms);
  return page.evaluate((t) => window.__draws.filter((x) => x > t).length, t0);
};

/* ------------------------------------------------------------------ in-page audits */
function auditLayout() {
  const r1 = (x) => Math.round(x * 10) / 10;
  const vw = document.documentElement.clientWidth;
  const openDlg = document.querySelector('dialog[open]');
  const desc = (el) => {
    const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const txt = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32);
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls}${txt ? ` "${txt}"` : ''}`;
  };
  const shown = (el) => {
    if (el.closest('dialog:not([open])') || el.closest('.sr-only, .sprite, .hp')) return false;
    if (openDlg && !openDlg.contains(el)) return false;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
    for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
      const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (cs.overflow === 'hidden' && p.getBoundingClientRect().width <= 1) return false; // visually-hidden (sr-only style) block
    }
    return true;
  };
  const out = { vw, innerW: innerWidth, scrollW: document.documentElement.scrollWidth, wide: [], spill: [], small: [], inlineSmall: [], inputs: [], tiny: [],
    cursor: getComputedStyle(document.querySelector('.cursor')).display, hoverNone: matchMedia('(hover: none)').matches, coarse: matchMedia('(pointer: coarse)').matches };
  document.querySelectorAll('body *').forEach((el) => {
    if (el.id === 'stage' || el.closest('.sprite, .hp, .skip, .cursor, .sr-only, dialog:not([open])')) return;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    if (r.right <= vw + 0.5 && r.left >= -0.5) return;
    let clipped = false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible') { const pr = p.getBoundingClientRect(); if (pr.right <= vw + 0.5 && pr.left >= -0.5) { clipped = true; break; } }
    }
    if (!clipped) out.wide.push(`${desc(el)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
  });
  document.querySelectorAll('button, a, .btn, .chip, .tags li, h1, h2, h3, .reach-v, summary, label, legend, .step-name, .menu-links a, .project-title, .stage-title').forEach((el) => {
    if (!shown(el) || el.closest('.study-link')) return;
    const cs = getComputedStyle(el); if (cs.display === 'inline' || cs.overflowX !== 'visible') return;
    if (el.scrollWidth > el.clientWidth + 2) out.spill.push(`${desc(el)} content ${el.scrollWidth}px in ${el.clientWidth}px box`);
  });
  document.querySelectorAll('a[href], button, input:not([type=hidden]), textarea, select, summary, [role=tab]').forEach((el) => {
    if (el.classList.contains('skip') || !shown(el)) return;
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    const inline = cs.display === 'inline' && el.closest('p, li, span');
    // 0.01px tolerance: a 44px box mid-transform can report 43.9997
    if (r.width < 43.99 || r.height < 43.99) (inline ? out.inlineSmall : out.small).push(`${desc(el)} ${r1(r.width)}x${r1(r.height)}`);
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && parseFloat(cs.fontSize) < 16) out.inputs.push(`${desc(el)} ${cs.fontSize}`);
  });
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement; if (!el || seen.has(el) || !shown(el)) continue;
    seen.add(el);
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12) out.tiny.push(`${desc(el)} ${fs}px${el.closest('.study-media, .project-visual') ? ' (concept art)' : ''}`);
  }
  out.wide = [...new Set(out.wide)].slice(0, 10); out.spill = [...new Set(out.spill)].slice(0, 10);
  out.small = [...new Set(out.small)]; out.inlineSmall = [...new Set(out.inlineSmall)]; out.tiny = [...new Set(out.tiny)];
  return out;
}

/* boxes of real UI (not art, not GL anchors) that cross the section's side padding */
function auditGutter() {
  const out = new Set();
  document.querySelectorAll('main > section, .footer').forEach((sec) => {
    const cs = getComputedStyle(sec);
    const sr = sec.getBoundingClientRect();
    const L = sr.left + parseFloat(cs.paddingLeft), R = sr.right - parseFloat(cs.paddingRight);
    sec.querySelectorAll('*').forEach((el) => {
      // art, GL anchors, display type with optical overhang, and the footer legal links' intentional -10px optical margin are skipped
      if (el.closest('.study-media, .sr-only, .hp, .knot-a, .knot-b, .z-anchor, .exp-anchor, .anchor-alias, .stage-ribbon, svg, .hero-title, .contact-title, .footer-small nav')) return;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
      let hidden = false; for (let p = el; p && p !== sec; p = p.parentElement) { const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden') { hidden = true; break; } }
      if (hidden || el.closest('details:not([open]) > :not(summary)')) return;
      if (r.right > R + 1.5 || r.left < L - 1.5) out.add(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${(el.textContent || '').trim().slice(0, 16)}" ${Math.round(r.left)}..${Math.round(r.right)} (content ${Math.round(L)}..${Math.round(R)})`);
    });
  });
  return [...out].slice(0, 8);
}

function auditContrast() {
  const parse = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (top, base) => ({ r: top.r * top.a + base.r * (1 - top.a), g: top.g * top.a + base.g * (1 - top.a), b: top.b * top.a + base.b * (1 - top.a), a: 1 });
  const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const DARK = { r: 12, g: 10, b: 9, a: 1 }, PAPER = { r: 236, g: 229, b: 217, a: 1 }, SHEET = { r: 23, g: 19, b: 16, a: 1 };
  const openDlg = document.querySelector('dialog[open]');
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement; if (!el || seen.has(el)) continue; seen.add(el);
    if (el.closest('dialog:not([open]), .sr-only, .sprite, .hp, .skip, .cursor, .study-media, .project-visual, .hero-title, svg, [aria-hidden="true"]')) continue;
    if (openDlg && !openDlg.contains(el)) continue;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
    let hidden = false; for (let p = el; p && p.nodeType === 1; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.display === 'none' || cs.visibility === 'hidden') { hidden = true; break; } }
    if (hidden) continue;
    const layers = []; let base = null;
    for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
      const bg = parse(getComputedStyle(p).backgroundColor); if (bg && bg.a > 0) layers.push(bg);
      if (bg && bg.a >= 1) { base = bg; layers.pop(); break; }
      if (p.tagName === 'DIALOG') { base = SHEET; break; }
      if (p.dataset && p.dataset.theme) { base = p.dataset.theme === 'light' ? PAPER : DARK; break; }
    }
    if (!base) base = DARK;
    let bgc = base; for (let i = layers.length - 1; i >= 0; i--) bgc = over(layers[i], bgc);
    const cs = getComputedStyle(el); const fg = parse(cs.color); if (!fg) continue;
    let op = 1; for (let p = el; p && p.nodeType === 1; p = p.parentElement) { if (!p.classList.contains('reveal')) op *= parseFloat(getComputedStyle(p).opacity); }
    const col = over({ ...fg, a: fg.a * op }, bgc);
    const fs = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
    const need = fs >= 24 || (bold && fs >= 18.66) ? 3 : 4.5;
    const cr = ratio(col, bgc);
    if (cr < need) out.push({ el: `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${el.textContent.trim().slice(0, 28)}"`, ratio: Math.round(cr * 100) / 100, need, fs });
  }
  return out;
}

function headlineRows() {
  const rows = {};
  document.querySelectorAll('main h2, .hero-title .ln, .project-title, .panel:not([hidden]) h3, .menu-links a').forEach((el) => {
    if (el.closest('dialog:not([open])')) return;
    const r = el.getBoundingClientRect(); if (!r.width) return;
    const words = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (n.parentElement.closest('.sr-only, .menu-n')) continue;
      const re = /\S+/g; let m;
      while ((m = re.exec(n.nodeValue))) { const rg = document.createRange(); rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length); const rr = rg.getBoundingClientRect(); words.push({ w: m[0], top: Math.round(rr.top) }); }
    }
    const lines = []; words.forEach((w) => { const l = lines.find((x) => Math.abs(x.top - w.top) < 6); if (l) l.words.push(w.w); else lines.push({ top: w.top, words: [w.w] }); });
    const key = el.id || el.textContent.trim().slice(0, 24);
    rows[key] = lines.map((l) => l.words.join(' '));
  });
  return rows;
}

/* ------------------------------------------------------------------ popup suite */
async function popupSuite(env, def) {
  const { page, v, cdp } = env;
  const G = `${v.id} ${def.name}`;
  const opener = page.locator(def.opener).first();
  await page.evaluate(() => { document.querySelectorAll('dialog[open]').forEach((d) => d.close()); });
  const y = def.y != null ? def.y : await opener.evaluate((el) => Math.max(0, Math.round(el.getBoundingClientRect().top + scrollY - innerHeight * 0.45)));
  await scrollToY(page, y);
  // Playwright's tap scrolls a partly hidden target into view first; do that before the baseline is recorded
  await opener.scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
  await opener.evaluate((el) => { window.__qaOpener = el; });
  const s0 = await state(page);

  // 1. open → exactly one history entry, locked, no layout shift, GL paused
  await tapL(env, opener); await page.waitForTimeout(600);
  const s1 = await state(page);
  check(G, 'opens', s1[def.key], J({ menu: s1.menu, project: s1.project }));
  if (!s1[def.key]) return;
  check(G, 'open pushes exactly one history entry', s1.idx === s0.idx + 1 && s1.entries === s1.idx + 1 && s1.depth === 1 && s1.len <= s0.len + 1, `entry index ${s0.idx} → ${s1.idx} (${s1.entries} entries), history.length ${s0.len} → ${s1.len}, depth ${s1.depth}`);
  check(G, 'scroll lock engaged', s1.locked && s1.bodyPos === 'fixed', `locked=${s1.locked} body=${s1.bodyPos}`);
  check(G, 'no layout shift behind the popup', Math.abs(s1.mainTop - s0.mainTop) < 0.6 && s1.docW === s0.docW, `mainTop ${r1(s0.mainTop)} → ${r1(s1.mainTop)}, width ${s0.docW} → ${s1.docW}`);
  if (s1.glLive && s1.motion) { const d = await drawsBetween(page, 700); check(G, 'GL paused while the popup covers it', d === 0, `${d} ribbon draws in 700ms`); }

  // 2. try to scroll the page behind
  let internal = null;
  if (v.touch) {
    await swipe(cdp, v.w * 0.5, v.h * 0.82, v.h * 0.2);
    await page.waitForTimeout(350);
    internal = await page.evaluate(() => { const sc = document.querySelector('dialog[open] .sheet-scroll'); return sc ? { top: Math.round(sc.scrollTop), max: sc.scrollHeight - sc.clientHeight } : null; });
    await swipe(cdp, v.w * 0.5, v.h * 0.2, v.h * 0.85);
    await swipe(cdp, 14, v.h * 0.85, v.h * 0.15);
    await swipe(cdp, v.w - 14, v.h * 0.15, v.h * 0.9);
  }
  await page.mouse.move(v.w / 2, v.h / 2); await page.mouse.wheel(0, 900); await page.waitForTimeout(120); await page.mouse.wheel(0, -300);
  for (const k of ['PageDown', 'ArrowDown', 'End']) await page.keyboard.press(k);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  for (const k of ['PageDown', 'Space', 'End', 'ArrowDown']) await page.keyboard.press(k);
  await page.evaluate(() => { window.scrollBy(0, 500); document.scrollingElement.scrollTop += 300; });
  await page.waitForTimeout(450);
  const s2 = await state(page);
  check(G, 'page behind never moves (touch/wheel/keys/scrollBy)', s2[def.key] && Math.abs(s2.mainTop - s1.mainTop) < 0.6 && s2.y === s1.y, `open=${s2[def.key]} mainTop ${r1(s1.mainTop)} → ${r1(s2.mainTop)}, scrollY ${s1.y} → ${s2.y}`);
  if (internal && internal.max > 20) check(G, 'tall popup scrolls internally with a touch swipe', internal.top > 0, `scrollTop ${internal.top} of ${internal.max} after one swipe`);
  if (def.shot) await page.screenshot({ path: path.join(OUT, `${def.shot}-scrolled.png`), scale: 'css' });

  // 3. phone back button
  if (!s2[def.key]) { await page.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close())); await page.waitForTimeout(800); }
  else {
    await back(page);
    const s3 = await state(page);
    check(G, 'back closes the popup', !s3[def.key] && s3.openCount === 0, `open=${s3.openCount}`);
    check(G, 'back stays on the same document and URL', s3.doc === s0.doc && s3.url === s0.url, `${s3.url}`);
    check(G, 'back restores scrollY exactly', s3.y === s0.y && Math.abs(s3.mainTop - s0.mainTop) < 0.6, `${s0.y} → ${s3.y}`);
    check(G, 'back releases the lock and leaves no popup state', !s3.locked && s3.bodyPos === '' && s3.depth === 0, `locked=${s3.locked} depth=${s3.depth}`);
    check(G, 'back returns focus to the opener', s3.focusOk, s3.active);
    if (s3.glLive && s3.motion && s3.glVisible) { const d = await drawsBetween(page, 700); check(G, 'GL resumes after close', d > 3, `${d} draws in 700ms`); }
  }

  // 4. five open/close cycles by button / Escape / back / backdrop
  const methods = ['button', 'escape', 'back', 'button', 'backdrop'];
  const baseS = await state(page); const lenBase = baseS.len;
  const issues = [];
  let backdropUsed = false;
  for (let i = 0; i < methods.length; i++) {
    await tapL(env, opener); await page.waitForTimeout(550);
    const so = await state(page);
    if (!so[def.key] || so.depth !== 1 || so.idx !== baseS.idx + 1) issues.push(`cycle ${i + 1} open: open=${so[def.key]} depth=${so.depth} idx=${so.idx}`);
    let m = methods[i];
    if (m === 'backdrop') {
      const inset = await page.evaluate((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.left > 6 || r.top > 6 ? { x: Math.max(3, r.left / 2), y: innerHeight / 2 } : null; }, def.dlg);
      if (inset) { backdropUsed = true; if (v.touch) await page.touchscreen.tap(inset.x, inset.y); else await page.mouse.click(inset.x, inset.y); } else m = 'escape';
    }
    if (m === 'button') await tap(env, `#${def.dlg} [data-close]`);
    if (m === 'escape') await page.keyboard.press('Escape');
    if (m === 'back') await back(page);
    await page.waitForTimeout(650);
    const sc = await state(page);
    if (sc[def.key] || sc.depth !== 0 || sc.y !== s0.y || sc.doc !== s0.doc || sc.locked) issues.push(`cycle ${i + 1} close by ${m}: open=${sc[def.key]} depth=${sc.depth} y=${sc.y} locked=${sc.locked}`);
    if (!sc.focusOk) issues.push(`cycle ${i + 1} close by ${m}: focus on ${sc.active}`);
  }
  const s4 = await state(page);
  check(G, '5 open/close cycles (button, Escape, back, button, backdrop|Escape) stay clean', issues.length === 0, issues.join(' | ') || `backdrop ${backdropUsed ? 'tested' : 'n/a (full-screen sheet)'}`);
  check(G, 'history does not accumulate over the cycles', s4.len <= lenBase + 1 && s4.idx === baseS.idx && s4.depth === 0, `history.length ${lenBase} → ${s4.len}, entry index ${baseS.idx} → ${s4.idx}`);

  // 5. races: reopen immediately after a button close; double Escape; double tap on the close button
  if (!def.races) return;
  await tapL(env, opener); await page.waitForTimeout(550);
  await tap(env, `#${def.dlg} [data-close]`); await page.waitForTimeout(40);
  await tapL(env, opener).catch(() => {}); await page.waitForTimeout(1000);
  let s5 = await state(page);
  check(G, 'reopen right after closing (settle race) is consistent', s5[def.key] && s5.depth === 1 && s5.openCount === 1 && s5.doc === s0.doc, `open=${s5[def.key]} depth=${s5.depth}`);
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(1000);
  s5 = await state(page);
  check(G, 'double Escape closes once, never navigates', !s5[def.key] && s5.depth === 0 && s5.doc === s0.doc && s5.url === s0.url && s5.y === s0.y, `open=${s5[def.key]} depth=${s5.depth} url=${s5.url} y=${s5.y}`);
  await tapL(env, opener); await page.waitForTimeout(600);
  const cb = await page.locator(`#${def.dlg} [data-close]`).boundingBox();
  if (cb) {
    const cx = cb.x + cb.width / 2, cy = cb.y + cb.height / 2;
    if (v.touch) { await page.touchscreen.tap(cx, cy); await page.waitForTimeout(45); await page.touchscreen.tap(cx, cy); }
    else { await page.mouse.click(cx, cy); await page.waitForTimeout(45); await page.mouse.click(cx, cy); }
    await page.waitForTimeout(1100);
    s5 = await state(page);
    // the 2nd tap lands on whatever sits under the close button once the sheet is gone (nav Menu / CTA): a real click, not a history bug
    const consistent = s5.openCount === s5.depth && s5.doc === s0.doc;
    check(G, 'double tap on close keeps history and popups consistent', consistent, `open=${s5.openCount} depth=${s5.depth} y=${s5.y}`);
    if (s5.openCount > 0) { note(G, 'double tap on close: 2nd tap hit the nav Menu button under the X and re-opened the menu', J({ menu: s5.menu, project: s5.project })); await page.keyboard.press('Escape'); await page.waitForTimeout(900); }
    else if (s5.url !== s0.url) { note(G, 'double tap on close: 2nd tap hit the nav link under the X and jumped', `${s5.url} y=${Math.round(s5.y)}`); await page.goBack().catch(() => null); await page.waitForTimeout(700); await scrollToY(page, s0.y); }
  }
  const s6 = await state(page);
  check(G, 'after all races: closed, no popup entries, scroll exact', s6.openCount === 0 && s6.depth === 0 && s6.y === s0.y && !s6.locked, `open=${s6.openCount} depth=${s6.depth} y=${s6.y}`);
}

/* ------------------------------------------------------------------ stacked + in-popup actions (touch views with a menu) */
async function stackedSuite(env) {
  const { page, v, cdp } = env; const G = `${v.id} stacked`;
  const y = Math.round((await page.evaluate(() => document.documentElement.scrollHeight)) * 0.3);
  await scrollToY(page, y);
  await page.locator('.menu-btn').evaluate((el) => { window.__qaOpener = el; });
  const s0 = await state(page);
  await tap(env, '.menu-btn'); await page.waitForTimeout(600);
  await page.locator('#menu [data-project="lume"]').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await tap(env, '#menu [data-project="lume"]'); await page.waitForTimeout(700);
  let s = await state(page);
  const title = await page.textContent('#dialogTitle');
  check(G, 'study opens on top of the menu (+2 entries)', s.menu && s.project && s.idx === s0.idx + 2 && s.depth === 2 && title === 'Lume', `menu=${s.menu} project=${s.project} entry index ${s0.idx}→${s.idx} depth=${s.depth} title=${title}`);
  check(G, 'page behind unchanged with two popups', Math.abs(s.mainTop - s0.mainTop) < 0.6, `${r1(s0.mainTop)} → ${r1(s.mainTop)}`);
  await page.screenshot({ path: path.join(OUT, `${v.id}-stacked-study.png`), scale: 'css' });
  await swipe(cdp, v.w / 2, v.h * 0.2, v.h * 0.9); await page.mouse.wheel(0, 800); await page.waitForTimeout(300);
  s = await state(page);
  check(G, 'stacked: page behind still does not move', Math.abs(s.mainTop - s0.mainTop) < 0.6, `${r1(s.mainTop)}`);
  const idxOpen = s.idx;
  for (let i = 0; i < 3; i++) { await tap(env, '#dialogNext'); await page.waitForTimeout(150); }
  s = await state(page);
  check(G, '"Next study" ×3 pushes no history', s.idx === idxOpen && s.depth === 2 && (await page.textContent('#dialogTitle')) === 'Lume', `entry index ${idxOpen}→${s.idx}`);
  await back(page); s = await state(page);
  check(G, 'first back closes only the study', s.menu && !s.project && s.depth === 1 && s.doc === s0.doc, `menu=${s.menu} project=${s.project} depth=${s.depth}`);
  await back(page); s = await state(page);
  check(G, 'second back closes the menu, scroll exact, focus on menu button', !s.menu && s.depth === 0 && s.y === s0.y && s.doc === s0.doc && s.focusOk, `y ${s0.y}→${s.y} focus=${s.active}`);
  // stacked close by buttons
  await tap(env, '.menu-btn'); await page.waitForTimeout(600);
  await page.locator('#menu [data-project="atelier"]').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await tap(env, '#menu [data-project="atelier"]'); await page.waitForTimeout(700);
  await tap(env, '#project [data-close]'); await page.waitForTimeout(800);
  s = await state(page);
  check(G, 'closing the study by button returns to the menu (depth 1)', s.menu && !s.project && s.depth === 1, `menu=${s.menu} depth=${s.depth} active=${s.active}`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(900);
  s = await state(page);
  check(G, 'then Escape closes the menu cleanly', !s.menu && s.depth === 0 && s.y === s0.y && s.idx === s0.idx, `depth=${s.depth} y=${s.y} entry index ${s0.idx}→${s.idx}`);
  // study CTA from inside the stack: close all, then land on contact with the interest preselected
  await tap(env, '.menu-btn'); await page.waitForTimeout(600);
  await page.locator('#menu [data-project="meridian"]').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await tap(env, '#menu [data-project="meridian"]'); await page.waitForTimeout(700);
  await page.locator('#dialogContact').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await tap(env, '#dialogContact'); await waitScrollEnd(page); await page.waitForTimeout(900);
  s = await state(page);
  const land = await page.evaluate(() => { const h = document.getElementById('contact-title').getBoundingClientRect(); const nb = document.querySelector('.nav-pill').getBoundingClientRect().bottom; return { top: Math.round(h.top), nb: Math.round(nb), pressed: [...document.querySelectorAll('[data-select-interest][aria-pressed="true"]')].map((b) => b.dataset.selectInterest).join(), active: document.activeElement.id }; });
  check(G, 'study CTA inside the stack closes both popups with no leftover entries', !s.menu && !s.project && s.depth === 0 && s.doc === s0.doc, `depth=${s.depth} len=${s.len}`);
  check(G, 'study CTA lands on contact below the nav and preselects the interest', land.top >= land.nb && land.top < v.h * 0.7 && land.pressed === 'UI / UX', J(land));
  await page.evaluate(() => { document.getElementById('full-name').blur(); });
}

/* ------------------------------------------------------------------ menu / nav links */
async function linksSuite(env) {
  const { page, v } = env; const G = `${v.id} menu links`;
  const menuVisible = await page.locator('.menu-btn').isVisible();
  const targets = ['#work', '#expertise', '#studio', '#process', '#faq', '#contact', '#top'];
  const base = (await state(page)).len;
  for (const t of targets) {
    const docH = await page.evaluate(() => document.documentElement.scrollHeight);
    await scrollToY(page, t === '#top' ? Math.round(docH * 0.6) : (t === '#work' ? Math.round(docH * 0.55) : Math.round(docH * 0.08)));
    const sel = menuVisible ? (t === '#top' ? '#menu a.brand' : `#menu a[href="${t}"]`) : (t === '#top' ? '.nav .brand' : `.nav-links a[href="${t}"]`);
    if (!menuVisible && t === '#contact') continue;
    if (menuVisible) { await tap(env, '.menu-btn'); await page.waitForTimeout(600); await page.locator(sel).evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' })); }
    await tap(env, sel);
    await waitScrollEnd(page); await page.waitForTimeout(1100);
    const s = await state(page);
    const m = await page.evaluate((tt) => {
      const sec = document.querySelector(tt); const hd = sec.querySelector('h1, h2');
      const r = hd.getBoundingClientRect(); const nb = document.querySelector('.nav-pill').getBoundingClientRect().bottom;
      const px = r.left + Math.min(24, r.width / 2), py = r.top + Math.min(14, r.height / 2);
      const hit = document.elementFromPoint(px, py);
      return { hTop: Math.round(r.top), nav: Math.round(nb), y: Math.round(scrollY), covered: !(hit && hd.contains(hit)) && !(hit && hit.closest('canvas')) ? (hit ? hit.className || hit.tagName : 'none') : '', focused: document.activeElement === sec, secTop: Math.round(sec.getBoundingClientRect().top) };
    }, t);
    const ok = t === '#top' ? m.y <= 1 : (m.hTop >= m.nav + 2 && m.hTop < v.h * 0.62 && !m.covered);
    // menu links scroll by script (no history); desktop nav links are plain anchors that add a normal #hash entry
    const histOk = menuVisible ? s.len <= base + 1 : true;
    check(G, `${sel} → closes${menuVisible ? ' menu' : ''} and lands on ${t} below the nav`, ok && !s.menu && s.depth === 0 && histOk, `${J(m)} menu=${s.menu} depth=${s.depth} len=${s.len}`);
  }
}

/* ------------------------------------------------------------------ contact form */
async function formSuite(env) {
  const { page, v, log } = env; const G = `${v.id} form`;
  await page.evaluate(() => document.getElementById('contact-form').scrollIntoView({ behavior: 'instant', block: 'start' }));
  await page.waitForTimeout(600);
  const postsBefore = log.posts.length;
  const read = () => page.evaluate(() => { const st = document.getElementById('form-status'); const r = st.getBoundingClientRect(); return { invalid: [...document.querySelectorAll('#contact-form [aria-invalid="true"]')].map((e) => e.id), status: st.hidden ? '' : st.textContent, isError: st.classList.contains('is-error'), statusInView: !st.hidden && r.top >= 0 && r.bottom <= innerHeight, statusTop: Math.round(r.top), interest: document.getElementById('interest').value, pressed: [...document.querySelectorAll('[data-select-interest][aria-pressed="true"]')].map((b) => b.dataset.selectInterest), counter: document.getElementById('msg-counter').textContent }; });
  await tap(env, '#contact-form button[type="submit"]'); await page.waitForTimeout(400);
  let st = await read();
  check(G, 'empty submit flags name, email and message (aria-invalid)', st.invalid.length === 3, st.invalid.join() || 'none');
  check(G, 'empty submit shows no success message', !/Preview complete|has been sent/.test(st.status), st.status || '(no status)');
  const chips = page.locator('[data-select-interest]');
  await tapL(env, chips.nth(0)); st = await read();
  const c1 = st.pressed.join() === 'Website' && st.interest === 'Website';
  await tapL(env, chips.nth(2)); st = await read();
  const c2 = st.pressed.join() === 'UI / UX' && st.interest === 'UI / UX';
  await tapL(env, chips.nth(2)); st = await read();
  const c3 = st.pressed.length === 0 && st.interest === '';
  check(G, 'interest chips: select, switch exclusively, tap again to clear', c1 && c2 && c3, J({ c1, c2, c3 }));
  await page.fill('#full-name', 'Q'); await page.fill('#email', 'not-an-email'); await page.fill('#message', 'short');
  await tap(env, '#contact-form button[type="submit"]'); await page.waitForTimeout(400);
  st = await read();
  check(G, 'too-short name, bad email, too-short message are all rejected', st.invalid.length === 3 && !/Preview complete/.test(st.status), st.invalid.join());
  await page.fill('#full-name', 'Test Person'); await page.fill('#email', 'test@example.com'); await page.fill('#message', 'A landing page for a small studio in Tel Aviv.');
  await tapL(env, chips.nth(1));
  await page.locator('#contact-form button[type="submit"]').scrollIntoViewIfNeeded();
  await tap(env, '#contact-form button[type="submit"]'); await page.waitForTimeout(700);
  st = await read();
  check(G, 'valid submit shows the local preview message', /^Preview complete — your form is valid\. This local preview does not send messages\./.test(st.status) && !st.isError && st.invalid.length === 0, st.status);
  check(G, 'local preview never sends a request', log.posts.length === postsBefore, log.posts.slice(postsBefore).join(' | ') || 'no POST');
  check(G, 'interest + counter kept', st.interest === 'Landing page' && st.counter === String('A landing page for a small studio in Tel Aviv.'.length), `${st.interest} / ${st.counter}`);
  if (!st.statusInView) warn(G, 'status message appears outside the viewport after tapping send', `status top ${st.statusTop}px, viewport ${v.h}px`);
  if (v.id === '390x844') await page.screenshot({ path: path.join(OUT, `${v.id}-form-preview.png`), scale: 'css' });
}

/* ------------------------------------------------------------------ one viewport */
async function viewSuite(browser, v) {
  const env = await openPage(browser, v);
  const { page, log } = env;
  const G = v.id;
  try {
    const initialDetails = await page.evaluate(() => [...document.querySelectorAll('details')].map((d) => d.open));
    const a0 = await page.evaluate(auditLayout);
    await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
    await page.waitForTimeout(900); // let the .5s details-open animation finish before measuring
    const a1 = await page.evaluate(auditLayout);
    const gutter = await page.evaluate(auditGutter);
    if (gutter.length) warn(G, 'content pokes past the side gutter (misaligned right/left edge)', gutter.join(' | '));
    const small = [...new Set([...a0.small, ...a1.small])];
    check(G, 'no horizontal overflow (document)', a0.scrollW <= a0.vw && a1.scrollW <= a1.vw, `scrollWidth ${a0.scrollW}/${a1.scrollW} vs ${a0.vw}`);
    check(G, 'no element wider than the viewport (unclipped)', !a0.wide.length && !a1.wide.length, [...a0.wide, ...a1.wide].join(' | '));
    check(G, 'no text spilling out of its box (nowrap buttons, pills, headings)', !a0.spill.length && !a1.spill.length, [...new Set([...a0.spill, ...a1.spill])].join(' | '));
    check(G, 'tap targets ≥ 44×44', small.length === 0, small.join(' | '));
    if (a1.inlineSmall.length) note(G, 'inline text links under 44px (WCAG inline exception)', a1.inlineSmall.join(' | '));
    check(G, 'inputs/textarea/select font-size ≥ 16px', a1.inputs.length === 0, a1.inputs.join(' | '));
    const tinyReal = a1.tiny.filter((t) => !/concept art/.test(t));
    if (tinyReal.length) warn(G, 'text under 12px', tinyReal.join(' | '));
    if (v.touch) check(G, 'custom cursor off on touch', a0.cursor === 'none', `cursor display=${a0.cursor} hover:none=${a0.hoverNone} coarse=${a0.coarse}`);
    const rows = await page.evaluate(headlineRows);
    const orphans = Object.entries(rows).filter(([, l]) => l.length > 1 && l[l.length - 1].split(' ').length === 1 && l[l.length - 2].split(' ').length >= 3);
    note(G, 'headline line breaks', Object.entries(rows).map(([k, l]) => `${k.slice(0, 18)}: ${l.join(' ⏎ ')}`).join(' || '));
    if (orphans.length) warn(G, 'headline ends on a single orphan word', orphans.map(([k, l]) => `${k.slice(0, 20)} → "${l[l.length - 1]}"`).join(' | '));
    await page.evaluate((st) => document.querySelectorAll('details').forEach((d, i) => { d.open = st[i]; }), initialDetails);
    // contrast sampled at a few scroll positions
    const docH = await page.evaluate(() => document.documentElement.scrollHeight);
    const lowC = new Map();
    for (let y = 0; y < docH; y += Math.round(v.h * 0.9)) {
      await scrollToY(page, y); await page.waitForTimeout(120);
      (await page.evaluate(auditContrast)).forEach((c) => lowC.set(c.el, c));
    }
    const hardFail = [...lowC.values()].filter((c) => c.ratio < 3);
    check(G, 'text contrast ≥ 3:1 everywhere (approx., CSS grounds)', hardFail.length === 0, hardFail.map((c) => `${c.el} ${c.ratio}`).join(' | '));
    const soft = [...lowC.values()].filter((c) => c.ratio >= 3);
    if (soft.length) warn(G, 'text contrast under 4.5:1 (approx.)', soft.map((c) => `${c.el} ${c.ratio}:1 @${c.fs}px`).join(' | '));
    if (v.touch) {
      const hero = await page.evaluate(() => { const h = document.querySelector('.hero').getBoundingClientRect(); const act = document.querySelector('.hero-actions').getBoundingClientRect(); window.scrollTo({ top: 0, behavior: 'instant' }); return { heroH: Math.round(h.height), actBottom: Math.round(act.bottom + scrollY), vh: innerHeight }; });
      await scrollToY(page, 0);
      if (hero.actBottom > hero.vh) warn(G, 'hero CTAs are below the first screen', J(hero));
    }

    const menuVisible = await page.locator('.menu-btn').isVisible();
    if (want('views')) {
      if (menuVisible) await popupSuite(env, { name: 'menu', opener: '.menu-btn', dlg: 'menu', key: 'menu', races: true, y: Math.round(docH * 0.42), shot: v.id === '390x844' || v.id === '320x568' || v.id === '844x390' ? `${v.id}-menu` : null });
      for (const key of Object.keys(STUDIES)) {
        const openerSel = v.w <= 900 ? `.study-open[data-project="${key}"]` : `.study-link[data-project="${key}"]`;
        await popupSuite(env, { name: `study ${key}`, opener: openerSel, dlg: 'project', key: 'project', races: key === 'atelier', shot: v.id === '390x844' ? `${v.id}-study-${key}` : null });
      }
      if (v.touch && (v.w === 390 || v.w === 320)) await popupSuite(env, { name: 'study (frame tap)', opener: '.study-link[data-project="lume"]', dlg: 'project', key: 'project' });
    }
    if (want('stacked') && menuVisible) await stackedSuite(env);
    if (want('links')) await linksSuite(env);
    if (want('form')) await formSuite(env);

    // a later back press behaves normally: one press leaves the page (no orphan popup entries)
    const sEnd = await state(page);
    if (sEnd.openCount === 0 && !new URL(page.url()).hash) {
      await page.goBack({ timeout: 5000 }).catch(() => null); await page.waitForTimeout(600);
      check(G, 'a later back press leaves the page normally (one press)', page.url() === 'about:blank', `url after one back: ${page.url()} (depth was ${sEnd.depth})`);
    }
    check(G, 'no console errors / page errors', log.errors.length === 0, log.errors.slice(0, 6).join(' | '));
    check(G, 'no failed requests', log.failed.length === 0, log.failed.slice(0, 6).join(' | '));
  } catch (e) {
    check(G, 'suite ran to completion', false, String(e.message || e).split('\n')[0]);
  } finally { await env.ctx.close(); }
}

/* ------------------------------------------------------------------ reduced motion */
async function reducedSuite(browser) {
  for (const v of [ALL_VIEWS[3], ALL_VIEWS[0]]) {
    const G = `${v.id} reduced`;
    const env = await openPage(browser, v, { reduced: true });
    const { page, log } = env;
    try {
      const r = await page.evaluate(() => {
        const b = document.querySelector('.motion-btn'); const br = b.getBoundingClientRect();
        const reveals = [...document.querySelectorAll('.reveal')].map((el) => getComputedStyle(el)).filter((cs) => cs.opacity !== '1' || cs.transform !== 'none').length;
        return { off: document.documentElement.classList.contains('motion-off'), pressed: b.getAttribute('aria-pressed'), label: b.getAttribute('aria-label'), btn: [Math.round(br.width), Math.round(br.height), Math.round(br.top)], hiddenReveals: reveals, sb: getComputedStyle(document.documentElement).scrollBehavior, live: document.documentElement.classList.contains('gl-live'), title: getComputedStyle(document.querySelector('.hero-title')).color };
      });
      check(G, 'prefers-reduced-motion switches motion off', r.off && r.pressed === 'false', J(r));
      check(G, 'motion toggle visible in the nav, ≥ 44px', r.btn[0] >= 44 && r.btn[1] >= 44 && r.btn[2] >= 0 && r.btn[2] < 80, `${r.btn}`);
      check(G, 'all reveal content visible without animation', r.hiddenReveals === 0, `${r.hiddenReveals} hidden`);
      check(G, 'smooth scrolling off', r.sb === 'auto', r.sb);
      if (r.live) { const d = await drawsBetween(page, 1500); check(G, 'GL idle (not animating) with motion off', d <= 3, `${d} draws in 1.5s`); }
      await page.screenshot({ path: path.join(OUT, `${v.id}-reduced-hero.png`), scale: 'css' });
      await tap(env, '.menu-btn'); await page.waitForTimeout(400);
      const anim = await page.evaluate(() => getComputedStyle(document.getElementById('menu')).animationName);
      check(G, 'menu opens without animation', anim === 'none', anim);
      await page.keyboard.press('Escape'); await page.waitForTimeout(700);
      await tap(env, '.motion-btn'); await page.waitForTimeout(300);
      const on = await page.evaluate(() => ({ off: document.documentElement.classList.contains('motion-off'), pressed: document.querySelector('.motion-btn').getAttribute('aria-pressed'), saved: localStorage.getItem('zs-motion') }));
      let d2 = null; if (r.live) d2 = await drawsBetween(page, 1000);
      check(G, 'toggle turns motion on (and GL animates)', !on.off && on.pressed === 'true' && on.saved === 'on' && (d2 === null || d2 > 10), `${J(on)} draws/s=${d2}`);
      await tap(env, '.motion-btn'); await page.waitForTimeout(300);
      check(G, 'no console errors', log.errors.length === 0, log.errors.join(' | '));
    } catch (e) { check(G, 'suite ran', false, e.message.split('\n')[0]); } finally { await env.ctx.close(); }
  }
}

/* ------------------------------------------------------------------ no WebGL */
async function noglSuite(browser) {
  for (const v of [ALL_VIEWS[3], ALL_VIEWS[0], ALL_VIEWS[7]]) {
    const G = `${v.id} no-GL`;
    const env = await openPage(browser, v, { nogl: true });
    const { page, log } = env;
    try {
      const r = await page.evaluate(() => {
        const cs = (s, p) => { const el = document.querySelector(s); return el ? getComputedStyle(el)[p] : null; };
        return { noGl: document.documentElement.classList.contains('no-gl'), live: document.documentElement.classList.contains('gl-live'), title: cs('.hero-title', 'color'), portrait: cs('.portrait-frame img', 'opacity'), z: cs('.z-fallback', 'opacity'), heroBg: cs('.hero', 'backgroundColor'), studioBg: cs('.studio', 'backgroundColor'), knot: cs('.knot-b', 'backgroundImage') };
      });
      check(G, 'falls back to no-gl', r.noGl && !r.live, J(r));
      check(G, 'hero title, portrait and Z mark visible', !/, 0\)$|transparent/.test(r.title) && r.portrait === '1' && r.z === '1', `${r.title} / ${r.portrait} / ${r.z}`);
      check(G, 'section grounds painted by CSS', r.heroBg === 'rgb(12, 10, 9)' && r.studioBg === 'rgb(236, 229, 217)', `${r.heroBg} / ${r.studioBg}`);
      await page.screenshot({ path: path.join(OUT, `${v.id}-nogl-hero.png`), scale: 'css' });
      if (v.touch) {
        for (const id of ['work', 'studio', 'contact']) {
          await page.evaluate((i) => document.getElementById(i).scrollIntoView({ behavior: 'instant' }), id); await page.waitForTimeout(500);
          await page.screenshot({ path: path.join(OUT, `${v.id}-nogl-${id}.png`), scale: 'css' });
        }
        await tap(env, '.menu-btn'); await page.waitForTimeout(500);
        const y = await page.evaluate(() => document.getElementById('menu').open);
        await back(page);
        const s = await state(page);
        check(G, 'menu + back still work without GL', y && !s.menu && s.depth === 0, `opened=${y} depth=${s.depth}`);
      }
      check(G, 'no console errors', log.errors.length === 0, log.errors.join(' | '));
    } catch (e) { check(G, 'suite ran', false, e.message.split('\n')[0]); } finally { await env.ctx.close(); }
  }
}

/* ------------------------------------------------------------------ rename / brand / credit badge */
async function renameSuite(browser) {
  const G = 'rename';
  const BAD = [[/NZ ?Web/gi, 'NZ Web'], [/nz-(mark|logo)/gi, 'nz-mark/nz-logo'], [/zvi(293){2}/gi, 'old personal email'], [/\bNZ\b/g, 'NZ']];
  const scan = (txt) => BAD.map(([re, n]) => [n, (txt.match(re) || []).length]).filter(([, c]) => c > 0);
  const env = await openPage(browser, ALL_VIEWS[3]);
  const { page } = env;
  try {
    const own = await page.evaluate(() => [...new Set([location.href, ...performance.getEntriesByType('resource').map((e) => e.name)])].filter((u) => u.startsWith(location.origin) && /\.(html|css|js|svg|json)$|\/$/.test(new URL(u).pathname)));
    ['ribbon.css', 'site.js', 'ribbon-gl.js', 'boot.js', 'zstore-mark.svg'].forEach((f) => { const u = new URL(f, URL_).href; if (!own.includes(u)) own.push(u); });
    const served = {};
    for (const u of own) served[u] = await (await page.request.get(u)).text();
    const hits = Object.entries(served).map(([u, t]) => [u, scan(t)]).filter(([, h]) => h.length);
    check(G, 'served HTML/JS/CSS/SVG free of NZ Web / nz-mark / NZ / old personal email', hits.length === 0, hits.map(([u, h]) => `${new URL(u).pathname}: ${J(h)}`).join(' | ') || `${own.length} files scanned`);
    const disk = fs.readdirSync(__dirname).filter((f) => /\.(html|css|js|svg|md)$/.test(f));
    const diskHits = disk.map((f) => [f, scan(fs.readFileSync(path.join(__dirname, f), 'utf8'))]).filter(([, h]) => h.length);
    check(G, 'prototype source files (incl. CONCEPT.md) free of old name/email', diskHits.length === 0, diskHits.map(([f, h]) => `${f}: ${J(h)}`).join(' | ') || disk.join(', '));
    const linked = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href).filter((h) => h.startsWith(location.origin) && new URL(h).pathname !== '/'))]);
    const linkHits = [];
    for (const u of linked) { const res = await page.request.get(u); const t = await res.text(); const h = scan(t); linkHits.push(`${new URL(u).pathname} ${res.status()} ${h.length ? J(h) : 'clean'}`); if (h.length || res.status() >= 400) linkHits.bad = true; }
    check(G, 'same-origin pages linked from the site (Privacy, Terms) carry the new name/email', !linkHits.bad, linkHits.join(' | '));
    const text = served[URL_] || '';
    const dom = await page.evaluate(({ EMAIL, WA_TEXT }) => {
      const mails = [...document.querySelectorAll('a[href^="mailto:"]')].map((a) => a.getAttribute('href'));
      const was = [...document.querySelectorAll('a[href*="wa.me"]')].map((a) => { const u = new URL(a.href); return u.pathname === '/972587292029' && u.searchParams.get('text') === WA_TEXT; });
      const b = document.querySelector('a.zstore-badge'); const img = b && b.querySelector('img');
      const out = { mails, waOk: was.length > 0 && was.every(Boolean), waCount: was.length, bodyEmail: document.body.textContent.includes(EMAIL), phone: document.body.textContent.includes('+972 58 729 2029'),
        title: document.title, desc: (document.querySelector('meta[name="description"]') || {}).content, icon: (document.querySelector('link[rel~="icon"]') || {}).href,
        logoImgs: [...document.querySelectorAll('img[src*="zstore-logo"]')].map((i) => i.closest('a.zstore-badge') ? 'badge' : i.outerHTML.slice(0, 60)),
        marks: [...document.querySelectorAll('.nav .brand use, #menu .brand use, .footer .brand use')].map((u) => u.getAttribute('href')),
        words: [...document.querySelectorAll('.wordmark')].map((w) => w.textContent), copyright: (document.querySelector('.footer-small') || {}).textContent,
        legal: [...document.querySelectorAll('.footer-small nav a')].map((a) => a.getAttribute('href')), backTop: !!document.querySelector('.footer a[href="#top"]') };
      if (b) {
        const cs = getComputedStyle(b);
        out.badge = { href: b.getAttribute('href'), target: b.target, rel: b.rel, label: b.getAttribute('aria-label'), radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomLeftRadius, cs.borderBottomRightRadius], padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft], bg: cs.backgroundColor,
          border: [cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth, cs.borderLeftColor], shadow: cs.boxShadow,
          img: img && { src: img.getAttribute('src'), w: img.getAttribute('width'), h: img.getAttribute('height'), rh: img.getBoundingClientRect().height } };
      }
      return out;
    }, { EMAIL, WA_TEXT });
    check(G, `${EMAIL} used for every mailto and shown on the page`, dom.mails.length >= 2 && dom.mails.every((m) => m === `mailto:${EMAIL}`) && dom.bodyEmail && text.includes(EMAIL), J(dom.mails));
    const sitejs = served[new URL('site.js', URL_).href] || '';
    check(G, 'form status messages use the new email', (sitejs.match(/zstore\.ai295@gmail\.com/g) || []).length >= 2, 'site.js');
    check(G, 'WhatsApp links: wa.me/972587292029 with the exact Zstore AI prefill', dom.waOk, `${dom.waCount} links`);
    check(G, 'phone +972 58 729 2029 visible', dom.phone);
    check(G, 'title + meta description name Zstore AI', /Zstore AI/.test(dom.title) && /Zstore AI/.test(dom.desc || ''), dom.title);
    check(G, 'SVG favicon link resolves', !!dom.icon && /\.svg$/.test(dom.icon) && (await page.request.get(dom.icon)).status() === 200, dom.icon);
    check(G, 'zstore-logo.webp only used inside the credit badge', dom.logoImgs.length === 1 && dom.logoImgs[0] === 'badge', J(dom.logoImgs));
    check(G, 'Z monogram + Zstore AI wordmark in nav, menu, footer', dom.marks.length === 3 && dom.marks.every((m) => m === '#zmark') && dom.words.every((w) => w === 'ZstoreAI'), J({ marks: dom.marks, words: dom.words }));
    check(G, 'footer: © Zstore AI, Privacy + Terms, back-to-top', /© \d{4} Zstore AI/.test(dom.copyright || '') && J(dom.legal) === J(['./privacy-policy.html', './terms.html']) && dom.backTop, `${(dom.copyright || '').trim()} ${J(dom.legal)}`);
    const bd = dom.badge;
    // Computed border widths snap to whole device pixels (a headful window on a 150% Windows display reports 0.667px for 1px),
    // so the authored rule is checked for "1px" and the computed width only for being one snapped pixel.
    const px1 = (x) => parseFloat(x) > 0.5 && parseFloat(x) <= 1;
    const authored = await page.evaluate(() => { for (const s of document.styleSheets) { let rules; try { rules = s.cssRules; } catch (e) { continue; } for (const r of rules) if (r.selectorText === '.zstore-badge') return { border: r.style.border, radius: r.style.borderRadius, padding: r.style.padding, bg: r.style.background || r.style.backgroundColor, shadow: r.style.boxShadow }; } return null; });
    if (bd) bd.authored = authored;
    const badgeOk = bd && bd.href === 'https://zstore-ai.co.il/' && bd.target === '_blank' && /noopener/.test(bd.rel) && /noreferrer/.test(bd.rel) && bd.label === 'Zstore AI — opens in a new tab'
      && bd.radius.every((x) => x === '999px') && J(bd.padding) === J(['8px', '14px', '8px', '14px']) && bd.bg === 'rgba(255, 255, 255, 0.92)'
      && authored && /^1px solid rgba\(255, 255, 255, 0\.2\)$/.test(authored.border)
      && px1(bd.border[0]) && bd.border[1] === 'solid' && bd.border[2] === 'rgba(255, 255, 255, 0.2)' && bd.border.slice(3, 6).every(px1) && bd.border[6] === 'rgba(255, 255, 255, 0.2)'
      && bd.shadow === 'none' && bd.img && bd.img.src === '/image/brand/zstore-logo.webp' && bd.img.w === '652' && bd.img.h === '217' && Math.abs(bd.img.rh - 30) < 0.5;
    check(G, 'credit badge matches the spec exactly (390)', !!badgeOk, J(bd));
  } catch (e) { check(G, 'suite ran', false, e.message.split('\n')[0]); } finally { await env.ctx.close(); }
  const envD = await openPage(browser, ALL_VIEWS[7]);
  try {
    const bd = await envD.page.evaluate(() => { const b = document.querySelector('a.zstore-badge'); const cs = getComputedStyle(b); return { radius: cs.borderTopLeftRadius, pad: `${cs.paddingTop} ${cs.paddingRight}`, bg: cs.backgroundColor, bw: parseFloat(cs.borderTopWidth), border: `${cs.borderTopStyle} ${cs.borderTopColor}`, shadow: cs.boxShadow, h: b.querySelector('img').getBoundingClientRect().height }; });
    // border width: one snapped device pixel (see the 390 check); the authored 1px rule is verified there
    check('rename', 'credit badge matches the spec (1440)', bd.radius === '999px' && bd.pad === '8px 14px' && bd.bg === 'rgba(255, 255, 255, 0.92)' && bd.bw > 0.5 && bd.bw <= 1 && bd.border === 'solid rgba(255, 255, 255, 0.2)' && bd.shadow === 'none' && Math.abs(bd.h - 30) < 0.5, J(bd));
  } finally { await envD.ctx.close(); }
}

/* ------------------------------------------------------------------ GL frame time at 390 */
async function framesSuite(browser) {
  const G = '390x844 GL frames';
  const v = ALL_VIEWS[3];
  const env = await openPage(browser, v, { dsf: 3, wait: 3000 });
  const { page, cdp } = env;
  const stats = (d) => { if (d.length < 3) return { n: d.length }; const s = [...d].sort((a, b) => a - b); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { n: d.length, median: r1(q(0.5)), p95: r1(q(0.95)), over25: d.filter((x) => x > 25).length }; };
  try {
    const info = await page.evaluate(() => { const c = document.getElementById('stage'); return { canvas: `${c.width}x${c.height}`, css: `${c.clientWidth}x${c.clientHeight}`, dpr: devicePixelRatio, live: document.documentElement.classList.contains('gl-live') }; });
    note(G, 'canvas backing store at DPR 3', J(info));
    check(G, 'GL live on the phone', info.live);
    const t0 = await page.evaluate(() => performance.now());
    await page.waitForTimeout(4000);
    const idle = await page.evaluate((t) => { const a = window.__draws.filter((x) => x > t); return a.slice(1).map((x, i) => x - a[i]); }, t0);
    const t1 = await page.evaluate(() => performance.now());
    await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 650, yDistance: -3200, speed: 1400, gestureSourceType: 'touch' });
    await page.waitForTimeout(400);
    await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 650, yDistance: -3200, speed: 1400, gestureSourceType: 'touch' });
    await page.waitForTimeout(400);
    const scroll = await page.evaluate((t) => { const a = window.__draws.filter((x) => x > t); return { d: a.slice(1).map((x, i) => x - a[i]), long: window.__long.filter((l) => l[0] > t).map((l) => Math.round(l[1])) }; }, t1);
    const after = await page.evaluate(() => { const c = document.getElementById('stage'); return `${c.width}x${c.height}`; });
    const si = stats(idle), ss = stats(scroll.d);
    note(G, 'hero idle frame interval (ms)', J(si));
    note(G, 'touch-scroll frame interval (ms)', `${J(ss)} long tasks: ${J(scroll.long)}`);
    note(G, 'canvas after scroll (1.25x = low-quality governor tripped)', after);
    if (si.median > 20 || ss.median > 20) warn(G, 'GL median frame time above 20ms on a 390px phone (shared GPU, pessimistic)', `idle ${si.median}ms, scroll ${ss.median}ms`);
    if (/^780x/.test(info.canvas)) warn(G, 'phone path renders at the same DPR cap (2) as desktop, with 4x MSAA + mip bloom', info.canvas);
  } catch (e) { check(G, 'suite ran', false, e.message.split('\n')[0]); } finally { await env.ctx.close(); }
}

/* ------------------------------------------------------------------ safe-area insets (CDP override when supported) */
async function safeAreaSuite(browser) {
  const cases = [
    { v: ALL_VIEWS[3], insets: { top: 47, topMax: 47, bottom: 34, bottomMax: 34, left: 0, leftMax: 0, right: 0, rightMax: 0 } },
    { v: ALL_VIEWS[6], insets: { top: 0, topMax: 0, bottom: 21, bottomMax: 21, left: 47, leftMax: 47, right: 47, rightMax: 47 } },
  ];
  for (const { v, insets } of cases) {
    const G = `${v.id} safe-area`;
    const env = await openPage(browser, v);
    const { page, cdp } = env;
    try {
      let supported = true;
      try { await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets }); } catch (e) { supported = false; note(G, 'CDP safe-area override unsupported in this Chrome', e.message.split('\n')[0]); }
      await page.waitForTimeout(500);
      const probe = await page.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)'; document.body.appendChild(d); const cs = getComputedStyle(d); const r = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft]; d.remove(); return r; });
      note(G, 'env(safe-area-inset-*) in page', J(probe));
      if (!supported || probe.every((p) => p === '0px')) continue;
      if (insets.top) {
        const nav = await page.evaluate(() => Math.round(document.querySelector('.nav-pill').getBoundingClientRect().top));
        check(G, 'fixed nav clears the status bar', nav >= insets.top, `nav top ${nav}`);
        await page.screenshot({ path: path.join(OUT, `${v.id}-safe-hero.png`), scale: 'css' });
        for (const [id, opener] of [['menu', '.menu-btn'], ['project', '.study-open[data-project="atelier"]']]) {
          await page.locator(opener).first().evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
          await tap(env, opener); await page.waitForTimeout(700);
          const rest = await page.evaluate((i) => Math.round(document.querySelector(`#${i} [data-close]`).getBoundingClientRect().top), id);
          await page.evaluate((i) => { const s = document.querySelector(`#${i} .sheet-scroll`); s.scrollTop = 420; }, id); await page.waitForTimeout(300);
          const scrolled = await page.evaluate((i) => { const c = document.querySelector(`#${i} [data-close]`).getBoundingClientRect(); const s = document.querySelector(`#${i} .sheet-scroll`); return { top: Math.round(c.top), bottom: Math.round(c.bottom), scrollTop: s.scrollTop }; }, id);
          await page.screenshot({ path: path.join(OUT, `${v.id}-safe-${id}-scrolled.png`), scale: 'css' });
          check(G, `${id}: close button stays clear of the status bar while the sheet scrolls`, rest >= insets.top && (scrolled.scrollTop === 0 || scrolled.top >= insets.top), `at rest top=${rest}, scrolled ${J(scrolled)}`);
          if (rest > insets.top + 40) warn(G, `${id}: double safe-area gap above the sheet header at rest`, `close button top ${rest}px with a ${insets.top}px inset`);
          await page.keyboard.press('Escape'); await page.waitForTimeout(800);
        }
      }
      if (insets.left) {
        const offenders = new Set();
        const docH = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < docH; y += Math.round(v.h * 0.8)) {
          await scrollToY(page, y);
          (await page.evaluate(({ l, r }) => {
            const out = [];
            document.querySelectorAll('main h1 .ln, main h2, main h3, main p, main a, main button, main label, main input, main textarea, footer a, footer p, footer span').forEach((el) => {
              if (el.closest('dialog, .sr-only, .study-media, .hp')) return;
              const b = el.getBoundingClientRect(); if (!b.width || b.bottom < 0 || b.top > innerHeight) return;
              if (getComputedStyle(el).visibility === 'hidden') return;
              if (b.left < l - 0.5 || b.right > innerWidth - r + 0.5) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${el.textContent.trim().slice(0, 18)}" ${Math.round(b.left)}..${Math.round(b.right)}`);
            });
            return out;
          }, { l: insets.left, r: insets.right })).forEach((o) => offenders.add(o));
        }
        await scrollToY(page, 0); await page.screenshot({ path: path.join(OUT, `${v.id}-safe-hero.png`), scale: 'css' });
        check(G, 'landscape content clears the left/right notch insets', offenders.size === 0, `${offenders.size} elements: ${[...offenders].slice(0, 8).join(' | ')}`);
      }
    } catch (e) { check(G, 'suite ran', false, e.message.split('\n')[0]); } finally { await env.ctx.close(); }
  }
}

/* ------------------------------------------------------------------ GL over DOM text (enamel pixels inside text line boxes) */
async function overlapSuite(browser) {
  const dctx = await browser.newContext(); const decoder = await dctx.newPage();
  for (const v of [ALL_VIEWS[3], ALL_VIEWS[0]]) {
    const G = `${v.id} GL over text`;
    const env = await openPage(browser, v, { dsf: 1, wait: 2600 });
    const { page } = env;
    const hits = [];
    try {
      const docH = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < docH - v.h / 2; y += Math.round(v.h * 0.4)) {
        await scrollToY(page, y); await page.waitForTimeout(420);
        const boxes = await page.evaluate(() => {
          const out = [];
          const navBottom = document.querySelector('.nav-pill').getBoundingClientRect().bottom + 4; // text scrolled under the fixed nav (and its orange motion icon) is not "GL over text"
          // orange-by-design UI is skipped; underlined links stay in, their boxes are cropped above the underline below
          const skip = '.study-media, .hero-title, .btn-enamel, .pill-cta, .chip[aria-pressed="true"], .step-n, .signature, .sr-only, .sprite, .hp, dialog, .cursor, .scope, .dot, .twist, .stage-bar, .study-slot';
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            if (!n.nodeValue.trim()) continue;
            const el = n.parentElement; if (!el || el.closest(skip)) continue;
            // a closed <details> still reports line boxes for its hidden body, right over its own summary icon
            const det = el.closest('details'); if (det && !det.open && !el.closest('summary')) continue;
            const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue;
            const rg = document.createRange(); rg.selectNodeContents(n);
            [...rg.getClientRects()].forEach((r0) => {
              const r = { left: r0.left, right: r0.right, top: Math.max(r0.top, navBottom), bottom: r0.top + r0.height * 0.7 }; // below the nav, above underlines
              if (r.bottom - r.top < 4) return;
              if (r0.width > 4 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) out.push({ x: Math.max(0, r.left), y: Math.max(0, r.top), w: Math.min(innerWidth, r.right) - Math.max(0, r.left), h: Math.min(innerHeight, r.bottom) - Math.max(0, r.top), t: `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} "${n.nodeValue.trim().slice(0, 22)}"` });
            });
          }
          return out;
        });
        const buf = await page.screenshot({ scale: 'css' });
        const res = await decoder.evaluate(async ({ b64, boxes }) => {
          const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
          const data = x.getImageData(0, 0, c.width, c.height).data;
          return boxes.map((b) => {
            let n = 0;
            for (let yy = Math.floor(b.y); yy < Math.min(c.height, b.y + b.h); yy++) for (let xx = Math.floor(b.x); xx < Math.min(c.width, b.x + b.w); xx++) {
              const i = (yy * c.width + xx) * 4, r = data[i], g = data[i + 1], bl = data[i + 2];
              if (r > 110 && r > g * 1.7 && r > bl * 2.4 && g < 135) n++;
            }
            return { t: b.t, n, area: Math.round(b.w * b.h) };
          }).filter((q) => q.n > Math.max(30, q.area * 0.03));
        }, { b64: buf.toString('base64'), boxes });
        if (res.length) { hits.push(...res.map((q) => `y=${y}: ${q.t} ${q.n}px`)); await page.screenshot({ path: path.join(OUT, `${v.id}-overlap-y${y}.png`), scale: 'css' }); }
      }
      check(G, 'no enamel ribbon pixels inside DOM text lines at any scroll stop', hits.length === 0, hits.slice(0, 10).join(' | '));
    } catch (e) { check(G, 'suite ran', false, e.message.split('\n')[0]); } finally { await env.ctx.close(); }
  }
  await dctx.close();
}

/* ------------------------------------------------------------------ in-page anchors + the back button (phones) */
async function anchorsSuite(browser) {
  for (const v of [ALL_VIEWS[3], ALL_VIEWS[0]]) {
    const G = `${v.id} anchors`;
    const env = await openPage(browser, v);
    const { page } = env;
    const land = (sel) => page.evaluate((s) => { const h = document.querySelector(s).getBoundingClientRect(); const nb = document.querySelector('.nav-pill').getBoundingClientRect().bottom; return { top: Math.round(h.top), nav: Math.round(nb), y: Math.round(scrollY), url: location.hash, interest: document.getElementById('interest').value }; }, sel);
    try {
      // hero CTA → #contact, then the phone's back button must bring the hero back
      await scrollToY(page, 0);
      await tap(env, '.hero-actions a[href="#contact"]'); await waitScrollEnd(page); await page.waitForTimeout(500);
      const a = await land('#contact-title');
      check(G, 'hero "Start a project" lands on the contact heading below the nav', a.url === '#contact' && a.top >= a.nav + 2 && a.top < v.h * 0.62, J(a));
      await page.goBack({ timeout: 4000 }).catch(() => null); await page.waitForTimeout(1200);
      const b = await page.evaluate(() => ({ y: Math.round(scrollY), url: location.hash, doc: window.__doc }));
      check(G, 'back after an in-page anchor returns to where the visitor was (hero)', b.url === '' && b.y <= 2 && b.doc === (await page.evaluate(() => window.__doc)), `after back: hash="${b.url}" scrollY=${b.y} (expected ~0; history.scrollRestoration="manual" stops the browser restoring it)`);
      // footer back-to-top, then back
      const bottom = await page.evaluate(() => { scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }); return Math.round(scrollY); });
      await page.waitForTimeout(400);
      await tap(env, '.footer .back-top'); await waitScrollEnd(page, 9000); await page.waitForTimeout(300);
      const c = await page.evaluate(() => ({ y: Math.round(scrollY), url: location.hash }));
      check(G, 'footer "Back to top" reaches the top', c.y <= 2, J(c));
      await page.goBack({ timeout: 4000 }).catch(() => null); await page.waitForTimeout(1200);
      const d = await page.evaluate(() => ({ y: Math.round(scrollY), url: location.hash }));
      check(G, 'back after "Back to top" returns to the footer', Math.abs(d.y - bottom) <= 4, `expected ~${bottom}, got ${J(d)}`);
      // FAQ "Just ask me" → #contact-form, service link → #contact with the interest preselected
      await page.evaluate(() => document.getElementById('faq').scrollIntoView({ behavior: 'instant' })); await page.waitForTimeout(300);
      await tap(env, '.faq-note a'); await waitScrollEnd(page); await page.waitForTimeout(400);
      const e = await land('#contact-form');
      check(G, 'FAQ "Just ask me" lands on the form below the nav', e.top >= e.nav && e.top < v.h * 0.5, J(e));
      await page.evaluate(() => document.getElementById('expertise').scrollIntoView({ behavior: 'instant' })); await page.waitForTimeout(300);
      await tap(env, '.service[open] .svc-link'); await waitScrollEnd(page); await page.waitForTimeout(400);
      const f = await land('#contact-title');
      check(G, 'service link lands on contact below the nav and preselects its interest', f.top >= f.nav + 2 && f.interest === 'Website', J(f));
      check(G, 'no console errors', env.log.errors.length === 0, env.log.errors.join(' | '));
    } catch (err) { check(G, 'suite ran', false, err.message.split('\n')[0]); } finally { await env.ctx.close(); }
  }
}

/* ------------------------------------------------------------------ deep links (old + new anchors) */
async function deeplinkSuite(browser) {
  for (const v of [ALL_VIEWS[3], ALL_VIEWS[6]]) {
    for (const h of ['#work', '#services', '#manifesto', '#process', '#faq', '#contact']) {
      const env = await openPage(browser, v, { url: URL_ + h, wait: 1400 });
      try {
        const r = await env.page.evaluate((hh) => { const sec = document.querySelector(hh).closest('section'); const hd = sec.querySelector('h2'); const b = hd.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), nav: Math.round(document.querySelector('.nav-pill').getBoundingClientRect().bottom), y: Math.round(scrollY) }; }, h);
        check(`${v.id} deeplink`, `${h} loads with its heading visible below the nav`, r.y > 0 && r.top >= r.nav && r.top < v.h * 0.7, J(r));
      } catch (err) { check(`${v.id} deeplink`, `${h} ran`, false, err.message.split('\n')[0]); } finally { await env.ctx.close(); }
    }
  }
}

/* ------------------------------------------------------------------ legal pages on phones */
async function legalSuite(browser) {
  for (const v of [ALL_VIEWS[0], ALL_VIEWS[3], ALL_VIEWS[6]]) {
    for (const pg of ['privacy-policy.html', 'terms.html']) {
      const G = `${v.id} ${pg}`;
      const env = await openPage(browser, v, { url: URL_ + pg, wait: 1000 });
      const { page } = env;
      try {
        const a = await page.evaluate(auditLegal);
        check(G, 'no horizontal overflow', a.sw <= a.vw && a.wide.length === 0, `${a.sw}/${a.vw} ${a.wide.join(' | ')}`);
        check(G, 'tap targets ≥ 44×44 (non-inline)', a.small.length === 0, a.small.join(' | '));
        check(G, 'Zstore AI brand + credit badge pill + new email', a.brand && a.badge === '999px|8px 14px|rgba(255, 255, 255, 0.92)|none' && a.email && !a.old, J(a));
        const toc = page.locator('.legal-toc a').nth(3);
        if (await toc.isVisible()) {
          await tapL(env, toc); await waitScrollEnd(page); await page.waitForTimeout(300);
          const t = await page.evaluate(() => { const s = document.querySelector(location.hash); const hd = s.querySelector('h2') || s; return { hash: location.hash, top: Math.round(hd.getBoundingClientRect().top), nav: Math.round(document.querySelector('.nav-pill').getBoundingClientRect().bottom) }; });
          check(G, '"On this page" link lands its heading below the nav', t.top >= t.nav && t.top < v.h * 0.6, J(t));
        }
        check(G, 'no console errors / failed requests', env.log.errors.length === 0 && env.log.failed.length === 0, [...env.log.errors, ...env.log.failed].join(' | '));
      } catch (err) { check(G, 'suite ran', false, err.message.split('\n')[0]); } finally { await env.ctx.close(); }
    }
  }
}
function auditLegal() {
  const small = [], wide = [];
  document.querySelectorAll('a[href], button').forEach((el) => {
    const r = el.getBoundingClientRect(); if (!r.width) return;
    const cs = getComputedStyle(el);
    if ((r.width < 43.99 || r.height < 43.99) && !(cs.display === 'inline' && el.closest('p, li'))) small.push(`${el.textContent.trim().slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  });
  document.querySelectorAll('body *').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width && (r.right > innerWidth + 0.5 || r.left < -0.5) && !el.closest('.sprite, .skip, .sr-only')) wide.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} ${Math.round(r.left)}..${Math.round(r.right)}`); });
  const b = document.querySelector('a.zstore-badge'); const cs = b && getComputedStyle(b);
  const txt = document.documentElement.outerHTML;
  return { vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, small, wide: wide.slice(0, 6), brand: !!document.querySelector('.nav .brand use[href="#zmark"]'),
    badge: cs ? `${cs.borderTopLeftRadius}|${cs.paddingTop} ${cs.paddingRight}|${cs.backgroundColor}|${cs.boxShadow}` : 'missing', email: txt.includes('zstore.ai295@gmail.com'), old: /NZ ?Web|zvi(293){2}|nz-mark/i.test(txt) };
}

/* ------------------------------------------------------------------ work filter × project dialog */
async function filterSuite(browser) {
  const v = ALL_VIEWS[3]; const G = `${v.id} filter`;
  const env = await openPage(browser, v);
  const { page } = env;
  try {
    await tap(env, '[data-filter="product"]'); await page.waitForTimeout(500);
    const f = await page.evaluate(() => ({ visible: [...document.querySelectorAll('.study')].filter((s) => !s.hidden).map((s) => s.querySelector('h3').textContent), status: document.getElementById('filterStatus').textContent, sw: document.documentElement.scrollWidth }));
    check(G, '"Digital products" shows only Meridian, status updates, no overflow', J(f.visible) === J(['Meridian']) && f.status === 'Showing 01 study' && f.sw <= v.w, J(f));
    await tap(env, '.study:not([hidden]) .study-open'); await page.waitForTimeout(700);
    const next = (await page.textContent('#dialogNext')).replace('Next study: ', '');
    if (f.visible.includes(next)) check(G, '"Next study" stays inside the filtered set', true, next);
    else warn(G, '"Next study" jumps to a study the filter hides', `filter shows ${J(f.visible)}, button offers "${next}"`);
    await page.keyboard.press('Escape'); await page.waitForTimeout(800);
    const s = await state(page);
    check(G, 'dialog closes cleanly after filtering', !s.project && s.depth === 0 && !s.locked, J({ depth: s.depth, locked: s.locked }));
    await tap(env, '[data-filter="all"]'); await page.waitForTimeout(400);
    check(G, '"All work" restores the three studies', (await page.evaluate(() => [...document.querySelectorAll('.study')].filter((x) => !x.hidden).length)) === 3);
  } catch (err) { check(G, 'suite ran', false, err.message.split('\n')[0]); } finally { await env.ctx.close(); }
}

/* ------------------------------------------------------------------ popups under rotation, resize and fast back presses */
async function edgeSuite(browser) {
  // rotate a phone with the menu open
  {
    const v = ALL_VIEWS[3]; const G = `${v.id} edge`;
    const env = await openPage(browser, v);
    const { page } = env;
    try {
      await scrollToY(page, 3000);
      const s0 = await state(page);
      await tap(env, '.menu-btn'); await page.waitForTimeout(700);
      await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(900);
      const s1 = await state(page);
      await page.mouse.wheel(0, 600); await page.waitForTimeout(300);
      const s1b = await state(page);
      check(G, 'rotating to landscape keeps the menu open and the page locked', s1.menu && s1.locked && s1b.y === s1.y && Math.abs(s1b.mainTop - s1.mainTop) < 0.6, J({ menu: s1.menu, locked: s1.locked, mainTop: [r1(s1.mainTop), r1(s1b.mainTop)] }));
      await back(page);
      const s2 = await state(page);
      check(G, 'back after rotating closes the menu and releases the lock (same document)', !s2.menu && !s2.locked && s2.bodyPos === '' && s2.depth === 0 && s2.idx === s0.idx && s2.doc === s0.doc, J({ y: s2.y, depth: s2.depth, idx: s2.idx }));
      await page.setViewportSize({ width: v.w, height: v.h }); await page.waitForTimeout(600);
      // open → back 30ms later (before the sheet animation ends)
      await scrollToY(page, 1500);
      const r0 = await state(page);
      await page.locator('.menu-btn').tap(); await page.waitForTimeout(30); await page.goBack({ timeout: 4000 }).catch(() => null); await page.waitForTimeout(1000);
      const r1_ = await state(page);
      check(G, 'open then back within 30ms: closed, unlocked, scroll exact, same document', !r1_.menu && !r1_.locked && r1_.depth === 0 && r1_.y === r0.y && r1_.doc === r0.doc && r1_.idx === r0.idx, J({ y: [r0.y, r1_.y], depth: r1_.depth, idx: [r0.idx, r1_.idx] }));
      // stacked menu + study, two back presses without waiting
      await tap(env, '.menu-btn'); await page.waitForTimeout(600);
      await page.locator('#menu [data-project="lume"]').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await tap(env, '#menu [data-project="lume"]'); await page.waitForTimeout(700);
      await page.evaluate(() => { history.back(); history.back(); }); await page.waitForTimeout(1400);
      const q = await state(page);
      check(G, 'two instant back presses on a stacked menu + study close both, stay on the page', q.openCount === 0 && q.depth === 0 && !q.locked && q.doc === r0.doc && q.y === r0.y, J({ open: q.openCount, depth: q.depth, y: q.y, url: q.url }));
      check(G, 'no console errors', env.log.errors.length === 0, env.log.errors.join(' | '));
    } catch (err) { check(G, 'suite ran', false, err.message.split('\n')[0]); } finally { await env.ctx.close(); }
  }
  // a study read to the bottom, closed, then another study (or the same one, or one from the menu) opened: it must start at its top
  for (const v of [ALL_VIEWS[3], ALL_VIEWS[7]]) {
    const G = `${v.id} edge`;
    const env = await openPage(browser, v);
    const { page } = env;
    const opener = (k) => (v.w <= 900 ? `.study-open[data-project="${k}"]` : `.study-link[data-project="${k}"]`);
    const sheet = () => page.evaluate(() => { const s = document.querySelector('#project .sheet-scroll'); return { top: Math.round(s.scrollTop), title: document.getElementById('dialogTitle').textContent, visualTop: Math.round(document.getElementById('dialogVisual').getBoundingClientRect().top) }; });
    try {
      const runs = [];
      await tap(env, opener('atelier')); await page.waitForTimeout(700);
      await page.evaluate(() => { const s = document.querySelector('#project .sheet-scroll'); s.scrollTop = s.scrollHeight; }); await page.waitForTimeout(200);
      await page.keyboard.press('Escape'); await page.waitForTimeout(800);
      await tap(env, opener('lume')); await page.waitForTimeout(800);
      runs.push(['another study', await sheet()]);
      await page.evaluate(() => { document.querySelector('#project .sheet-scroll').scrollTop = 500; }); await page.waitForTimeout(200);
      await tap(env, '#project [data-close]'); await page.waitForTimeout(800);
      await tap(env, opener('lume')); await page.waitForTimeout(800);
      runs.push(['same study again', await sheet()]);
      if (v.touch) {
        await page.evaluate(() => { document.querySelector('#project .sheet-scroll').scrollTop = 500; }); await page.waitForTimeout(200);
        await page.goBack().catch(() => null); await page.waitForTimeout(800);
        await tap(env, '.menu-btn'); await page.waitForTimeout(600);
        await page.locator('#menu [data-project="meridian"]').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await tap(env, '#menu [data-project="meridian"]'); await page.waitForTimeout(800);
        runs.push(['from the menu', await sheet()]);
        await page.goBack().catch(() => null); await page.waitForTimeout(700);
      }
      await page.goBack().catch(() => null); await page.waitForTimeout(700);
      const bad = runs.filter(([, s]) => s.top !== 0 || s.visualTop < 0);
      if (bad.length) await page.screenshot({ path: path.join(OUT, `${v.id}-reopen-scrolled.png`), scale: 'css' }).catch(() => {});
      check(G, 'a reopened study sheet starts at its top (visual and title in view)', bad.length === 0, runs.map(([n, s]) => `${n}: ${J(s)}`).join(' | '));
    } catch (err) { check(G, 'reopen suite ran', false, err.message.split('\n')[0]); } finally { await env.ctx.close(); }
  }
  // Meridian's dashboard inside the dialog frame: nothing clipped, the Concept tag never covers a tile
  for (const v of [ALL_VIEWS[0], ALL_VIEWS[3], ALL_VIEWS[6]]) {
    const G = `${v.id} edge`;
    const env = await openPage(browser, v);
    const { page } = env;
    try {
      await tap(env, '.study-open[data-project="meridian"]'); await page.waitForTimeout(900);
      const r = await page.evaluate(() => {
        const root = document.querySelector('#dialogVisual .study-media');
        const box = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
        const m = box(root), tag = box(root.querySelector('.frame-tag')), sample = box(root.querySelector('.mer-sample'));
        const hit = (a, c) => a.l < c.r && a.r > c.l && a.t < c.b && a.b > c.t;
        const tiles = [...root.querySelectorAll('.mer-tile, .mer-card')].filter((t) => getComputedStyle(t).display !== 'none');
        return { frame: `${Math.round(m.r - m.l)}x${Math.round(m.b - m.t)}`, tagOver: tiles.filter((t) => hit(box(t), tag)).map((t) => t.querySelector('.mer-k').textContent),
          clipped: tiles.filter((t) => box(t).b > m.b - 1).map((t) => t.querySelector('.mer-k').textContent), sampleBelowFrame: Math.round(sample.b - m.b) };
      });
      const ok = r.tagOver.length === 0 && r.clipped.length === 0 && r.sampleBelowFrame <= 0;
      if (!ok) await page.screenshot({ path: path.join(OUT, `${v.id}-dialog-meridian-frame.png`), scale: 'css' });
      check(G, 'Meridian dashboard fits its dialog frame (no clipped tile, tag clear of tiles)', ok, J(r));
      await page.keyboard.press('Escape'); await page.waitForTimeout(700);
    } catch (err) { check(G, 'Meridian dialog suite ran', false, err.message.split('\n')[0]); } finally { await env.ctx.close(); }
  }
  // tablet menu open, window grows past the menu breakpoint
  {
    const v = ALL_VIEWS[5]; const G = `${v.id} edge`;
    const env = await openPage(browser, v);
    const { page } = env;
    try {
      await scrollToY(page, 2000);
      const s0 = await state(page);
      await tap(env, '.menu-btn'); await page.waitForTimeout(700);
      await page.setViewportSize({ width: 1200, height: 900 }); await page.waitForTimeout(1200);
      const s1 = await state(page);
      check(G, 'growing past 1080px closes the menu and removes its history entry', !s1.menu && !s1.locked && s1.depth === 0 && s1.idx === s0.idx && s1.y === s0.y, J({ menu: s1.menu, depth: s1.depth, idx: [s0.idx, s1.idx], y: [s0.y, s1.y] }));
    } catch (err) { check(G, 'suite ran', false, err.message.split('\n')[0]); } finally { await env.ctx.close(); }
  }
}

/* ------------------------------------------------------------------ run */
async function runChildren(keys) {
  const groups = Array.from({ length: Math.min(JOBS, VIEWS.length) }, () => []);
  VIEWS.forEach((v, i) => groups[i % groups.length].push(v.id));
  console.log(`running ${VIEWS.length} viewports in ${groups.length} parallel jobs: ${groups.map((g) => g.join('+')).join('  |  ')}`);
  await Promise.all(groups.map((g, gi) => new Promise((resolve) => {
    const part = path.join(OUT, `.part-${gi}.json`);
    try { fs.unlinkSync(part); } catch (e) {}
    const cp = spawn(process.execPath, [__filename, '--child', '--url', URL_, '--out', OUT, '--only', keys.join(','), '--views', g.join(','), '--part', part], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = ''; cp.stdout.on('data', (d) => { buf += d; }); cp.stderr.on('data', (d) => { buf += d; });
    cp.on('close', (code) => {
      try { results.push(...JSON.parse(fs.readFileSync(part, 'utf8'))); fs.unlinkSync(part); }
      catch (e) { results.push({ g: g.join('+'), n: 'child job completed', s: 'FAIL', info: `exit ${code}: ${buf.trim().split('\n').slice(-4).join(' / ')}` }); }
      resolve();
    });
  })));
  const order = (r) => { const i = ALL_VIEWS.findIndex((v) => r.g === v.id || r.g.startsWith(v.id + ' ')); return i < 0 ? 99 : i; };
  results.filter((r) => r.child !== false).sort((a, b) => order(a) - order(b)).forEach((r) => console.log(`${r.s.padEnd(4)}  [${r.g}] ${r.n}${r.info !== '' ? '  — ' + r.info : ''}`));
}

(async () => {
  const t0 = Date.now();
  const viewKeys = ['views', 'stacked', 'links', 'form'].filter(want);
  const browser = await chromium.launch(LAUNCH);
  try {
    if (!CHILD && want('frames')) await framesSuite(browser);   // first, while nothing else competes for the GPU
    if (!CHILD && want('rename')) await renameSuite(browser);
    if (viewKeys.length) {
      if (!CHILD && JOBS > 1 && VIEWS.length > 1) { results.forEach((r) => { r.child = false; }); await runChildren(viewKeys); }
      else for (const v of VIEWS) await viewSuite(browser, v);
    }
    if (!CHILD && want('anchors')) await anchorsSuite(browser);
    if (!CHILD && want('deeplink')) await deeplinkSuite(browser);
    if (!CHILD && want('legal')) await legalSuite(browser);
    if (!CHILD && want('filter')) await filterSuite(browser);
    if (!CHILD && want('edge')) await edgeSuite(browser);
    if (!CHILD && want('reduced')) await reducedSuite(browser);
    if (!CHILD && want('nogl')) await noglSuite(browser);
    if (!CHILD && want('safearea')) await safeAreaSuite(browser);
    if (!CHILD && want('overlap')) await overlapSuite(browser);
  } finally { await browser.close(); }
  if (CHILD) { fs.writeFileSync(opt('part'), JSON.stringify(results)); process.exit(0); }
  results.forEach((r) => { delete r.child; });
  const fails = results.filter((r) => r.s === 'FAIL'), warns = results.filter((r) => r.s === 'WARN');
  fs.writeFileSync(path.join(OUT, 'mobile-check-report.json'), JSON.stringify({ url: URL_, at: new Date().toISOString(), results }, null, 1));
  console.log('\n==================== SUMMARY ====================');
  console.log(`${results.filter((r) => r.s === 'PASS').length} passed, ${fails.length} failed, ${warns.length} warnings  (${Math.round((Date.now() - t0) / 1000)}s)`);
  fails.forEach((f) => console.log(`FAIL  [${f.g}] ${f.n}  — ${f.info}`));
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });

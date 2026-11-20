#!/usr/bin/env node
/* Deep-link checks: ?course=1B&mode=cells&bench=1 opens Galvanic Cells on the Cell Bench (and keeps it there), ?mode= honors each
   mode's course list, and the plain URL still opens the normal start screen. Runs at a phone size (390×844, touch) and a desktop size;
   fails on any console error.  Usage: NODE_PATH=<node_modules with playwright> node tools/check-deeplink.js */
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.error('Playwright not found. Run with NODE_PATH pointing at a node_modules that has playwright, e.g.\n  NODE_PATH=/path/to/node_modules node tools/check-deeplink.js'); process.exit(2); }
const path = require('path'), fs = require('fs'), url = require('url');
const ROOT = path.join(__dirname, '..'), GH = path.join(ROOT, '..');
const page0 = url.pathToFileURL(path.join(ROOT, 'index.html')).href;
const SIZES = [['phone', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }], ['desktop', { viewport: { width: 1280, height: 900 } }]];
let n = 0, fail = 0;
const ok = (c, m) => { n++; if (!c) { fail++; console.log('FAIL', m); } };
/* offline and repeatable: itsdrdan.github.io/<repo>/… is served from the sibling local clone when it exists; every other web request gets an empty reply */
async function route(ctx) {
  await ctx.route(/^https?:/, r => {
    const u = new URL(r.request().url());
    if (u.hostname === 'itsdrdan.github.io') { const f = path.join(GH, decodeURIComponent(u.pathname)); if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ path: f }); }
    return r.fulfill({ status: 200, body: '' });
  });
}
async function run(CASES) {
  const browser = await chromium.launch();
  for (const [size, opts] of SIZES) for (const c of CASES) {
    const ctx = await browser.newContext(opts); await route(ctx);
    const page = await ctx.newPage(), errs = [];
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', e => errs.push(String(e)));
    await page.goto(page0 + c.q, { waitUntil: 'load' }); await page.waitForTimeout(400);
    const f0 = fail, tag = size + ' ' + (c.q || '(no parameters)');
    try { await c.check(page, (cond, m) => ok(cond, tag + ': ' + m)); } catch (e) { ok(false, tag + ': ' + e.message); }
    ok(!errs.length, tag + ': console errors: ' + errs.join(' | '));
    console.log((fail > f0 ? '  ' : 'ok') + ' ' + tag);
    await ctx.close();
  }
  await browser.close();
  console.log(`\n${n - fail}/${n} deep-link checks passed`); process.exit(fail ? 1 : 0);
}
const isBench = page => page.evaluate(() => !!(state.q && state.q.bench) && !!document.querySelector('#questionArea .cb-svg, #questionArea svg') && /Cell Bench/.test(document.getElementById('questionArea').textContent));
run([
  { q: '', check: async (page, ok) => {
    ok(await page.evaluate(() => state.course === '1A' && state.mode === 'ox' && !state.quiz), 'CHEM 1A, Oxidation Numbers first');
    ok(!(await isBench(page)), 'no Cell Bench');
    ok(!(await page.locator('#modeGrid [data-mode="cells"]').count()), 'no Galvanic Cells card in 1A');
  } },
  { q: '?course=1B&mode=cells&bench=1', check: async (page, ok) => {
    ok(await page.evaluate(() => state.course === '1B' && state.mode === 'cells'), 'CHEM 1B, Galvanic Cells');
    ok(await page.locator('#modeGrid [data-mode="cells"].on').isVisible(), 'Galvanic Cells card is highlighted');
    ok(await page.locator('#questionArea').isVisible(), 'question area visible');
    ok(await isBench(page), 'first question is a Cell Bench');
    for (let i = 0; i < 8; i++) { await page.evaluate(() => next()); ok(await isBench(page), 'question ' + (i + 2) + ' is also a Cell Bench'); }
    ok(/mode=cells/.test(page.url()) && /course=1B/.test(page.url()), 'URL keeps its parameters');
  } },
  { q: '?course=1B&mode=cells', check: async (page, ok) => { ok(await page.evaluate(() => state.mode === 'cells'), 'Galvanic Cells opens'); ok(await isBench(page), 'first Galvanic Cells question is a bench (game rule)'); } },
  { q: '?course=1A&mode=cells&bench=1', check: async (page, ok) => { ok(await page.evaluate(() => state.course === '1A' && state.mode === 'ox'), 'cells is 1B only: 1A link falls back to the normal start'); ok(!(await isBench(page)), 'no Cell Bench in 1A'); } },
  { q: '?course=3A&mode=activity', check: async (page, ok) => { ok(await page.evaluate(() => state.course === '3A' && state.mode === 'activity'), '3A opens the activity series'); ok(await page.evaluate(() => activityBank().length >= 20 && activityBank().every(q => !/[FIB]r?₂|Cl|Rb|Ba|Mn|Cr|Co|Hg|Pt/.test(q.rxn) && !/^(?:\d+ )?(Li|K|Ca|Na)\(s\)/.test(q.rxn))), '3A uses the textbook short list only'); ok(await page.evaluate(() => !/Halogen/.test(document.getElementById('activityChart').innerText)), '3A chart has no halogens'); } },
  { q: '?course=1A&mode=activity', check: async (page, ok) => { ok(await page.evaluate(() => state.mode === 'activity'), 'other modes open too'); } },
]);

// Røyktest i Chromium: laster appen, fanger konsollfeil, går gjennom alle sider
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const LOCAL = {
  'three.min.js': 'node_modules/three/build/three.min.js',
  'jspdf.umd.min.js': 'node_modules/jspdf/dist/jspdf.umd.min.js',
  'pdf.min.js': 'node_modules/pdfjs-dist/build/pdf.min.js',
  'pdf.worker.min.js': 'node_modules/pdfjs-dist/build/pdf.worker.min.js',
};
async function open(opts = {}) {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext(Object.assign({ viewport: { width: 1280, height: 860 } }, opts));
  await ctx.route('https://cdnjs.cloudflare.com/**', r => { const f = r.request().url().split('/').pop(); const p = LOCAL[f]; return p ? r.fulfill({ path: path.join(__dirname, '..', p), contentType: 'application/javascript' }) : r.abort(); });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 3).join('\n')));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.join(__dirname, '../dist/huset-mitt-frittstaende.html'));
  await page.waitForFunction(() => window.HM && HM.state && document.querySelector('.nav button'));
  return { browser, ctx, page, errors };
}
module.exports = { open };
if (require.main === module) (async () => {
  const { browser, page, errors } = await open();
  const routes = ['oversikt', 'huset', 'importer', 'prosjekter', 'okonomi', 'kalender', 'lister', 'dokumentasjon', 'vedlikehold', 'tidslinje', 'versjoner', 'innstillinger', 'mer'];
  for (const r of routes) { await page.evaluate(r => HM.go(r), r); await page.waitForTimeout(300); }
  // demo
  await page.evaluate(() => HM.actions.enterDemo()); await page.waitForTimeout(600);
  for (const r of routes) { await page.evaluate(r => HM.go(r), r); await page.waitForTimeout(r === 'huset' ? 1500 : 300); }
  await page.evaluate(() => HM.go('prosjekt', { id: HM.state.projects[0].id }));
  for (const t of ['oversikt', 'oppgaver', 'okonomi', 'innkjop', 'filer']) { await page.evaluate(t => HM.go('prosjekt', { id: HM.state.projects[0].id, tab: t }), t); await page.waitForTimeout(200); }
  await page.evaluate(() => HM.go('rom', { id: HM.plan().rooms[0].id })); await page.waitForTimeout(300);
  fs.mkdirSync(path.join(__dirname, 'shots'), { recursive: true });
  await page.evaluate(() => HM.go('oversikt')); await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(__dirname, 'shots/oversikt-demo.png'), fullPage: false });
  await page.evaluate(() => { HM.houseMode = 'split'; HM.go('huset', { mode: 'split' }); }); await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(__dirname, 'shots/huset-demo.png') });
  console.log(errors.length ? errors.join('\n') : 'Ingen feil');
  await browser.close();
})();

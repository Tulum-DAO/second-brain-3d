// self-contained: puppeteer-core LAUNCHES chrome (child proc, no daemon), shoots, exits.
import puppeteer from '/home/shaw/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
import { globSync } from 'node:fs';
import fs from 'node:fs';
const [url, out, wait = '4000'] = process.argv.slice(2);
const bins = fs.globSync
  ? fs.globSync('/home/shaw/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome')
  : ['/home/shaw/.cache/puppeteer/chrome/linux-152.0.7977.42/chrome-linux64/chrome'];
const executablePath = bins.sort().at(-1);
const browser = await puppeteer.launch({
  executablePath,
  headless: 'shell' === 'never' ? false : 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + String(e).slice(0, 200)));
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, +wait));
await page.screenshot({ path: out });
console.log('shot →', out, fs.statSync(out).size, 'bytes');
console.log('CONSOLE ERRORS:', errs.length ? JSON.stringify(errs.slice(0, 6)) : 'none');
await browser.close();

// Diagnostic manuel : ouvre la version B publiée dans un vrai Chromium (format téléphone),
// avec trois zones bretonnes d'exemple, et note les requêtes qui échouent et les sources « non joignables ».
const { chromium, devices } = require('playwright');
const URL = process.argv[2] || 'https://hfoury.github.io/iriscope/bis/';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['Pixel 7'] });
  const pg = await ctx.newPage();
  const t0 = Date.now();
  const watch = /meteoalarm|air-quality|education\.gouv|geo\.api|risques|open-meteo|met\.no/;
  pg.on('requestfailed', q => watch.test(q.url()) && console.log(`ÉCHEC ${((Date.now() - t0) / 1000).toFixed(1)}s ${q.failure().errorText} ${q.url().slice(0, 140)}`));
  pg.on('response', r => watch.test(r.url()) && console.log(`OK ${((Date.now() - t0) / 1000).toFixed(1)}s ${r.status()} ${r.url().slice(0, 140)}`));
  pg.on('console', m => /cors|blocked|failed/i.test(m.text()) && console.log('CONSOLE', m.text().slice(0, 300)));
  const state = { sectors: [
    { id: 's1', name: 'Baden', mode: 'radius', value: 10, unit: 'km', lat: 47.618, lon: -2.919, dept: '56', water: 'mer', enabled: true },
    { id: 's2', name: 'Châteauneuf-du-Faou', mode: 'radius', value: 15, unit: 'km', lat: 48.188, lon: -3.817, dept: '29', water: 'aucun', enabled: true },
    { id: 's3', name: 'Paris', mode: 'radius', value: 10, unit: 'km', lat: 48.857, lon: 2.352, dept: '75', water: 'aucun', enabled: true } ],
    profiles: ['Hervé'], profile: 'Hervé', me: { name: 'Hervé', backdrop: 'day', asked: true }, prefs: { places: { 'Hervé': { home: 's1', work: 's2' } } } };
  await pg.goto(URL);
  await pg.evaluate(s => { localStorage.setItem('veille-locale-personal-v1', JSON.stringify(s)); localStorage.setItem('veille-locale-nouveautes-vues', '9.9.9'); }, state);
  await pg.reload();
  await pg.waitForTimeout(60000);
  const cache = await pg.evaluate(() => localStorage.getItem('veille-locale-cache-v3'));
  try { const c = JSON.parse(cache); console.log('ERREURS', JSON.stringify(c.errors), 'version', c.version, 'vigilances', (c.vigilance || []).length); } catch (e) { console.log('pas de cache', String(cache).slice(0, 200)); }
  const txt = await pg.evaluate(() => document.body.innerText);
  const m = txt.match(/Non joignable[^\n]*/); console.log('BANDEAU', m ? m[0] : 'aucun');
  await b.close();
})();

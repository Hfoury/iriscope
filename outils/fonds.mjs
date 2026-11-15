// Fonds d'écran de l'accueil (0.54.0) : une fois par semaine, la liste des « images remarquables » de Wikimedia Commons
// (paysages, côtes, montagnes, France), sous licence libre réutilisable commercialement, avec le nom du photographe.
// Publiée sur la branche « fonds » : fonds/index.json. Gratuit, sans clé ; les photos restent sur upload.wikimedia.org.
// Usage : node outils/fonds.mjs sortie
import fs from 'node:fs';
const OUT = process.argv[2] || 'sortie';
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'IriscopeFonds/1.0 (https://github.com/Hfoury/iriscope; fonds hebdomadaires)';
const ROOTS = ['Featured pictures of landscapes', 'Featured pictures of France', 'Featured pictures of coasts', 'Featured pictures of mountains', 'Featured pictures of lakes', 'Featured pictures of forests', 'Featured pictures of skies'];
const MAX = 2500, DEPTH = 2;
const OK_LIC = /^(cc0|public domain|pd|cc by(-sa)? ?[0-9.]*)/i;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function ask(params) {
  const u = API + '?' + new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let k = 0; k < 5; k++) {
    const r = await fetch(u, { headers: { 'User-Agent': UA } }).catch(() => null);
    if (r && r.ok) { const j = await r.json().catch(() => null); if (j) return j; }
    await sleep(3000 * (k + 1));
  }
  throw new Error('Commons injoignable : ' + u);
}
const strip = s => String(s || '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&#039;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const seenCat = new Set(), photos = new Map();
async function walk(cat, depth) {
  if (seenCat.has(cat) || photos.size >= MAX) return;
  seenCat.add(cat);
  let cont = {};
  const subs = [];
  do {
    const j = await ask({ action: 'query', generator: 'categorymembers', gcmtitle: 'Category:' + cat, gcmtype: 'file|subcat', gcmlimit: '50',
      prop: 'imageinfo', iiprop: 'url|size|extmetadata|mime', iiurlwidth: '1280', iiextmetadatafilter: 'Artist|LicenseShortName|NonFree|ObjectName', ...cont });
    for (const pg of (j.query && j.query.pages) || []) {
      if (pg.ns === 14) { subs.push(pg.title.replace(/^Category:/, '')); continue; }
      const ii = (pg.imageinfo || [])[0]; if (!ii || !/jpeg/.test(ii.mime || '')) continue;
      const m = ii.extmetadata || {};
      const lic = strip(m.LicenseShortName && m.LicenseShortName.value);
      if (!OK_LIC.test(lic) || /\b(nc|nd)\b/i.test(lic) || (m.NonFree && m.NonFree.value === 'true')) continue;
      if (ii.width < 1600 || ii.height < 900) continue;
      const artist = strip(m.Artist && m.Artist.value).slice(0, 60) || 'Auteur sur Wikimedia Commons';
      photos.set(pg.title, { u: ii.thumburl, w: ii.thumbwidth, h: ii.thumbheight, a: artist, l: lic, p: ii.descriptionshorturl || ii.descriptionurl, t: strip(m.ObjectName && m.ObjectName.value).slice(0, 80) || pg.title.replace(/^File:|\.[a-z]+$/gi, '') });
      if (photos.size >= MAX) break;
    }
    cont = j.continue || null;
    await sleep(600);
  } while (cont && photos.size < MAX);
  if (depth > 0) for (const s of subs) await walk(s, depth - 1);
}
for (const r of ROOTS) { await walk(r, DEPTH).catch(e => console.log('⚠️', r, e.message)); console.log(r, '→', photos.size, 'photos au total'); }
if (photos.size < 100) { console.log('Trop peu de photos, on garde la liste précédente'); process.exit(1); }
fs.mkdirSync(OUT + '/fonds', { recursive: true });
fs.writeFileSync(OUT + '/fonds/index.json', JSON.stringify({ at: new Date().toISOString(), source: 'Wikimedia Commons, images remarquables', photos: [...photos.values()] }));
console.log('Écrit :', photos.size, 'photos,', fs.statSync(OUT + '/fonds/index.json').size, 'octets');

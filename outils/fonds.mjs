// Fonds d'écran de l'accueil (0.54.0) : une fois par semaine, la liste des « images remarquables » de Wikimedia Commons
// (paysages, côtes, montagnes, France), sous licence libre réutilisable commercialement, avec le nom du photographe.
// Publiée sur la branche « fonds » : fonds/index.json. Gratuit, sans clé ; les photos restent sur upload.wikimedia.org.
// Usage : node outils/fonds.mjs sortie
import fs from 'node:fs';
const OUT = process.argv[2] || 'sortie';
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'IriscopeFonds/1.0 (https://github.com/Hfoury/iriscope; fonds hebdomadaires)';
const ROOTS = ['Featured pictures of landscapes', 'Featured pictures of France', 'Featured pictures of coasts', 'Featured pictures of mountains', 'Featured pictures of lakes', 'Featured pictures of forests', 'Featured pictures of skies'];
// chaque thème a sa part (sinon les paysages prennent toute la place et la France n'apparaît pas)
const MAX = 3000, PER_ROOT = { 'Featured pictures of France': 900 }, PER = 350, DEPTH = 2;
let cap = MAX;
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
  if (seenCat.has(cat) || photos.size >= cap) return;
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
      if (photos.size >= cap) break;
    }
    cont = j.continue || null;
    await sleep(600);
  } while (cont && photos.size < cap);
  if (depth > 0) for (const s of subs) await walk(s, depth - 1);
}
for (const r of ROOTS) { cap = Math.min(MAX, photos.size + (PER_ROOT[r] || PER)); await walk(r, DEPTH).catch(e => console.log('⚠️', r, e.message)); console.log(r, '→', photos.size, 'photos au total'); }
// Flickr (si le secret FLICKR_KEY existe) : licences libres réutilisables commercialement seulement
// 4 = CC BY 2.0, 5 = CC BY-SA 2.0, 9 = CC0, 10 = marque du domaine public ; jamais NC ni ND
const FLICKR_KEY = process.env.FLICKR_KEY || '';
const FL_LIC = { 4: 'CC BY 2.0', 5: 'CC BY-SA 2.0', 9: 'CC0', 10: 'Domaine public' };
if (FLICKR_KEY) {
  let n = 0;
  const FR = '-5.3,41.3,9.7,51.2'; // France métropolitaine
  for (const [q, bbox] of [['paysage', FR], ['landscape', FR], ['mer', FR], ['montagne', FR], ['landscape', ''], ['seascape', ''], ['mountains', '']]) {
    for (let page = 1; page <= 3; page++) {
      const u = 'https://api.flickr.com/services/rest/?' + new URLSearchParams({ method: 'flickr.photos.search', api_key: FLICKR_KEY, format: 'json', nojsoncallback: '1',
        text: q, license: '4,5,9,10', content_type: '1', media: 'photos', safe_search: '1', sort: 'interestingness-desc', per_page: '250', page: String(page),
        extras: 'owner_name,license,url_l,o_dims', ...(bbox ? { bbox } : {}) });
      const j = await fetch(u, { headers: { 'User-Agent': UA } }).then(r => r.json()).catch(() => null);
      if (!j || j.stat !== 'ok') { console.log('⚠️ Flickr :', j && j.message); break; }
      for (const x of j.photos.photo || []) {
        if (!x.url_l || !FL_LIC[x.license] || Number(x.width_l) < 1000) continue;
        const k = 'flickr:' + x.id; if (photos.has(k)) continue;
        photos.set(k, { u: x.url_l, w: Number(x.width_l), h: Number(x.height_l), a: String(x.ownername || 'Photographe Flickr').slice(0, 60), l: FL_LIC[x.license], p: `https://www.flickr.com/photos/${x.owner}/${x.id}`, t: String(x.title || '').slice(0, 80), s: 'Flickr' });
        n++;
      }
      await sleep(1100);
    }
  }
  console.log('Flickr →', n, 'photos');
}
if (photos.size < 100) { console.log('Trop peu de photos, on garde la liste précédente'); process.exit(1); }
fs.mkdirSync(OUT + '/fonds', { recursive: true });
fs.writeFileSync(OUT + '/fonds/index.json', JSON.stringify({ at: new Date().toISOString(), source: 'Wikimedia Commons (images remarquables) et Flickr (licences libres)', photos: [...photos.values()] }));
console.log('Écrit :', photos.size, 'photos,', fs.statSync(OUT + '/fonds/index.json').size, 'octets');

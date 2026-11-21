// Salles de cinéma de France (CNC, via data.culture.gouv.fr, Licence Ouverte) : complète les salles OpenStreetMap de l'appli.
// node outils/cinemas.mjs --explore : affiche les jeux de données et leurs champs ; sinon écrit <dossier>/cinemas/index.json
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const CNC_XLSX = 'https://www.cnc.fr/documents/36995/158946/exploitation+-+liste+des+%C3%A9tablissements+actifs+-.xlsx/785df5b6-8c1d-fd61-6a72-548ecafa382a';
const HOST = 'https://data.culture.gouv.fr/api/explore/v2.1';
const UA = { 'User-Agent': 'Iriscope-donnees/1.0 (cinemas)', Accept: 'application/json' };
async function get(url) {
  let last;
  for (let k = 0; k < 3; k++) {
    try { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
    catch (e) { last = e; await new Promise(res => setTimeout(res, 3000 * (k + 1))); }
  }
  throw last;
}
if (args.includes('--explore')) {
  const j = await get('https://www.data.gouv.fr/api/1/datasets/?q=' + encodeURIComponent('établissements cinématographiques') + '&page_size=10');
  for (const d of j.data || []) {
    console.log('JEU', d.title, '|', d.organization && d.organization.name, '|', d.license, '|', d.id, '|', d.last_update);
    for (const r of (d.resources || []).slice(0, 6)) console.log('   RES', r.format, '|', r.title, '|', r.url, '|', r.last_modified);
  }
  const XLSX = (await import('xlsx')).default;
  const buf = Buffer.from(await (await fetch(CNC_XLSX, { headers: { 'User-Agent': UA['User-Agent'] } })).arrayBuffer());
  const wb = XLSX.read(buf);
  for (const n of wb.SheetNames) { const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 }); console.log('FEUILLE', n, rows.length); rows.slice(0, 6).forEach(r => console.log('LIGNE', JSON.stringify(r).slice(0, 900))); }
  process.exit(0);
}

// ---------- construction de la liste ----------
const OUT = path.join(args.find(a => !a.startsWith('--')) || 'sortie', 'cinemas');
const norm = x => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const STOP = new Set(['cinema', 'cine', 'le', 'la', 'les', 'l', 'de', 'du', 'des', 'salle', 'salles', 'et', 'd', 'a', 'au', 'cgr', 'megarama', 'pathe', 'gaumont', 'ugc', 'kinepolis', 'cineville', 'mk2', 'cinemovida', 'mega', 'cinema', 'cinemas', 'ciné', 'complexe', 'multiplexe']);
const toks = x => norm(x).split(' ').filter(w => w.length > 1 && !STOP.has(w));
const XLSX = (await import('xlsx')).default;
const wb = XLSX.read(Buffer.from(await (await fetch(CNC_XLSX, { headers: { 'User-Agent': UA['User-Agent'] } })).arrayBuffer()));
const sheet = wb.SheetNames.filter(n => /^\d{4}$/.test(n)).sort().pop();
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1 });
const h = rows.findIndex(r => r && r.includes('NomEtab'));
const head = rows[h];
const col = n => head.indexOf(n);
const cnc = rows.slice(h + 1).filter(r => r && r[col('NomEtab')]).map(r => ({
  n: r[col('NAutoC')], name: String(r[col('NomEtab')]).trim(), screens: +r[col('Ecrans')] || null, seats: +r[col('fauteuils')] || null,
  insee: String(r[col('DEPCOM')]).padStart(5, '0'), commune: String(r[col('COMMUNE')] || '').trim(),
  ae: /oui/i.test(r[col('AE')] || ''), itin: /itin/i.test(r[col('genre')] || ''),
}));
console.log(`CNC (${sheet}) : ${cnc.length} établissements`);
// centres des communes (et arrondissements de Paris, Lyon, Marseille) : position de secours
const centre = {};
for (const t of ['', '&type=arrondissement-municipal']) {
  const list = await get(`https://geo.api.gouv.fr/communes?fields=code,centre${t}&format=json`);
  for (const c of list) if (c.centre) centre[c.code] = c.centre.coordinates;
}
// salles OpenStreetMap de France entière (métropole et outre-mer) : position exacte quand le nom correspond
let osm = [];
try {
  const q = '[out:json][timeout:240];area["ISO3166-1"="FR"][admin_level=2]->.a;nwr["amenity"="cinema"](area.a);out center tags;';
  for (const ep of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
    try {
      const r = await fetch(ep, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'User-Agent': UA['User-Agent'], 'Content-Type': 'application/x-www-form-urlencoded' } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      osm = ((await r.json()).elements || []).map(e => { const c = e.center || e; return c.lat == null ? null : { lat: c.lat, lon: c.lon, t: toks((e.tags || {}).name) }; }).filter(Boolean);
      break;
    } catch (e) { console.log(`Overpass ${ep} : ${e.message}`); }
  }
} catch (e) { /* positions des communes seulement */ }
console.log(`OpenStreetMap : ${osm.length} salles`);
const dist = (a, b, c, d) => { const R = 6371, x = (c - a) * Math.PI / 180, y = (d - b) * Math.PI / 180; const k = Math.sin(x / 2) ** 2 + Math.cos(a * Math.PI / 180) * Math.cos(c * Math.PI / 180) * Math.sin(y / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(k)); };
let exact = 0, approx = 0, none = 0;
const list = [];
// chaque salle OpenStreetMap ne sert qu'une fois : on attribue d'abord les meilleures correspondances (nom en commun, puis proximité)
const pairs = [];
cnc.forEach((c, ci) => {
  const ce = centre[c.insee];
  if (!ce) return;
  const tk = toks(c.name);
  osm.forEach((o, oi) => {
    const d = dist(ce[1], ce[0], o.lat, o.lon);
    if (d > 15) return;
    const common = tk.filter(w => o.t.includes(w)).length;
    const score = common ? common * 10 - d : (d < 1.5 && !tk.length ? 1 : 0);
    if (score > 0) pairs.push([score, ci, oi]);
  });
});
pairs.sort((a, b) => b[0] - a[0]);
const pick = {}, used = new Set();
for (const [, ci, oi] of pairs) if (pick[ci] == null && !used.has(oi)) { pick[ci] = oi; used.add(oi); }
cnc.forEach((c, ci) => {
  const ce = centre[c.insee];
  let lat = ce ? ce[1] : null, lon = ce ? ce[0] : null, prec = 0;
  if (pick[ci] != null) { lat = osm[pick[ci]].lat; lon = osm[pick[ci]].lon; prec = 1; }
  if (lat == null) { none++; console.log('SANS POSITION', c.insee, c.commune, c.name); return; }
  prec ? exact++ : approx++;
  list.push([c.n, c.name, c.screens, c.seats, c.insee, c.commune, c.ae ? 1 : 0, c.itin ? 1 : 0, Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5, prec]);
});
console.log('Départements :', Object.entries(list.reduce((m, r) => { const d = r[4].slice(0, r[4].startsWith('97') ? 3 : 2); m[d] = (m[d] || 0) + 1; return m; }, {})).filter(([d]) => /^(97|2A|2B|20)/.test(d)).map(x => x.join(':')).join(' '));
console.log(`Positions : ${exact} exactes (OpenStreetMap), ${approx} au centre de la commune, ${none} sans position`);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ updated: new Date().toISOString(), source: `CNC, liste des établissements actifs (${sheet}), Licence Ouverte ; positions OpenStreetMap (ODbL) ou centre de la commune (IGN)`,
  cols: ['n', 'nom', 'ecrans', 'fauteuils', 'insee', 'commune', 'artEtEssai', 'itinerant', 'lat', 'lon', 'positionExacte'], list }));
console.log(`Écrit : ${Math.round(fs.statSync(path.join(OUT, 'index.json')).size / 1024)} Ko`);

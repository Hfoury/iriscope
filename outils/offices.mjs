// Offices de tourisme (24 nov 2026, idée d'Hervé) : quand une mairie n'a pas d'agenda lisible, l'appli propose celui de l'office de tourisme.
// Source : DATAtourisme (Licence Ouverte 2.0, usage commercial permis), lieux de type TouristInformationCenter, avec leur site officiel.
// Rien n'est deviné : seule l'adresse publiée par l'office lui-même (hasContact.homepage, sinon celle de son éditeur) est gardée.
// Résultat : <dossier>/sources/offices.json { tuiles: { "<lat*2>_<lon*2>": [{ n, la, lo, i (insee), c (commune), u (site), e (mail) }] } }
// Usage : DATATOURISME_KEY=... node outils/offices.mjs sortie
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.DATATOURISME_KEY;
if (!KEY) { console.error('Secret DATATOURISME_KEY absent'); process.exit(2); }
const OUT = path.join(process.argv[2] || 'sortie', 'sources');
const MAX_REQ = 400;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fr = v => { if (v == null) return ''; if (typeof v === 'string') return v; if (Array.isArray(v)) return fr(v[0]); if (typeof v === 'object') return fr(v.fr ?? v['@fr'] ?? v.value ?? Object.values(v)[0]); return String(v); };
const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
const tileOf = (lat, lon) => `${Math.floor(lat * 2)}_${Math.floor(lon * 2)}`;
const okUrl = u => /^https?:\/\/[^\s]+\.[a-z]{2,}/i.test(String(u || '')) && !/facebook\.|instagram\.|twitter\.|x\.com|youtube\./i.test(u);
async function get(url) {
  for (let k = 0; ; k++) {
    const res = await fetch(url, { headers: { 'X-API-Key': KEY, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) }).catch(e => ({ ok: false, status: 0, text: async () => e.message }));
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500 || res.status === 0) && k < 4) { await sleep(5000 * (k + 1)); continue; }
    throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}
const u = new URL('https://api.datatourisme.fr/v1/placeOfInterest');
u.searchParams.set('page_size', '100');
u.searchParams.set('lang', 'fr');
u.searchParams.set('fields', 'uuid,label,type,isLocatedAt.geo,isLocatedAt.address,hasContact.homepage,hasContact.email,hasBeenCreatedBy');
u.searchParams.set('filters', 'type[in]=TouristInformationCenter');
let url = u.toString(), req = 0, seen = 0;
const out = {}, byKey = new Set();
let total = null;
while (url && req < MAX_REQ) {
  const j = await get(url); req++;
  if (total == null) {
    total = j.meta && j.meta.total;
    console.log(`Offices annoncés par l'API : ${total}`);
    if (!(total > 0) || total > 20000) { console.log('Filtre non appliqué par l\'API : arrêt sans rien publier'); process.exit(0); }
  }
  for (const o of j.objects || []) {
    seen++;
    if (!arr(o.type).some(t => /TouristInformationCenter/.test(String(t)))) continue;
    const loc = arr(o.isLocatedAt)[0] || {}, g = loc.geo || {};
    const lat = Number(g.latitude), lon = Number(g.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const ad = arr(loc.address)[0] || {}, city = ad.hasAddressCity || {};
    const c = arr(o.hasContact)[0] || {}, by = o.hasBeenCreatedBy || {};
    const site = [...arr(c.homepage), ...arr(by.homepage)].find(okUrl);
    if (!site) continue;
    const n = fr(o.label).replace(/\s+/g, ' ').trim().slice(0, 100);
    const key = `${site}|${city.insee || tileOf(lat, lon)}`;
    if (byKey.has(key)) continue; byKey.add(key);
    const it = { n, la: +lat.toFixed(5), lo: +lon.toFixed(5), i: city.insee || '', c: fr(city.label) || fr(ad.addressLocality), u: site };
    const mail = arr(c.email).find(e => /@/.test(e)); if (mail) it.e = mail;
    (out[tileOf(lat, lon)] ||= []).push(it);
  }
  url = j.meta && j.meta.next;
  await sleep(300);
}
const n = Object.values(out).flat().length;
console.log(`${seen} fiches lues, ${n} offices gardés avec un site, ${Object.keys(out).length} tuiles, ${req} requêtes`);
for (const v of ['29', '56', '35', '13', '09']) console.log(`  dép. ${v} :`, Object.values(out).flat().filter(x => String(x.i).startsWith(v)).slice(0, 6).map(x => `${x.n} (${x.c}) ${x.u}`).join(' | '));
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'offices.json'), JSON.stringify({ version: 1, updated: new Date().toISOString(), note: "Offices de tourisme (DATAtourisme, Licence Ouverte 2.0). Lien vers leur site officiel seulement.", tuiles: out }));

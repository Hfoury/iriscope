// Collecte nocturne des fêtes et manifestations DATAtourisme (Licence Ouverte 2.0, usage commercial permis, source à citer).
// Résultat : <dossier>/evenements/t/<lat>_<lon>.json, une tuile d'un demi-degré (environ 55 × 37 km) lue par l'appli selon la position
// du secteur (pas besoin de connaître le département, et les secteurs à cheval sur deux départements sont couverts),
// + <dossier>/evenements/index.json (totaux par département, pour le suivi)
// Usage : DATATOURISME_KEY=... node outils/evenements.mjs sortie
import fs from 'node:fs';
import path from 'node:path';
import { lireAgendas } from './agendas.mjs';

const KEY = process.env.DATATOURISME_KEY;
if (!KEY) { console.error('Secret DATATOURISME_KEY absent : ajoute-le dans Settings > Secrets and variables > Actions.'); process.exit(2); }
const OUT = path.join(process.argv[2] || 'sortie', 'evenements');
const API = 'https://api.datatourisme.fr/v1/entertainmentAndEvent';
const DAYS = 30, MAX_REQ = 900; // la limite de l'API est de 1 000 requêtes par heure
const day = d => d.toISOString().slice(0, 10);
const now = new Date(), from = day(now), to = day(new Date(now.getTime() + DAYS * 86400000));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const fr = v => { // un texte peut arriver en chaîne, en { fr: … }, en { "@fr": … } ou en tableau
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return fr(v[0]);
  if (typeof v === 'object') return fr(v.fr ?? v['@fr'] ?? v.value ?? Object.values(v)[0]);
  return String(v);
};
const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);

async function get(url, tries = 4) {
  for (let k = 0; ; k++) {
    const res = await fetch(url, { headers: { 'X-API-Key': KEY, Accept: 'application/json' } });
    if (res.ok) return res.json();
    const body = (await res.text()).slice(0, 300);
    if ((res.status === 429 || res.status >= 500) && k < tries) { await sleep(5000 * (k + 1)); continue; }
    throw new Error(`HTTP ${res.status} ${body}`);
  }
}

function build(filters) {
  const u = new URL(API);
  u.searchParams.set('page_size', '100');
  u.searchParams.set('lang', 'fr');
  u.searchParams.set('fields', 'uuid,label,type,isLocatedAt.geo,isLocatedAt.address,takesPlaceAt,hasDescription,hasContact.homepage,hasTheme,lastUpdate,hasRepresentation');
  if (filters) u.searchParams.set('filters', filters);
  return u.toString();
}


// Affiche de l'événement (b24) : première image fournie par l'organisateur.
// i = adresse https de l'image, ic = crédit, il = 1 si la licence déclarée autorise l'usage commercial (CC BY, BY-SA, CC0, Licence Ouverte, domaine public),
// 2 si aucune licence n'est déclarée (affichée avec crédit, réglable par l'utilisateur), 0 si la licence l'interdit (« NC » ou « ND ») :
// dans ce cas l'appli propose seulement « Voir l'affiche chez l'organisateur ».
const OPEN = /(^|[^a-z])(by|by-sa|cc0|cc-by|cc-by-sa|licence ouverte|etalab|domaine public|public domain)(\s|$|[^a-z-])/i;
function affiche(o) {
  for (const rep of arr(o.hasRepresentation)) {
    const url = arr(arr(rep.hasRelatedResource)[0]?.locator)[0];
    if (!url || !/^https?:\/\//i.test(url)) continue;
    if (/\.(pdf|svg|gif)(\?|$)/i.test(url)) continue;
    const ann = arr(rep.hasAnnotation)[0] || {};
    const lic = String(arr(ann.isCoveredBy)[0] || '');
    const libre = !!lic && !/(^|[^a-z])(nc|nd)([^a-z]|$)/i.test(lic) && OPEN.test(lic);
    const credit = String(arr(ann.credits)[0] || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return { i: url.replace(/^http:/, 'https:'), ...(credit && !/^non communiqu/i.test(credit) ? { ic: credit } : {}), il: libre ? 1 : lic ? 0 : 2 };
  }
  return {};
}
function toEvent(o) {
  const loc = arr(o.isLocatedAt)[0] || {};
  const geo = loc.geo || {};
  const lat = Number(geo.latitude ?? geo.lat), lon = Number(geo.longitude ?? geo.lon ?? geo.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const ad = arr(loc.address)[0] || {};
  const city = ad.hasAddressCity || {};
  const insee = String(city.insee || '');
  const cp = String(ad.postalCode || '');
  // département : 2A/2B, 971 à 976 et collectivités d'outre-mer (3 chiffres), sinon 2 chiffres
  const code = insee || cp;
  const dept = String((city.isPartOfDepartment && city.isPartOfDepartment.insee) || (/^9[78]/.test(code) ? code.slice(0, 3) : code.slice(0, 2)) || '');
  if (!dept) return null;
  const periods = arr(o.takesPlaceAt).map(p => ({
    s: String(p.startDate || '').slice(0, 10), e: String(p.endDate || p.startDate || '').slice(0, 10),
    st: String(p.startTime || '').match(/\d{2}:\d{2}/)?.[0] || '', et: String(p.endTime || '').match(/\d{2}:\d{2}/)?.[0] || '',
  })).filter(p => p.s && p.e >= from && p.s <= to).sort((a, b) => a.s.localeCompare(b.s)).slice(0, 12);
  if (!periods.length) return null;
  const desc = arr(o.hasDescription).map(d => fr(d.shortDescription ?? d.description ?? d)).find(Boolean) || '';
  return { dept, ev: {
    id: o.uuid, t: fr(o.label).trim().slice(0, 140), lat: +lat.toFixed(5), lon: +lon.toFixed(5),
    c: fr(city.label) || fr(ad.addressLocality), a: fr(ad.streetAddress).slice(0, 80), cp,
    p: periods.slice(0, 6), d: desc.replace(/\s+/g, ' ').trim().slice(0, 300),
    k: [...arr(o.type).map(fr), ...arr(o.hasTheme).map(t => fr(t.label ?? t))].filter(x => x && !/^(schema:|PointOfInterest|EntertainmentAndEvent)/.test(x)).slice(0, 8),
    u: arr(arr(o.hasContact)[0]?.homepage)[0] || '',
    ...affiche(o),
  } };
}

const byDept = {}, byTile = {};
export const tileOf = (lat, lon) => `${Math.floor(lat * 2)}_${Math.floor(lon * 2)}`;
let req = 0, seen = 0, kept = 0, sample = null;
// d'abord avec le filtre de dates ; si l'API le refuse, tout le catalogue des manifestations et tri ici
let url = build(`takesPlaceAt.endDate[gte]=${from} AND takesPlaceAt.startDate[lte]=${to}`);
let first;
try { first = await get(url); } catch (e) { console.log('Filtre de dates refusé, collecte sans filtre :', e.message); url = build(''); first = await get(url); }
req++;
console.log('Total annoncé :', first.meta && first.meta.total, '· pages :', first.meta && first.meta.total_pages);
for (let page = first; page; ) {
  for (const o of page.objects || []) {
    seen++;
    if (!sample) sample = o;
    const r = toEvent(o);
    if (!r) continue;
    byDept[r.dept] = (byDept[r.dept] || 0) + 1;
    (byTile[tileOf(r.ev.lat, r.ev.lon)] ||= []).push(r.ev); kept++;
  }
  const next = page.meta && page.meta.next;
  if (!next || req >= MAX_REQ) { if (next) console.log(`Arrêt à ${MAX_REQ} requêtes : collecte partielle.`); break; }
  await sleep(250);
  page = await get(String(next).replace(/^http:/, 'https:').replace(/([?&])api_key=[^&]*&?/, '$1'));
  req++;
  if (req % 25 === 0) console.log(`${req} requêtes · ${seen} lus · ${kept} gardés`);
}
// aperçu de la structure reçue (sans la clé), utile pour ajuster le script
console.log('Exemple reçu :', JSON.stringify(sample, null, 1).slice(0, 2500));
if (!kept) { console.error('Aucun événement exploitable : rien n\'est publié.'); process.exit(1); }

// Agendas ouverts d'appoint (outils/agendas.mjs) : versés dans les mêmes tuiles, chacun avec son crédit (champ s),
// sauf ce que DATAtourisme donne déjà (même jour, à moins de 400 m, titres qui commencent pareil).
const norm = t => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14);
const km = (a, b, c, d) => Math.hypot((a - c) * 111, (b - d) * 111 * Math.cos(a * Math.PI / 180));
const extra = await lireAgendas(from, to);
let ajoutes = 0;
for (const ev of extra.events) {
  const list = (byTile[tileOf(ev.lat, ev.lon)] ||= []);
  const k = norm(ev.t), d0 = ev.p[0].s;
  if (list.some(x => x.p[0].s === d0 && km(x.lat, x.lon, ev.lat, ev.lon) < 0.4 && (norm(x.t).startsWith(k) || k.startsWith(norm(x.t))))) continue;
  list.push(ev); ajoutes++;
  const dep = /^\d{5}$/.test(ev.cp) ? ev.cp.slice(0, 2) : '';
  if (dep) byDept[dep] = (byDept[dep] || 0) + 1;
}
console.log(`Agendas d'appoint : ${extra.events.length} lus, ${ajoutes} ajoutés après dédoublonnage.`);

fs.mkdirSync(path.join(OUT, 't'), { recursive: true });
const index = { source: 'DATAtourisme (Licence Ouverte 2.0) et agendas ouverts d\'appoint', updated: now.toISOString(), from, to, total: kept + ajoutes, datatourisme: kept, agendas: extra.bilan, tiles: Object.keys(byTile).length, depts: byDept };
for (const [t, list] of Object.entries(byTile)) {
  list.sort((a, b) => a.p[0].s.localeCompare(b.p[0].s));
  fs.writeFileSync(path.join(OUT, 't', `${t}.json`), JSON.stringify({ updated: index.updated, events: list }));
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
fs.writeFileSync(path.join(OUT, '..', 'README.md'), `Données publiées automatiquement pour l'appli Iriscope.\n\nÉvénements : DATAtourisme (Licence Ouverte 2.0) et agendas ouverts (${Object.values(extra.bilan).map(b => b.nom).join(', ')}), crédit dans le champ s de chaque événement. Mise à jour : ${index.updated}. ${kept} événements, ${Object.keys(byDept).length} départements, ${index.tiles} tuiles.\n`);
console.log(`${kept} événements gardés sur ${seen}, ${Object.keys(byDept).length} départements, ${index.tiles} tuiles, ${req} requêtes.`);

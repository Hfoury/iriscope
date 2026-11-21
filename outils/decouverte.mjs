// Découverte automatique des sources (21 nov 2026) : on part des vrais éditeurs publics, pas d'URL devinée.
//  1. L'annuaire officiel de l'administration (DILA, Licence Ouverte) donne le site de chaque mairie, intercommunalité et préfecture,
//     avec la commune (code Insee) et la position.
//  2. Chaque nuit, une partie de ces sites est visitée (page d'accueil + page « agenda » si elle existe), poliment : un seul
//     passage par site tous les 60 jours, délai entre requêtes, pages limitées en taille, adresses privées refusées.
//  3. On y repère les agendas : flux iCal (.ics / webcal), RSS/Atom déclarés, agendas OpenAgenda intégrés.
//  4. Chaque flux est testé (lisible ? combien d'éléments ? des dates à venir ?) puis classé :
//       - « couvert »   : agenda OpenAgenda déjà lu par Iriscope (export ouvert) ;
//       - « actif »     : flux d'événements datés avec une licence ouverte déclarée sur le site (réutilisation commerciale permise) ;
//       - « lien »      : agenda réel mais licence non déclarée : l'appli propose seulement un lien vers l'agenda de l'éditeur ;
//       - « annonces »  : flux d'actualités sans dates d'événements (jamais transformé en sorties) ;
//       - « quarantaine » : illisible, vide, trop gros ou suspect (motif noté, revu au passage suivant).
//  Rien n'est publié dans l'appli sans licence vérifiée. Gratuit, sans clé. Publie sources/decouverte.json et sources/liens.json.
// Usage : node outils/decouverte.mjs <annuaire.json> <sortie> [ancien-decouverte.json] [--max=400]
import fs from 'node:fs';
import path from 'node:path';

const [ANNU, OUT = 'sortie', PREV = ''] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const MAX = Number((process.argv.find(a => a.startsWith('--max=')) || '--max=800').slice(6));
const UA = 'iriscope-sources/1.0 (+https://github.com/Hfoury/iriscope; agendas publics)';
const now = new Date();
const today = now.toISOString().slice(0, 10);
const REVISIT = 60 * 86400000;
const tileOf = (lat, lon) => `${Math.floor(lat * 2)}_${Math.floor(lon * 2)}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
// licence cherchée dans le TEXTE visible (sans scripts ni styles : « #cc0 » d'une couleur ne compte pas), en mots entiers
const OPEN_LIC = /\b(Licence Ouverte|Open Licen[cs]e|Etalab|CC[- ]BY(?:[- ]SA)?(?![- ]?NC)(?:[- ]\d\.\d)?|ODbL|CC0 ?1\.0|Creative Commons (?:Attribution|Zero)(?! ?-? ?Pas d'Utilisation Commerciale)(?! ?-? ?NonCommercial))\b/;
const visible = html => html.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// ---------- 1. Éditeurs depuis l'annuaire ----------
const TYPES = { mairie: 'mairie', epci: 'interco', prefecture: 'préfecture', sous_pref: 'préfecture' };
const raw = JSON.parse(fs.readFileSync(ANNU, 'utf8'));
const editeurs = [];
for (const r of raw.service || []) {
  const piv = (r.pivot || []).map(p => p.type_service_local);
  const t = piv.map(x => TYPES[x]).find(Boolean) || (/^Préfecture/.test(r.nom || '') ? 'préfecture' : null);
  if (!t) continue;
  const site = ((r.site_internet || [])[0] || {}).valeur;
  if (!site || !/^https?:\/\//i.test(site)) continue;
  // mairies déléguées, annexes : on garde la mairie principale (le site est souvent le même)
  const a = (r.adresse || []).find(x => x.latitude) || {};
  editeurs.push({ id: r.id, nom: r.nom, type: t, insee: r.code_insee_commune || '', lat: Number(a.latitude) || null, lon: Number(a.longitude) || null, site: site.trim() });
}
// Îles Anglo-Normandes (dépendances de la Couronne britannique, absentes de l'annuaire français) : éditeurs publics officiels ajoutés à la main
for (const e of [
  { id: 'je-gov', nom: 'Gouvernement de Jersey', type: 'interco', insee: 'JE', lat: 49.1858, lon: -2.1100, site: 'https://www.gov.je/' },
  { id: 'je-visit', nom: 'Visit Jersey (office du tourisme)', type: 'interco', insee: 'JE', lat: 49.1858, lon: -2.1100, site: 'https://www.jersey.com/' },
  { id: 'gg-gov', nom: 'Gouvernement de Guernesey', type: 'interco', insee: 'GG', lat: 49.4550, lon: -2.5360, site: 'https://www.gov.gg/' },
  { id: 'gg-visit', nom: 'Visit Guernsey (office du tourisme)', type: 'interco', insee: 'GG', lat: 49.4550, lon: -2.5360, site: 'https://www.visitguernsey.com/' },
  { id: 'gg-alderney', nom: 'Aurigny (States of Alderney)', type: 'interco', insee: 'GG', lat: 49.7140, lon: -2.2050, site: 'https://www.alderney.gov.gg/' },
  { id: 'gg-sark', nom: 'Sercq (Chief Pleas of Sark)', type: 'interco', insee: 'GG', lat: 49.4300, lon: -2.3600, site: 'https://www.gov.sark.gg/' },
]) editeurs.push(e);
const bySite = new Map();
for (const e of editeurs) { const k = normHost(e.site); if (!k) continue; if (!bySite.has(k)) bySite.set(k, e); }
console.log(`Annuaire : ${editeurs.length} éditeurs avec site, ${bySite.size} sites distincts.`);

function normHost(u) { try { const x = new URL(u); return x.hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return null; } }

// ---------- état précédent ----------
let prev = {};
try { if (PREV) prev = JSON.parse(fs.readFileSync(PREV, 'utf8')); } catch (e) { prev = {}; }
const vus = prev.vus || {};       // hôte -> { t: date, r: résultat compact }
// 21 nov : l'ancien test de licence prenait « #cc0 » (une couleur) pour une licence : ces sites sont revus
for (const v of Object.values(vus)) if (v.r && v.r.licence && !OPEN_LIC.test(v.r.licence)) { delete v.r.licence; (v.r.feeds || []).forEach(f => { if (f.statut === 'actif') { f.statut = 'lien'; delete f.licence; } }); }

// ordre : préfectures, puis intercos, puis mairies ; jamais vus d'abord, puis les plus anciens ; quarantaine revue au bout de 7 jours
// mairies et intercos d'abord (ce sont elles qui publient les sorties) ; préfectures ensuite (alertes, pas d'agenda de sorties)
const rank = { interco: 0, mairie: 1, 'préfecture': 2 };
// 21 nov (Hervé) : l'outre-mer d'abord, c'est là que les sources ouvertes manquent le plus
// et les îles (Ouessant, Molène, Sein, Batz, Bréhat, Groix, Belle-Île, Houat, Hoëdic, Île-aux-Moines, Ré, Oléron, Yeu, Noirmoutier, Corse…)
const ILE = /(^|[\s'-])(Îles?|Iles?|Ouessant|Molène|Bréhat|Hoëdic|Houat|Groix|Sauzon|Oléron|Noirmoutier|Barbâtre|Rivedoux|Loix)([\s'-]|$)|-en-Ré|-de-Ré|Île-d'Yeu/i;
const outreMer = ed => /^(9[78]|JE|GG|2A|2B)/.test(String(ed.insee || '')) || ILE.test(ed.nom || '') ? 0 : 1;
const todo = [...bySite.entries()].filter(([h, ed]) => {
  const v = vus[h]; if (!v) return true;
  // 21 nov : îles Anglo-Normandes revues avec les mots anglais (What's on, Events)
  if (/^(JE|GG)$/.test(ed.insee) && v.r && !v.r.agenda && Date.parse(v.t) < Date.parse('2026-11-21T21:30:00Z')) return true;
  const age = now - Date.parse(v.t);
  return age > (v.r && v.r.q ? 7 * 86400000 : REVISIT);
}).sort((a, b) => (vus[a[0]] ? 1 : 0) - (vus[b[0]] ? 1 : 0) || outreMer(a[1]) - outreMer(b[1]) || rank[a[1].type] - rank[b[1].type] || String((vus[a[0]] || {}).t || '').localeCompare(String((vus[b[0]] || {}).t || '')))
  .slice(0, MAX);
console.log(`${todo.length} sites à visiter cette nuit (max ${MAX}).`);

// ---------- 2. Récupération prudente ----------
const PRIV = /^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i;
function safeUrl(u, base) {
  let x; try { x = new URL(u, base); } catch (e) { return null; }
  if (x.protocol === 'webcal:') x = new URL(x.href.replace(/^webcal:/, 'https:'));
  if (!/^https?:$/.test(x.protocol) || x.username || x.password) return null;
  if (x.port && !['80', '443'].includes(x.port)) return null;
  if (/^[\d.]+$/.test(x.hostname) || x.hostname.includes(':') || PRIV.test(x.hostname)) return null;
  return x;
}
async function get(u, max = 1500000) {
  const x = safeUrl(u); if (!x) throw new Error('adresse refusée');
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(x, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,text/calendar,*/*;q=0.5' }, redirect: 'follow', signal: ctl.signal });
    if (!safeUrl(r.url)) throw new Error('redirection refusée');
    if (r.status === 429) throw new Error('429 trop de requêtes');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const reader = r.body.getReader(); const chunks = []; let n = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; if (n > max) { ctl.abort(); throw new Error('trop gros'); } chunks.push(value); }
    return { url: r.url, type: r.headers.get('content-type') || '', text: Buffer.concat(chunks).toString('utf8') };
  } catch (e) { const c = e.cause && (e.cause.code || e.cause.message); throw new Error(c ? `${e.message} (${c})` : e.message); } finally { clearTimeout(tm); }
}

// ---------- 3. Repérage des agendas dans une page ----------
function scan(html, base) {
  const out = { feeds: new Map(), agenda: null, oa: new Set(), licence: null };
  const add = (u, kind) => { const x = safeUrl(u.replace(/&amp;/g, '&'), base); if (x && !out.feeds.has(x.href)) out.feeds.set(x.href, kind); };
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0]; if (!/rel=["']?alternate/i.test(tag)) continue;
    const href = (tag.match(/href=["']([^"']+)/i) || [])[1]; const type = (tag.match(/type=["']([^"']+)/i) || [])[1] || '';
    if (!href) continue;
    if (/calendar/i.test(type)) add(href, 'ics'); else if (/rss|atom/i.test(type)) add(href, /atom/i.test(type) ? 'atom' : 'rss');
  }
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,160}?)<\/a>/gi)) {
    const href = m[1]; const label = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^webcal:|\.ics(\?|$)|[?&](ical|ics)=|\/ical\/?$|format=ical/i.test(href)) add(href, 'ics');
    else if (!out.agenda && (/^(l'|l’)?(agenda|[ée]v[ée]nements?|sortir|que faire|sorties|animations|f[êe]tes et manifestations|what'?s on|events?)\b/i.test(label) || /\/(agenda|evenements?|sortir|animations|whats-on|what-s-on|events?)(\/|\.html?|$)/i.test(href)) && !/demarche|presse|interdiction|arret|reglementation/i.test(href)) { const x = safeUrl(href, base); if (x && normHost(x.href) === normHost(base)) out.agenda = x.href; }
  }
  for (const m of html.matchAll(/openagenda\.com\/(?:fr\/|en\/)?(?:agendas\/(\d+)|([a-z0-9][a-z0-9-]{2,60}))(?=[\/"'?#\s])/gi)) {
    const v = m[1] || m[2]; if (!/^(js|css|images?|static|api|assets|embeds?|widget|fr|en|agendas|contribute|signin|login|home|pricing)$/i.test(v)) out.oa.add(v);
  }
  for (const m of html.matchAll(/data-oa-agenda(?:-uid)?=["'](\d+)/gi)) out.oa.add(m[1]);
  const lic = visible(html).match(OPEN_LIC); if (lic) out.licence = lic[0];
  return out;
}

// ---------- 4. Test d'un flux ----------
function icsInfo(t) {
  const ev = t.split('BEGIN:VEVENT').slice(1);
  let fut = 0;
  for (const e of ev) { const d = (e.match(/DTSTART[^:\r\n]*:(\d{8})/) || [])[1]; if (d && `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` >= today) fut++; }
  return { n: ev.length, futurs: fut };
}
function rssInfo(t) {
  const items = t.match(/<(item|entry)[\s>]/gi) || [];
  // flux d'événements : dates de tenue explicites (ev:startdate, xcal, schema « startDate »)
  const fut = [...t.matchAll(/<(?:ev:startdate|xCal:dtstart|startDate|dtstart)[^>]*>\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/gi)].filter(m => m[1] >= today).length;
  return { n: items.length, futurs: fut };
}
async function testFeed(url, kind, pageLic) {
  try {
    const r = await get(url, 3000000);
    if (kind === 'ics' || /text\/calendar/i.test(r.type) || /^BEGIN:VCALENDAR/m.test(r.text.slice(0, 200))) {
      if (!/BEGIN:VCALENDAR/.test(r.text)) return { url, kind: 'ics', statut: 'quarantaine', motif: 'pas un calendrier' };
      const i = icsInfo(r.text);
      if (!i.futurs) return { url, kind: 'ics', ...i, statut: 'quarantaine', motif: 'aucune date à venir' };
      return { url, kind: 'ics', ...i, licence: pageLic || null, statut: pageLic ? 'actif' : 'lien' };
    }
    if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(r.text.slice(0, 3000))) return { url, kind, statut: 'quarantaine', motif: 'pas un flux RSS/Atom' };
    const i = rssInfo(r.text);
    if (!i.n) return { url, kind, ...i, statut: 'quarantaine', motif: 'flux vide' };
    if (!i.futurs) return { url, kind, ...i, statut: 'annonces' };
    return { url, kind, ...i, licence: pageLic || null, statut: pageLic ? 'actif' : 'lien' };
  } catch (e) { return { url, kind, statut: 'quarantaine', motif: String(e.message || e).slice(0, 80) }; }
}

// ---------- agendas OpenAgenda déjà lus par Iriscope (export ouvert) ----------
const oaOpen = new Set(); const oaSlug = new Map();
try {
  const u = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/evenements-publics-openagenda/records?select=originagenda_uid,originagenda_title&group_by=originagenda_uid,originagenda_title&limit=20000';
  const j = await (await fetch(u, { headers: { 'User-Agent': UA } })).json();
  for (const x of j.results || []) { if (x.originagenda_uid) oaOpen.add(String(x.originagenda_uid)); }
  console.log(`OpenAgenda ouvert : ${oaOpen.size} agendas.`);
} catch (e) { console.log('OpenAgenda ouvert : liste indisponible', e.message); }
async function oaUid(v) {
  if (/^\d+$/.test(v)) return v;
  if (oaSlug.has(v)) return oaSlug.get(v);
  let uid = null;
  try { const r = await get(`https://openagenda.com/${v}`, 2000000); uid = (r.text.match(/"(?:agendaUid|agenda_uid|uid)"\s*:\s*"?(\d{5,})/) || [])[1] || null; } catch (e) { uid = null; }
  oaSlug.set(v, uid); return uid;
}

// ---------- visite d'un site ----------
async function visit(host, ed) {
  const res = { feeds: [], agenda: null, oa: [] };
  let home;
  // l'adresse de l'annuaire est parfois ancienne : on essaie aussi https, puis avec ou sans « www. »
  const tries = [ed.site]; try { const x = new URL(ed.site); const alt = x.hostname.startsWith('www.') ? x.hostname.slice(4) : `www.${x.hostname}`; tries.push(`https://${x.hostname}${x.pathname}`, `https://${alt}/`); } catch (e) { /* adresse illisible */ }
  let err = '';
  for (const u of [...new Set(tries)]) { try { home = await get(u); break; } catch (e) { err = err || String(e.message || e).slice(0, 80); } }
  if (!home) return { ...res, q: err };
  const s1 = scan(home.text, home.url);
  let lic = s1.licence; let agenda = s1.agenda;
  const feeds = new Map(s1.feeds); const oa = new Set(s1.oa);
  if (agenda) {
    await sleep(600);
    try { const p = await get(agenda); const s2 = scan(p.text, p.url); for (const [k, v] of s2.feeds) feeds.set(k, v); s2.oa.forEach(x => oa.add(x)); lic = lic || s2.licence; agenda = p.url; } catch (e) { agenda = null; }
  }
  res.agenda = agenda;
  // flux : 4 au plus par site, iCal d'abord
  const list = [...feeds.entries()].sort((a, b) => (a[1] === 'ics' ? 0 : 1) - (b[1] === 'ics' ? 0 : 1)).slice(0, 4);
  for (const [u, k] of list) { await sleep(400); res.feeds.push(await testFeed(u, k, lic)); }
  for (const v of [...oa].slice(0, 3)) { const uid = await oaUid(v); res.oa.push({ v, uid, statut: uid && oaOpen.has(uid) ? 'couvert' : 'lien' }); }
  if (lic) res.licence = lic;
  return res;
}

// 8 sites en parallèle, jamais deux fois le même hôte en même temps
const results = {};
let i = 0;
async function worker() { while (i < todo.length) { const [h, ed] = todo[i++]; results[h] = await visit(h, ed); await sleep(300); } }
const t0 = Date.now();
await Promise.all(Array.from({ length: 8 }, worker));
console.log(`Visites terminées en ${Math.round((Date.now() - t0) / 1000)} s.`);
for (const [h, r] of Object.entries(results)) vus[h] = { t: now.toISOString(), r };

// ---------- Europe (lundi ou à la demande) : jeux de données d'agendas sur data.europa.eu, licences ouvertes seulement ----------
let europe = prev.europe || [];
if (process.argv.includes('--europe') || now.getUTCDay() === 1) {
  const Q = [['be', 'agenda evenementen'], ['be', 'agenda événements'], ['lu', 'agenda événements'], ['ch', 'veranstaltungen agenda'], ['ch', 'agenda manifestations'],
    ['nl', 'evenementen agenda'], ['de', 'veranstaltungen kalender'], ['es', 'agenda eventos'], ['pt', 'agenda eventos'], ['gb', 'events listings'], ['ie', 'events listings'], ['it', 'eventi agenda']];
  const OPEN = /cc[- ]?by(?![- ]?nc)|cc0|odbl|open[- ]?gov|licence ouverte|dl-de|public domain|pddl|creative commons attribution(?! non)/i;
  const seen = new Map(europe.map(x => [x.id, x]));
  for (const [c, q] of Q) {
    try {
      const u = `https://data.europa.eu/api/hub/search/search?q=${encodeURIComponent(q)}&filter=dataset&limit=40&facets=${encodeURIComponent(JSON.stringify({ country: [c] }))}`;
      const j = await (await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json' } })).json();
      const rs = (j.result && j.result.results) || [];
      for (const d of rs) {
        const title = typeof d.title === 'object' ? (d.title.fr || d.title.en || Object.values(d.title)[0]) : d.title;
        const lic = (d.distributions || []).map(x => x.license && (x.license.label || x.license.id || x.license.resource)).filter(Boolean)[0] || '';
        if (!seen.has(d.id)) seen.set(d.id, { id: d.id, pays: c, titre: String(title || '').slice(0, 140), licence: lic, ouverte: OPEN.test(lic), formats: [...new Set((d.distributions || []).map(x => x.format && (x.format.label || x.format.id)).filter(Boolean))].slice(0, 5), page: `https://data.europa.eu/data/datasets/${d.id}`, vu: today, statut: OPEN.test(lic) ? 'à examiner' : 'licence non ouverte' });
      }
      console.log(`Europe ${c} « ${q} » : ${rs.length} jeux.`);
    } catch (e) { console.log(`Europe ${c} : ${e.message}`); }
    await sleep(800);
  }
  europe = [...seen.values()];
}

// ---------- 5. Publication ----------
const edByHost = Object.fromEntries([...bySite.entries()]);
const compte = { sites: 0, visites: 0, injoignables: 0, agendas: 0, actif: 0, lien: 0, annonces: 0, couvert: 0, quarantaine: 0 };
const liens = {};   // tuile -> [{ n: nom, u: url, k: type, s: statut }]
const actifs = [];
for (const [h, v] of Object.entries(vus)) {
  const ed = edByHost[h]; if (!ed) continue;
  compte.visites++; const r = v.r || {};
  if (r.q) { compte.injoignables++; continue; }
  let best = null;
  for (const f of r.feeds || []) {
    compte[f.statut] = (compte[f.statut] || 0) + 1;
    if (f.statut === 'actif') actifs.push({ host: h, nom: ed.nom, insee: ed.insee, lat: ed.lat, lon: ed.lon, url: f.url, kind: f.kind, licence: f.licence });
    if ((f.statut === 'actif' || f.statut === 'lien') && !best) best = { u: f.url, k: f.kind, s: f.statut };
  }
  for (const o of r.oa || []) { compte[o.statut]++; if (!best && o.statut === 'lien') best = { u: /^\d+$/.test(o.v) ? `https://openagenda.com/agendas/${o.v}` : `https://openagenda.com/${o.v}`, k: 'openagenda', s: 'lien' }; }
  // page « agenda » seule : jamais pour une préfecture (« manifestations » y veut dire démarches), jamais une page de presse ou d'arrêté
  if (!best && r.agenda && ed.type !== 'préfecture' && !/demarche|presse|interdiction|arrete|manifestation-d-interet|reglementation/i.test(r.agenda)) best = { u: r.agenda, k: 'page', s: 'lien' };
  if (best) {
    compte.agendas++;
    if (ed.lat != null) { const t = tileOf(ed.lat, ed.lon); (liens[t] = liens[t] || []).push({ n: ed.nom.replace(/^Mairie - /, ''), ty: ed.type, i: ed.insee, la: ed.lat, lo: ed.lon, u: best.k === 'ics' || best.k === 'rss' || best.k === 'atom' ? (r.agenda || best.u) : best.u, k: best.k, s: best.s }); }
  }
}
compte.sites = bySite.size;
fs.mkdirSync(path.join(OUT, 'sources'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'sources', 'decouverte.json'), JSON.stringify({ version: 1, updated: now.toISOString(), compte, actifs, europe, vus }));
fs.writeFileSync(path.join(OUT, 'sources', 'liens.json'), JSON.stringify({ version: 1, updated: now.toISOString(), note: "Agendas publics des mairies, intercommunalités et préfectures (annuaire DILA, Licence Ouverte). Lien seulement : contenu non republié sans licence ouverte déclarée.", tuiles: liens }));
const L = [`## Découverte des sources (${today})`, '', `Sites publics connus : ${compte.sites} · visités au total : ${compte.visites} (cette nuit ${todo.length}) · injoignables : ${compte.injoignables}`,
  `Éditeurs avec un agenda repéré : ${compte.agendas}`, `Europe : ${europe.length} jeux d'agendas repérés, dont ${europe.filter(x => x.ouverte).length} sous licence ouverte`, `Flux actifs (licence ouverte déclarée) : ${compte.actif} · liens seulement : ${compte.lien} · annonces sans dates : ${compte.annonces} · OpenAgenda déjà couverts : ${compte.couvert} · quarantaine : ${compte.quarantaine}`, ''];
fs.writeFileSync(path.join(OUT, 'sources', 'decouverte.md'), L.join('\n') + '\n');
console.log(L.join('\n'));

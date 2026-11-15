// « Chef des sources » (15 nov 2026) : chaque nuit, note les sources d'événements tuile par tuile (un demi-degré, comme l'appli),
// repère ce que chaque source apporte EN PROPRE (après dédoublonnage), surveille les pannes, et publie ses choix
// sur la branche « sources » (sources/etat.json, lu par l'appli ; sources/rapport.md, lisible par un humain).
// Le lundi (ou avec --decouverte), cherche aussi sur data.gouv.fr de nouveaux agendas ouverts à licence commerciale.
// N'envoie jamais de code à l'appli : seulement des données. Gratuit, sans clé.
// Usage : node outils/sources.mjs <dossier de sortie> <dossier de la branche donnees> [ancien etat.json] [--decouverte]
import fs from 'node:fs';
import path from 'node:path';

const [OUT = 'sortie', DONNEES = 'donnees', PREV = ''] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const DISCOVER = process.argv.includes('--decouverte') || new Date().getUTCDay() === 1;
const UA = 'iriscope-sources/1.0 (+https://github.com/Hfoury/iriscope)';
const DAYS = 30;
const now = new Date(), nowMs = now.getTime();
const day = d => new Date(d).toISOString().slice(0, 10);
const from = day(now), to = day(nowMs + DAYS * 86400000);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tileOf = (lat, lon) => `${Math.floor(lat * 2)}_${Math.floor(lon * 2)}`;
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
// mêmes « faux événements » que l'appli masque par défaut (ateliers emploi, réunions…)
const JUNK = /emploi|m[ée]tiers?\b|recrutement|job ?dating|france travail|semaine de l.industrie|webinaire|permanence|conseil municipal|r[ée]union d.information/i;
const prev = (() => { try { return JSON.parse(fs.readFileSync(PREV, 'utf8')); } catch { return null; } })();

async function getJson(url, tries = 3) {
  for (let k = 0; ; k++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(180000) });
      if (r.ok) return await r.json();
      const e = new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); e.status = r.status; throw e;
    } catch (e) {
      if (e.status && e.status < 500 && e.status !== 429) throw e;
      if (k >= tries) throw e;
      await sleep(5000 * (k + 1));
    }
  }
}

// ---------- Collecte : chaque source donne [{ t (titre), d (jour), lat, lon, cp }] ----------
const SOURCES = {
  dt: {
    nom: 'DATAtourisme', licence: 'Licence Ouverte 2.0',
    async lire() {
      const dir = path.join(DONNEES, 'evenements', 't');
      const out = [];
      for (const f of fs.readdirSync(dir)) {
        for (const ev of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).events || []) {
          const p = (ev.p || []).find(x => (x.e || x.s) >= from && x.s <= to);
          if (p) out.push({ t: ev.t, d: p.s < from ? from : p.s, lat: ev.lat, lon: ev.lon, cp: ev.cp, k: (ev.k || []).join(' '), sub: ev.src || 'dt', subNom: ev.s });
        }
      }
      const idx = JSON.parse(fs.readFileSync(path.join(DONNEES, 'evenements', 'index.json'), 'utf8'));
      if ((nowMs - new Date(idx.updated).getTime()) > 3 * 86400000) throw new Error(`données vieilles (mises à jour le ${idx.updated.slice(0, 10)})`);
      return out;
    },
  },
  oa: {
    nom: 'OpenAgenda', licence: 'Licence Ouverte (agendas publics)',
    async lire() {
      const base = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/evenements-publics-openagenda/exports/json';
      const where = `lastdate_end >= date'${from}' AND firstdate_begin <= date'${to}' AND location_countrycode = 'FR'`;
      let rows;
      for (const select of ['title_fr,firstdate_begin,location_coordinates,location_postalcode,keywords_fr', 'title_fr,firstdate_begin,location_coordinates']) {
        try { rows = await getJson(`${base}?select=${select}&where=${encodeURIComponent(where)}`); break; }
        catch (e) { if (e.status !== 400) throw e; console.log('OpenAgenda : champs refusés, essai plus simple'); }
      }
      if (!rows) rows = await getJson(`${base}?where=${encodeURIComponent(where)}`);
      return rows.map(r => {
        const c = r.location_coordinates || {};
        return { t: r.title_fr, d: String(r.firstdate_begin || '').slice(0, 10) < from ? from : String(r.firstdate_begin).slice(0, 10), lat: +c.lat, lon: +c.lon, cp: r.location_postalcode, k: [].concat(r.keywords_fr || []).join(' ') };
      });
    },
  },
  paris: {
    nom: 'Que faire à Paris', licence: 'ODbL',
    async lire() {
      const base = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/que-faire-a-paris-/exports/json';
      const where = `date_end >= date'${from}' AND date_start <= date'${to}'`;
      const rows = await getJson(`${base}?select=title,date_start,lat_lon,address_zipcode&where=${encodeURIComponent(where)}`);
      return rows.map(r => ({ t: r.title, d: String(r.date_start || '').slice(0, 10) < from ? from : String(r.date_start).slice(0, 10), lat: +(r.lat_lon || {}).lat, lon: +(r.lat_lon || {}).lon, cp: r.address_zipcode }));
    },
  },
};

const sante = {}, data = {};
for (const [id, s] of Object.entries(SOURCES)) {
  const t0 = Date.now();
  try {
    const list = (await s.lire()).filter(e => e.t && Number.isFinite(e.lat) && Number.isFinite(e.lon) && e.d);
    if (!list.length) throw new Error('aucun événement reçu');
    data[id] = list;
    sante[id] = { ok: true, recus: list.length, secondes: Math.round((Date.now() - t0) / 1000) };
  } catch (e) {
    sante[id] = { ok: false, erreur: String(e.message).slice(0, 200) };
  }
  // une panne n'est déclarée qu'au bout de deux nuits de suite (une nuit ratée arrive)
  const avant = prev && prev.sources && prev.sources[id];
  sante[id].nuitsEnPanne = sante[id].ok ? 0 : ((avant && avant.nuitsEnPanne) || 0) + 1;
  sante[id].etat = sante[id].ok ? 'ok' : sante[id].nuitsEnPanne >= 2 ? 'panne' : 'incident';
  Object.assign(sante[id], { nom: s.nom, licence: s.licence });
  console.log(id, JSON.stringify(sante[id]));
}

// ---------- Notation par tuile, après dédoublonnage ----------
// même événement = même jour, à moins de 400 m, et titres qui commencent pareil (règle de l'appli)
const km = (a, b, c, d) => Math.hypot((a - c) * 111, (b - d) * 111 * Math.cos(a * Math.PI / 180));
const tiles = {};
// les agendas d'appoint arrivent dans les tuiles DATAtourisme : l'appli les traite ensemble (« dt »), le rapport les détaille
const NOMS = Object.fromEntries(Object.entries(SOURCES).map(([k, s]) => [k, s.nom]));
for (const [id, list] of Object.entries(data)) {
  for (const e of list) {
    if (JUNK.test(`${e.t} ${e.k || ''}`)) continue; // les ateliers emploi ne comptent pas comme des sorties
    const T = (tiles[tileOf(e.lat, e.lon)] ||= { ev: [], dept: {} });
    T.ev.push({ src: id, sub: e.sub || id, k: norm(e.t).slice(0, 14), d: e.d, lat: e.lat, lon: e.lon });
    if (e.sub && e.sub !== id) NOMS[e.sub] = e.subNom || e.sub;
    const dep = String(e.cp || '').match(/^\d{5}$/) ? (/^9[78]/.test(e.cp) ? e.cp.slice(0, 3) : e.cp.slice(0, 2)) : '';
    if (dep) T.dept[dep] = (T.dept[dep] || 0) + 1;
  }
}
const decisions = {}, parDept = {};
for (const [key, T] of Object.entries(tiles)) {
  const byDay = {};
  for (const e of T.ev) (byDay[e.d] ||= []).push(e);
  const total = {}, propre = {}, subT = {}, subP = {};
  for (const list of Object.values(byDay)) {
    const groups = [];
    for (const e of list) {
      const g = groups.find(g => g.some(x => km(x.lat, x.lon, e.lat, e.lon) < 0.4 && (x.k.startsWith(e.k) || e.k.startsWith(x.k))));
      if (g) g.push(e); else groups.push([e]);
    }
    for (const g of groups) {
      const srcs = [...new Set(g.map(x => x.src))];
      for (const s of srcs) total[s] = (total[s] || 0) + 1;
      if (srcs.length === 1) propre[srcs[0]] = (propre[srcs[0]] || 0) + 1;
      const subs = [...new Set(g.map(x => x.sub))];
      for (const s of subs) subT[s] = (subT[s] || 0) + 1;
      if (subs.length === 1) subP[subs[0]] = (subP[subs[0]] || 0) + 1;
    }
  }
  const sum = Object.values(total).reduce((a, b) => a + b, 0);
  const d = { n: {}, propre: {} };
  for (const s of Object.keys(total)) { d.n[s] = total[s]; d.propre[s] = propre[s] || 0; }
  // une source « inutile » ici n'apporte presque rien que les autres n'aient déjà : l'appli peut s'en passer (plus rapide)
  d.inutile = Object.keys(total).filter(s => (propre[s] || 0) < 3 && (propre[s] || 0) < 0.05 * sum);
  // ordre de préférence : celle qui apporte le plus en propre d'abord
  d.ordre = Object.keys(total).sort((a, b) => (propre[b] || 0) - (propre[a] || 0) || total[b] - total[a]);
  decisions[key] = d;
  const dep = Object.entries(T.dept).sort((a, b) => b[1] - a[1])[0];
  if (dep) {
    const P = (parDept[dep[0]] ||= { n: {}, propre: {} });
    for (const s of Object.keys(subT)) { P.n[s] = (P.n[s] || 0) + subT[s]; P.propre[s] = (P.propre[s] || 0) + (subP[s] || 0); }
  }
}
// une source en incident cette nuit garde les choix de la veille dans les tuiles (pas de bascule sur une seule nuit ratée)
if (prev && prev.tuiles) {
  for (const [id, s] of Object.entries(sante)) {
    if (s.ok) continue;
    for (const [key, old] of Object.entries(prev.tuiles)) {
      const d = (decisions[key] ||= { n: {}, propre: {}, inutile: [], ordre: [] });
      if (old.n && old.n[id] != null) { d.n[id] = old.n[id]; d.propre[id] = old.propre[id]; if ((old.inutile || []).includes(id)) d.inutile.push(id); if (!d.ordre.includes(id)) d.ordre.push(id); }
    }
  }
}

// ---------- Découverte sur data.gouv.fr ----------
const LICENCES_OK = { lov2: 'Licence Ouverte 2.0', 'fr-lo': 'Licence Ouverte 1.0', 'odc-odbl': 'ODbL', 'cc-by': 'CC BY', 'cc-zero': 'CC0', 'odc-pddl': 'PDDL', 'odc-by': 'ODC BY' };
const SUJET = /agenda|[ée]v[ée]nement|manifestation|que faire|sorties|festival|programmation culturelle/i;
const DEJA = /open ?agenda|datatourisme|que faire [àa] paris/i;
// déjà examinés à la main le 15 nov 2026 (branchés dans outils/agendas.mjs, ou écartés : copies d'OpenAgenda, réunions, subventions…)
const EXAMINES = new Set(['6716ec063f961000352feb1a', '5bd89dae06e3e738f68c0ed0', '6753909b99ad0bf8be9f81a5', '67d2f68c7563a4b5f1cbfe88', '6a46fe3f5417274350b55a32', '6036ea075a1ba9d9847ce5a3', '65fa2a8998d10bcda27ba548', '6847af4bce765ba3a2adfdfe', '5bd89d8406e3e738ef8c0edf', '5b4eeb71b595087c4ad496d9', '62a289f725d01839a4364d8a', '5b4cdb7ca3a729797ae1c365', '6246caf0a789b689c809a787', '6246cb7082bd24b23048c839', '67241b63548043cbbc20e0e3', '6970b6b98239ebec02a4c6d3', '69cb47ccb85ed687042719d4', '5c0a0c4b9ce2e7190ebea585', '5bd89d4406e3e738dd8c0ecb', '536999aaa3a729239d2052d9', '536999aaa3a729239d2052d8', '536999aba3a729239d2052db', '53698ec0a3a729239d20354e', '58ef2d07a3a7293d49c4e17c', '5369a02da3a729239d2062de', '5369a02da3a729239d2062dd', '5369a02da3a729239d2062df', '6763da0a8e03c6a65efb4a70']);
let candidats = ((prev && prev.candidats) || []).map(c => (EXAMINES.has(c.id) && c.statut === 'à examiner' ? { ...c, statut: 'examiné' } : c));
if (DISCOVER) {
  const vus = new Set(candidats.map(c => c.id));
  for (const q of ['agenda', 'agenda evenements', 'manifestations', 'que faire', 'evenements culturels', 'agenda sorties']) {
    try {
      const j = await getJson(`https://www.data.gouv.fr/api/1/datasets/?q=${encodeURIComponent(q)}&page_size=100&sort=-last_update`);
      for (const ds of j.data || []) {
        if (vus.has(ds.id) || !SUJET.test(ds.title) || JUNK.test(ds.title) || /formation|orientation|march[ée]s? publics|subvention/i.test(ds.title)) continue;
        if (!LICENCES_OK[ds.license]) continue; // licence absente ou non commerciale : écarté d'office
        if (nowMs - new Date(ds.last_update).getTime() > 90 * 86400000) continue; // plus tenu à jour
        const formats = [...new Set((ds.resources || []).map(r => String(r.format || '').toLowerCase()))];
        if (!formats.some(f => /json|csv|geojson|xml|api|flux/.test(f))) continue;
        vus.add(ds.id);
        candidats.push({
          id: ds.id, titre: ds.title, producteur: (ds.organization || {}).name || '', licence: LICENCES_OK[ds.license], formats, page: ds.page,
          vu: from, statut: EXAMINES.has(ds.id) ? 'examiné' : DEJA.test(`${ds.title} ${ds.description || ''}`) ? 'déjà couvert (copie d\'OpenAgenda ou de DATAtourisme)' : 'à examiner',
        });
      }
    } catch (e) { console.log('data.gouv.fr :', e.message); }
    await sleep(1000);
  }
  candidats = candidats.slice(-300);
}
const nouveaux = candidats.filter(c => c.vu === from && c.statut === 'à examiner');

// ---------- Publication ----------
fs.mkdirSync(path.join(OUT, 'sources'), { recursive: true });
const etat = { version: 1, updated: now.toISOString(), from, to, sources: sante, tuiles: decisions, candidats };
fs.writeFileSync(path.join(OUT, 'sources', 'etat.json'), JSON.stringify(etat));
const L = [`# Chef des sources : bilan du ${from}`, '', '## Santé des sources', ''];
for (const s of Object.values(sante)) L.push(`- **${s.nom}** (${s.licence}) : ${s.ok ? `ok, ${s.recus} événements sur 30 jours` : `${s.etat}, ${s.erreur}`}`);
L.push('', '## Par département (vraies sorties, et entre parenthèses ce que la source est seule à donner)', '', '| Dép. | ' + Object.values(NOMS).map(n => n.replace(/ \(.*$/, '')).join(' | ') + ' |', '|---|' + Object.keys(NOMS).map(() => '---|').join(''));
for (const [dep, P] of Object.entries(parDept).sort()) L.push(`| ${dep} | ` + Object.keys(NOMS).map(s => P.n[s] ? `${P.n[s]} (${P.propre[s]})` : '·').join(' | ') + ' |');
L.push('', `## Nouvelles sources repérées sur data.gouv.fr (${nouveaux.length} cette semaine)`, '');
for (const c of candidats.filter(c => c.statut === 'à examiner').slice(-50)) L.push(`- ${c.titre} · ${c.producteur} · ${c.licence} · ${c.formats.join('/')} · ${c.page}`);
fs.writeFileSync(path.join(OUT, 'sources', 'rapport.md'), L.join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'nouveaux.md'), nouveaux.length
  ? `Le chef des sources a repéré ${nouveaux.length} agenda(s) ouvert(s) à licence commerciale qu'Iriscope ne lit pas encore :\n\n${nouveaux.map(c => `- ${c.titre} (${c.producteur}, ${c.licence}) : ${c.page}`).join('\n')}\n\nPour en brancher un, demande à Claude « branche la source … ».\n` : '');
console.log(`${Object.keys(decisions).length} tuiles notées, ${candidats.length} candidats connus, ${nouveaux.length} nouveaux.`);
if (!Object.values(sante).some(s => s.ok)) { console.error('Aucune source joignable : rien n\'est publié.'); process.exit(1); }

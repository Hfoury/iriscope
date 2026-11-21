// Salles de cinéma de France (CNC, via data.culture.gouv.fr, Licence Ouverte) : complète les salles OpenStreetMap de l'appli.
// node outils/cinemas.mjs --explore : affiche les jeux de données et leurs champs ; sinon écrit <dossier>/cinemas/index.json
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
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
const cat = await get(`${HOST}/catalog/datasets?where=${encodeURIComponent('search("cinéma") OR search("cinematographiques")')}&limit=30`);
const sets = (cat.results || []).map(d => ({ id: d.dataset_id, title: d.metas && d.metas.default && d.metas.default.title, lic: d.metas && d.metas.default && d.metas.default.license, n: d.metas && d.metas.default && d.metas.default.records_count, fields: (d.fields || []).map(f => `${f.name}:${f.type}`) }));
if (args.includes('--explore')) {
  for (const d of sets) console.log(JSON.stringify(d));
  const best = sets.find(d => /etablissements-cinematographiques/.test(d.id)) || sets[0];
  if (best) { const s = await get(`${HOST}/catalog/datasets/${best.id}/records?limit=2`); console.log('EXEMPLE', JSON.stringify(s.results, null, 1).slice(0, 3000)); }
  process.exit(0);
}

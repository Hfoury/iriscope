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
if (args.includes('--explore')) {
  const j = await get('https://www.data.gouv.fr/api/1/datasets/?q=' + encodeURIComponent('établissements cinématographiques') + '&page_size=10');
  for (const d of j.data || []) {
    console.log('JEU', d.title, '|', d.organization && d.organization.name, '|', d.license, '|', d.id, '|', d.last_update);
    for (const r of (d.resources || []).slice(0, 6)) console.log('   RES', r.format, '|', r.title, '|', r.url, '|', r.last_modified);
  }
  process.exit(0);
}

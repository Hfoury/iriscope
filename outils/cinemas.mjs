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

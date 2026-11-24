// Spots du coin et terrain des zones, calculés chaque nuit sur nos serveurs (1.05, demande d'Hervé du 24 nov 2026 :
// « on calcule chaque nuit et on est autonome »). Avant, l'appli interrogeait les serveurs publics Overpass, souvent saturés.
// Source : extraits OpenStreetMap de Geofabrik (France métropolitaine et outre-mer), licence ODbL :
// citer « © les contributeurs d'OpenStreetMap » ; la base dérivée publiée ici reste sous ODbL.
// Entrée : un fichier GeoJSON-seq produit par « osmium export » (voir .github/workflows/nature.yml).
// Résultat : <dossier>/nature/<lat*2>_<lon*2>.json = { spots: [éléments bruts au format Overpass], cells: { "<lat*20>_<lon*20>": [mer, lac, riviere, foret] } }
// + <dossier>/nature/index.json. L'appli lit la tuile de sa zone ; Overpass ne sert plus qu'en secours.
// Usage : node outils/nature.mjs sortie fichier1.geojsonseq [fichier2.geojsonseq …]
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const [outDir = 'sortie', ...inputs] = process.argv.slice(2);
const OUT = path.join(outDir, 'nature');
const tile = (lat, lon) => `${Math.floor(lat * 2)}_${Math.floor(lon * 2)}`;
const cell = (lat, lon) => `${Math.floor(lat * 20)}_${Math.floor(lon * 20)}`;
const r5 = v => Math.round(v * 1e5) / 1e5;

// les mêmes règles que la requête Overpass de l'appli (src/practical.js, fetchSpots)
function spotOf(t) {
  const sport = String(t.sport || '');
  if (t.tourism === 'viewpoint') return true;
  if (t.tourism === 'attraction' && t.wikidata) return true;
  if (/^(monument|castle|memorial|ruins|archaeological_site)$/.test(t.historic || '') && t.wikidata) return true;
  if (t.man_made === 'lighthouse' && t.name) return true;
  if (/^(peak|waterfall|cape|arch)$/.test(t.natural || '') && t.name && t.wikidata) return true;
  if (t.leisure === 'bathing_place') return true;
  if (t.natural === 'beach' && t.name) return true;
  if (t.leisure === 'playground' || t.tourism === 'picnic_site' || t.leisure === 'horse_riding' || t.leisure === 'fitness_station' || t.leisure === 'fishing') return true;
  if (/climbing/.test(sport)) return true;
  if (/^(canoe|kayak|sailing|rowing)$/.test(sport) && t.leisure) return true;
  if (/canoe|kayak/.test(t.rental || '')) return true;
  return false;
}
// les mêmes règles que la détection du terrain (src/terrain.js, PARTS)
function partsOf(t, geom) {
  const p = [0, 0, 0, 0];
  if (t.natural === 'beach' || t.leisure === 'marina' || t.harbour || t['seamark:type']) p[0] = 1;
  if (t.natural === 'water' && /^(lake|reservoir|lagoon)$/.test(t.water || '') && t.name && geom !== 'Point') p[1] = 1;
  if (t.waterway === 'river' && t.name && geom !== 'Point') p[2] = 1;
  if ((t.landuse === 'forest' || t.natural === 'wood') && geom !== 'Point') p[3] = 1;
  return p;
}
const KEEP = ['name', 'tourism', 'historic', 'man_made', 'natural', 'leisure', 'sport', 'rental', 'distance', 'mtb:scale', 'symbol', 'supervised',
  'wheelchair', 'network', 'min_age', 'max_age', 'climbing:grade:french:min', 'climbing:grade:french:max', 'climbing:routes', 'covered', 'bbq',
  'fireplace', 'toilets', 'website', 'url', 'wikipedia', 'wikidata', 'wikimedia_commons', 'image', 'description'];

// un point représentatif : le point lui-même, le milieu d'une ligne, le centre du cadre d'une surface
function center(g) {
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates;
  let pts = g.coordinates;
  if (g.type === 'LineString') return pts[Math.floor(pts.length / 2)];
  if (g.type === 'MultiLineString') pts = pts.flat();
  else if (g.type === 'Polygon') pts = pts[0];
  else if (g.type === 'MultiPolygon') pts = pts.map(p => p[0]).flat();
  if (!pts || !pts.length) return null;
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of pts) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return [(a + c) / 2, (b + d) / 2];
}

const tiles = {}; const seen = new Set();
let nSpots = 0, nParts = 0, nLines = 0;
const T = k => (tiles[k] ||= { spots: [], cells: {} });
for (const file of inputs) {
  if (!fs.existsSync(file)) { console.log(`(absent : ${file})`); continue; }
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (let line of rl) {
    line = line.replace(/^\x1e/, '').trim(); if (!line) continue; nLines++;
    let f; try { f = JSON.parse(line); } catch (e) { continue; }
    const t = f.properties || {}; const id = `${t['@type'] || '?'}-${t['@id'] || nLines}`;
    if (seen.has(id)) continue; seen.add(id);
    const c = center(f.geometry); if (!c) continue;
    const [lon, lat] = c; if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const k = tile(lat, lon);
    if (spotOf(t)) {
      const tags = {}; for (const x of KEEP) if (t[x] != null && t[x] !== '') tags[x] = x === 'description' ? String(t[x]).slice(0, 200) : t[x];
      T(k).spots.push({ type: t['@type'] || 'node', id: Number(t['@id']) || 0, lat: r5(lat), lon: r5(lon), tags }); nSpots++;
    }
    const p = partsOf(t, f.geometry.type);
    if (p.some(Boolean)) {
      const cells = T(k).cells, ck = cell(lat, lon);
      const v = cells[ck] ||= [0, 0, 0, 0]; for (let i = 0; i < 4; i++) v[i] += p[i]; nParts++;
    }
  }
  console.log(`${file} : ${nLines} objets lus jusqu'ici`);
}
fs.mkdirSync(OUT, { recursive: true });
const updated = new Date().toISOString();
const index = {};
for (const [k, v] of Object.entries(tiles)) {
  fs.writeFileSync(path.join(OUT, `${k}.json`), JSON.stringify({ updated, ...v }));
  index[k] = [v.spots.length, Object.keys(v.cells).length];
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ updated, licence: 'ODbL, © les contributeurs d\'OpenStreetMap', tiles: index }));
console.log(`${Object.keys(tiles).length} tuiles, ${nSpots} spots, ${nParts} éléments de terrain`);
if (nSpots < 1000) { console.error('Trop peu de spots : publication annulée'); process.exit(3); }

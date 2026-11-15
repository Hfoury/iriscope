// Compteurs des sorties Iriscope : regroupe toutes les 3 heures les « ça m'intéresse » et « j'y vais » envoyés
// sur le sujet ntfy public (gardés 12 h par ntfy) dans un fichier durable, publié sur la branche « compteurs »
// (compteurs/index.json) et lu par l'appli.
// Anonyme : seulement une clé de sortie, un choix (i, g ou -) et un identifiant d'appareil tiré au hasard.
// Un seul choix par appareil et par sortie (le plus récent remplace l'ancien). Les sorties terminées depuis
// plus de 120 jours sont oubliées.
// Usage : node outils/compteurs.mjs sortie [--ancien ancien-index.json]
import fs from 'node:fs';
import path from 'node:path';

const TOPIC = 'iriscope-sorties-da0e6a77eaa1';
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const OUT = path.join(args[0] && !args[0].startsWith('--') ? args[0] : 'sortie', 'compteurs');
let idx = { items: {} };
try { if (opt('--ancien')) idx = { ...idx, ...JSON.parse(fs.readFileSync(opt('--ancien'), 'utf8')) }; } catch (e) { /* premier passage */ }

const res = await fetch(`https://ntfy.sh/${TOPIC}/json?poll=1&since=all`, { headers: { 'User-Agent': 'iriscope-compteurs/1.0' } });
if (!res.ok) throw new Error(`ntfy : HTTP ${res.status}`);
const lines = (await res.text()).split('\n').filter(Boolean);
let added = 0;
for (const line of lines) {
  let m, r; try { m = JSON.parse(line); r = JSON.parse(m.message); } catch (e) { continue; }
  if (m.event !== 'message' || !r || r.v !== 1 || !r.k || !r.d) continue;
  const key = String(r.k).slice(0, 120), dev = String(r.d).slice(0, 40);
  const t = Number(r.t) || m.time * 1000;
  const b = idx.items[key] || (idx.items[key] = { d: {}, at: {} });
  b.d = b.d || {}; b.at = b.at || {};
  if ((b.at[dev] || 0) > t) continue; // un message plus récent a déjà été pris en compte
  b.at[dev] = t;
  if (r.a === 'i' || r.a === 'g') b.d[dev] = r.a; else delete b.d[dev];
  if (r.u) b.u = String(r.u).slice(0, 10);
  added++;
}

const limite = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
for (const [k, b] of Object.entries(idx.items)) {
  const vals = Object.values(b.d || {});
  b.g = vals.filter(x => x === 'g').length;
  b.i = vals.filter(x => x === 'i').length;
  if (!vals.length || (b.u && b.u < limite)) delete idx.items[k];
}
idx.updated = new Date().toISOString();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(idx));
const tot = Object.values(idx.items);
console.log(`${lines.length} messages lus, ${added} choix pris en compte ; ${tot.length} sorties suivies, ${tot.reduce((s, b) => s + b.g, 0)} « j'y vais » et ${tot.reduce((s, b) => s + b.i, 0)} « ça m'intéresse »`);

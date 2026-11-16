// Événements proposés par les utilisateurs d'Iriscope (0.57.0) : regroupe toutes les 3 h les messages du sujet ntfy public
// (gardés 12 h par ntfy) dans avis/propositions.json, publié sur la branche « avis » avec les avis.
// Seul l'auteur peut retirer son événement : à la création il envoie l'empreinte (h, SHA-256 tronqué) d'un code secret gardé sur
// son téléphone, et il révèle ce code pour le retirer. Un événement ne se modifie pas (on le retire et on en crée un autre). Signalé par deux appareils différents : masqué.
// Les événements terminés depuis plus d'un jour sont oubliés.
// Usage : node outils/propositions.mjs sortie [--ancien ancien-propositions.json]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { checkText } from './moderation.mjs';

const TOPIC = 'iriscope-propositions-7d3a91c4b2e6';
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const OUT = path.join(args[0] && !args[0].startsWith('--') ? args[0] : 'sortie', 'avis');
let idx = { items: [], hidden: [], removed: [], reports: {} };
try { if (opt('--ancien')) idx = { ...idx, ...JSON.parse(fs.readFileSync(opt('--ancien'), 'utf8')) }; } catch (e) { /* premier passage */ }
const res = await fetch(`https://ntfy.sh/${TOPIC}/json?poll=1&since=all`, { headers: { 'User-Agent': 'iriscope-propositions/1.0' } });
if (!res.ok) throw new Error(`ntfy : HTTP ${res.status}`);
const lines = (await res.text()).split('\n').filter(Boolean);
const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const map = new Map(idx.items.map(e => [e.id, e]));
const hidden = new Set(idx.hidden), removed = new Set(idx.removed);
let added = 0, reports = 0, dels = 0;
for (const line of lines) {
  let m, r; try { m = JSON.parse(line); r = JSON.parse(m.message); } catch (e) { continue; }
  if (m.event !== 'message' || !r || r.v !== 1) continue;
  const dev = clean(r.d, 40);
  const sh = r.s ? crypto.createHash('sha256').update(String(r.s)).digest('hex').slice(0, 32) : '';
  if (r.del) { const old = map.get(r.del); if (sh && old && old.h === sh) { removed.add(String(r.del).slice(0, 40)); map.delete(r.del); dels++; } continue; }
  if (r.report) {
    const list = new Set(idx.reports[r.report] || []); list.add(dev || m.id);
    idx.reports[r.report] = [...list]; reports++;
    if (list.size >= 2) hidden.add(r.report);
    continue;
  }
  const e = r.ev;
  const h = /^[0-9a-f]{32}$/.test(r.h || '') ? r.h : '';
  if (!e || !e.id || !e.title || !h || !Number.isFinite(Number(e.lat)) || !Number.isFinite(Number(e.lon)) || !e.start) continue;
  const old = map.get(e.id);
  const t = Number(r.t) || m.time * 1000;
  if (old || removed.has(e.id)) continue;
  // 0.60.0 : même filtre que les photos (numéros même déguisés, liens, insultes, politique) ; l'appli refuse déjà avant l'envoi
  if (![[e.title, 90], [e.description, 300]].every(([x, n]) => checkText(clean(x, n), n).ok)) continue;
  map.set(e.id, { id: clean(e.id, 40), title: clean(e.title, 90), start: clean(e.start, 25), end: clean(e.end, 25), place: clean(e.place, 90), city: clean(e.city, 60),
    lat: Math.round(Number(e.lat) * 1e4) / 1e4, lon: Math.round(Number(e.lon) * 1e4) / 1e4, description: clean(e.description, 300), category: clean(e.category, 40),
    free: !!e.free, by: clean(e.by, 30), h, t, ...(/^[0-9a-f]{32}$/.test(e.hv || '') ? { hv: e.hv } : {}) });
  added++;
}
const limit = Date.now() - 86400000;
idx.items = [...map.values()].filter(e => !hidden.has(e.id) && !removed.has(e.id) && Date.parse(e.end || e.start) > limit).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
idx.hidden = [...hidden].slice(-2000); idx.removed = [...removed].slice(-2000);
idx.updated = new Date().toISOString();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'propositions.json'), JSON.stringify(idx));
console.log(`${lines.length} messages lus, ${added} événements ajoutés ou modifiés, ${dels} retirés, ${reports} signalements ; ${idx.items.length} à venir, ${idx.hidden.length} masqués`);

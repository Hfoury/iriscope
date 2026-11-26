// Boîte à idées d'Iriscope (0.66.0) : regroupe les idées, les appuis « moi aussi » et les décisions du responsable envoyés sur un sujet ntfy public
// (gardés 12 h par ntfy) dans un fichier durable, publié sur la branche « idees » (idees/idees.json) et lu par l'appli.
// Ne gardent que les textes qui passent le filtre commun (numéros, liens, insultes, politique). Un appui par téléphone et par idée ;
// 3 idées par téléphone et par jour. Le responsable agit avec une chaîne de hachage à usage unique (jamais sa phrase en clair) :
// outils/admin-idees.txt contient l'empreinte de départ (affichée dans Réglages › Administration), chaque ordre révèle la valeur précédente.
// Usage : node outils/idees.mjs sortie [--ancien ancien-idees.json]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { checkText } from './moderation.mjs';

const TOPIC = 'iriscope-idees-7f3a91c2d5e8';
export const THEMES = ['Sorties', 'Météo et alertes', 'Pratique', 'Famille', 'Cartes', 'Sources', 'Apparence', 'Autre'];
// 27 nov 2026 : « vote » = idée soumise à la communauté par le responsable ; chacun répond « pour » (t: 's') ou « pas utile pour moi » (t: 'n'),
// une seule réponse par téléphone (la dernière compte)
const STATUS = ['new', 'accepted', 'refused', 'hold', 'dev', 'done', 'vote'];
const CHAIN = 500;
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const OUT = path.join(args[0] && !args[0].startsWith('--') ? args[0] : 'sortie', 'idees');
let st = { items: {}, seen: [] };
try { if (opt('--ancien')) st = { ...st, ...JSON.parse(fs.readFileSync(opt('--ancien'), 'utf8')) }; } catch (e) { /* premier passage */ }
const h256 = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const dh = d => h256(`idees|${d}`).slice(0, 8);
const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
const SEED = (() => { try { return fs.readFileSync(new URL('./admin-idees.txt', import.meta.url), 'utf8').trim(); } catch (e) { return ''; } })();
if (/^[0-9a-f]{64}$/.test(SEED) && st.seed !== SEED) { st.seed = SEED; st.anchor = SEED; st.ai = CHAIN; }
const seen = new Set(st.seen || []);

const res = await fetch(`https://ntfy.sh/${TOPIC}/json?poll=1&since=all`, { headers: { 'User-Agent': 'iriscope-idees/1.0' } });
if (!res.ok) throw new Error(`ntfy : HTTP ${res.status}`);
const lines = (await res.text()).split('\n').filter(Boolean);
const now = Date.now();
let ideas = 0, sups = 0, orders = 0;
for (const line of lines) {
  let m, r; try { m = JSON.parse(line); r = JSON.parse(m.message); } catch (e) { continue; }
  if (m.event !== 'message' || !r || r.v !== 1 || seen.has(m.id)) continue;
  seen.add(m.id);
  const t = m.time * 1000;
  if (r.t === 'i') {
    const id = clean(r.id, 40);
    if (!/^[a-z0-9]{8,40}$/.test(id) || st.items[id] || !r.d) continue;
    const ti = clean(r.ti, 80), x = clean(r.x, 500);
    if (ti.length < 4 || !checkText(ti, 80).ok || (x && !checkText(x, 500).ok)) continue;
    const who = dh(r.d);
    if (Object.values(st.items).filter(o => o.by === who && now - o.t < 86400000).length >= 3) continue;
    st.items[id] = { id, ti, x, th: THEMES.includes(r.th) ? r.th : 'Autre', n: clean(r.n, 30) || 'Anonyme', t, by: who, sup: [who], st: 'new', rep: '' };
    ideas++;
  } else if (r.t === 's') {
    const o = st.items[clean(r.id, 40)]; if (!o || o.hidden || !r.d) continue;
    const who = dh(r.d); if (!o.sup.includes(who)) { o.sup.push(who); sups++; }
    if (o.con) o.con = o.con.filter(x => x !== who);
  } else if (r.t === 'n') {
    const o = st.items[clean(r.id, 40)]; if (!o || o.hidden || !r.d || o.st !== 'vote') continue;
    const who = dh(r.d); o.con = o.con || []; if (!o.con.includes(who)) { o.con.push(who); sups++; }
    o.sup = o.sup.filter(x => x !== who);
  } else if (r.t === 'a' && st.anchor && /^[0-9a-f]{64}$/.test(r.a || '')) {
    // chaîne à usage unique : la valeur envoyée doit, hachée 1 à 60 fois, donner l'ancre courante
    let x = r.a, j = 0, ok = false;
    for (j = 1; j <= 60; j++) { x = h256(x); if (x === st.anchor) { ok = true; break; } }
    if (!ok) continue;
    st.anchor = r.a; st.ai -= j;
    const o = st.items[clean(r.id, 40)]; if (!o) continue;
    if (r.op === 'status' && STATUS.includes(r.val)) o.st = r.val;
    else if (r.op === 'reply') o.rep = clean(r.val, 300);
    else if (r.op === 'theme' && THEMES.includes(r.val)) o.th = r.val;
    else if (r.op === 'hide') o.hidden = true;
    else if (r.op === 'merge') { const to = st.items[clean(r.val, 40)]; if (to && to !== o && !to.hidden) { to.sup = [...new Set([...to.sup, ...o.sup])]; to.merged = [...(to.merged || []), o.id]; o.hidden = true; o.into = to.id; } }
    orders++;
  }
}
// ressemblances (mots de 4 lettres et plus, sans accents) : propose au responsable de regrouper
const STOP = new Set(['dans', 'pour', 'avec', 'sans', 'plus', 'tout', 'tous', 'faire', 'avoir', 'etre', 'cette', 'comme', 'mais', 'aussi', 'votre', 'notre', 'appli', 'application', 'pouvoir', 'serait', 'bien', 'quand']);
const words = o => new Set(`${o.ti} ${o.x}`.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w)).map(w => w.replace(/(s|x)$/, '')));
const live = Object.values(st.items).filter(o => !o.hidden);
const W = new Map(live.map(o => [o.id, words(o)]));
for (const o of live) {
  const a = W.get(o.id); const sim = [];
  for (const p of live) { if (p === o) continue; const b = W.get(p.id); let c = 0; for (const w of a) if (b.has(w)) c++; const u = a.size + b.size - c; if (u && c >= 2 && c / u >= 0.35) sim.push(p.id); }
  if (sim.length) o.sim = sim.slice(0, 5); else delete o.sim;
}
// oubli : idées refusées ou faites depuis plus d'un an, et lots d'identifiants vus anciens
for (const [id, o] of Object.entries(st.items)) if (o.hidden && now - o.t > 30 * 86400000) delete st.items[id];
st.seen = [...seen].slice(-4000);
st.updated = new Date().toISOString();
fs.mkdirSync(OUT, { recursive: true });
const pub = { updated: st.updated, ai: st.ai || 0, themes: THEMES, items: live.map(o => ({ id: o.id, ti: o.ti, x: o.x, th: o.th, n: o.n, t: o.t, st: o.st, rep: o.rep, u: o.sup.length, s: o.sup.slice(0, 400), ...(o.con && o.con.length ? { d: o.con.length, c: o.con.slice(0, 400) } : {}), ...(o.sim ? { sim: o.sim } : {}), ...(o.merged ? { m: o.merged.length } : {}) })).sort((a, b) => (b.st === 'vote') - (a.st === 'vote') || b.u - a.u || b.t - a.t) };
fs.writeFileSync(path.join(OUT, 'idees.json'), JSON.stringify(pub));
// l'état complet (ancre, vus) reste sur la branche pour le passage suivant
fs.writeFileSync(path.join(OUT, 'etat.json'), JSON.stringify(st));
console.log(`${lines.length} messages lus, ${ideas} idées, ${sups} appuis, ${orders} ordres ; ${live.length} idées publiées`);

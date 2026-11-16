// Photos et mots des IriScopien(ne)s sur les sorties (0.60.0). Lancé toutes les heures par le workflow « Avis de la communauté ».
// Les envois arrivent sur un sujet ntfy public (photo en pièce jointe, gardée 3 h par ntfy ; mot en message JSON).
// Rien n'est publié sans passer le tri :
//   1. le mot : outils/moderation.mjs (numéros même déguisés, liens, e-mails, moyens de contact, insultes, politique) ;
//   2. la photo : détecteur de nudité NSFWJS (licence MIT, modèle MobileNetV2 fourni avec la bibliothèque) ;
//   3. le texte écrit dans la photo : lu par Tesseract (licence Apache), puis passé au même filtre que les mots.
// Ce qui passe : avis/photos.json + avis/photos/<id>-<n>.jpg (réduite à 1280 px, métadonnées et position GPS retirées).
// Ce qui est refusé : seulement l'identifiant et la raison (7 jours), pour que l'auteur sache pourquoi.
// Signalée par 3 téléphones différents : masquée et effacée. L'auteur la retire avec son secret ; le responsable avec sa phrase
// secrète (seule son empreinte est dans outils/admin-photos.txt). Tout est oublié au bout de 120 jours.
// Usage : node outils/photos.mjs sortie --ancien ancien-photos.json --dossier-photos anciennes-photos
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { checkText, hasPhone } from './moderation.mjs';

const TOPIC = 'iriscope-photos-5e81c0a9d47b';
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const OUT = path.join(args[0] && !args[0].startsWith('--') ? args[0] : 'sortie', 'avis');
const PH = path.join(OUT, 'photos');
fs.mkdirSync(PH, { recursive: true });
const OLD = opt('--dossier-photos');
if (OLD && fs.existsSync(OLD)) for (const f of fs.readdirSync(OLD)) if (/^[a-z0-9-]+\.jpg$/.test(f)) fs.copyFileSync(path.join(OLD, f), path.join(PH, f));
let idx = { items: [], hidden: [], removed: [], refused: [], reports: {} };
try { if (opt('--ancien')) idx = { ...idx, ...JSON.parse(fs.readFileSync(opt('--ancien'), 'utf8')) }; } catch (e) { /* premier passage */ }
const ADMIN = (() => { try { return fs.readFileSync(new URL('./admin-photos.txt', import.meta.url), 'utf8').trim(); } catch (e) { return ''; } })();
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 32);
const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

const res = await fetch(`https://ntfy.sh/${TOPIC}/json?poll=1&since=4h`, { headers: { 'User-Agent': 'iriscope-photos/1.0' } });
if (!res.ok) throw new Error(`ntfy : HTTP ${res.status}`);
const lines = (await res.text()).split('\n').filter(Boolean);
const items = new Map(idx.items.map(e => [e.id, e]));
const hidden = new Set(idx.hidden), removed = new Set(idx.removed);
const refused = new Map((idx.refused || []).map(r => [r.id, r]));
const pending = new Map(); // id → { meta, files: [{ i, url }] }
for (const line of lines) {
  let m, r; try { m = JSON.parse(line); r = JSON.parse(m.message); } catch (e) { continue; }
  if (m.event !== 'message' || !r || r.v !== 1) continue;
  if (r.del) {
    const old = items.get(r.del);
    const ok = (old && r.s && sha(r.s) === old.h) || (ADMIN && r.a && sha(r.a) === ADMIN);
    if (ok) { removed.add(clean(r.del, 40)); items.delete(r.del); }
    continue;
  }
  if (r.report) {
    const list = new Set(idx.reports[r.report] || []); list.add(clean(r.d, 40) || m.id);
    idx.reports[r.report] = [...list];
    if (list.size >= 3) { hidden.add(r.report); items.delete(r.report); }
    continue;
  }
  const id = clean(r.id, 40);
  if (!/^[a-z0-9]{8,40}$/.test(id) || !/^e:/.test(r.k || '') || !/^[0-9a-f]{32}$/.test(r.h || '')) continue;
  if (items.has(id) || refused.has(id) || removed.has(id) || hidden.has(id)) continue;
  const p = pending.get(id) || { meta: r, t: m.time * 1000, files: [] };
  if (m.attachment && m.attachment.url && Number.isInteger(r.i) && r.i >= 0 && r.i < 2) p.files.push({ i: r.i, url: m.attachment.url, size: m.attachment.size || 0 });
  pending.set(id, p);
}

// outils lourds chargés seulement s'il y a des photos à trier
let nsfw = null, ocr = null, sharp = null, tf = null;
async function tools() {
  if (sharp) return;
  sharp = (await import('sharp')).default;
  tf = await import('@tensorflow/tfjs');
  const nsfwjs = await import('nsfwjs');
  nsfw = await nsfwjs.load('MobileNetV2');
  try { const { createWorker } = await import('tesseract.js'); ocr = await createWorker('fra'); } catch (e) { ocr = null; console.log(`Lecture du texte indisponible : ${e.message}`); }
}
async function judgePhoto(buf) {
  await tools();
  const img = sharp(buf, { failOn: 'error' }).rotate();
  const meta = await img.metadata();
  if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200) return { why: 'Photo trop petite ou illisible' };
  const jpg = await img.resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  // nudité : image 224 × 224 pour le modèle
  const { data, info } = await sharp(jpg).resize(224, 224, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const t = tf.tensor3d(new Uint8Array(data), [info.height, info.width, 3], 'int32');
  const pred = await nsfw.classify(t); t.dispose();
  const p = Object.fromEntries(pred.map(x => [x.className, x.probability]));
  if ((p.Porn || 0) + (p.Hentai || 0) > 0.45 || (p.Sexy || 0) > 0.75) return { why: 'Photo refusée : nudité ou contenu suggestif' };
  // texte écrit sur la photo (affiche, pancarte, t-shirt) : seuls les mots lus avec assurance comptent
  if (!ocr) return { wait: true }; // sans lecture du texte, on ne publie pas : la photo attend le passage suivant
  const { data: o } = await ocr.recognize(jpg);
  const words = (o.words || []).filter(w => w.confidence >= 75).map(w => w.text).join(' ');
  if (hasPhone(words)) return { why: 'Photo refusée : un numéro de téléphone est écrit dessus' };
  const chk = checkText(words, 100000);
  if (!chk.ok) return { why: `Photo refusée (texte écrit dessus) : ${chk.why.replace(/^Message refusé : /, '')}` };
  return { jpg };
}

// essai à la demande (lancement manuel du workflow) : trois images fabriquées, pour vérifier que les outils de tri répondent
if (args.includes('--essai')) {
  const sh = (await import('sharp')).default;
  const mk = txt => sh(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#bde"/><text x="40" y="320" font-size="64" font-family="DejaVu Sans" fill="#111">${txt}</text></svg>`)).jpeg().toBuffer();
  for (const txt of ['Fête du village', 'Tél 06 12 34 56 78', 'Votez Macron']) { const v = await judgePhoto(await mk(txt)); console.log(`Essai « ${txt} » : ${v.why || (v.wait ? 'en attente (lecture du texte indisponible)' : 'acceptée')}`); }
}
let ok = 0, ko = 0;
for (const [id, p] of pending) {
  const r = p.meta;
  const files = [...new Map(p.files.map(f => [f.i, f])).values()].sort((a, b) => a.i - b.i);
  if (files.length < (Number(r.n) || 0)) continue; // la 2e photo n'est pas encore arrivée : prochain passage
  const c = clean(r.c, 200);
  let why = null;
  const chk = checkText(c);
  if (!chk.ok) why = chk.why;
  const saved = [];
  for (const f of why ? [] : files) {
    try {
      if (f.size > 15 * 1024 * 1024) { why = 'Photo trop lourde'; break; }
      const buf = Buffer.from(await (await fetch(f.url)).arrayBuffer());
      const v = await judgePhoto(buf);
      if (v.wait) { why = 'wait'; break; }
      if (v.why) { why = v.why; break; }
      const name = `${id}-${f.i}.jpg`;
      fs.writeFileSync(path.join(PH, name), v.jpg);
      saved.push(name);
    } catch (e) { why = 'Photo illisible'; console.log(`${id} : ${e.message}`); break; }
  }
  if (!why && !saved.length && !c) why = 'Envoi vide';
  if (why === 'wait') { for (const n of saved) fs.rmSync(path.join(PH, n), { force: true }); continue; }
  if (why) { for (const n of saved) fs.rmSync(path.join(PH, n), { force: true }); refused.set(id, { id, why, t: p.t }); ko++; continue; }
  items.set(id, { id, k: clean(r.k, 80), title: clean(r.title, 90), by: clean(r.by, 30), c, files: saved, h: r.h, t: p.t });
  ok++;
}
if (ocr) await ocr.terminate();

// oubli : 120 jours pour les photos, 7 jours pour les refus ; fichiers des photos retirées ou masquées effacés
const now = Date.now();
for (const [id, e] of items) if (now - e.t > 120 * 86400000) items.delete(id);
for (const [id, e] of refused) if (now - e.t > 7 * 86400000) refused.delete(id);
const keep = new Set([...items.values()].flatMap(e => e.files));
for (const f of fs.readdirSync(PH)) if (!keep.has(f)) fs.rmSync(path.join(PH, f), { force: true });
const out = { updated: new Date().toISOString(), items: [...items.values()].sort((a, b) => b.t - a.t), hidden: [...hidden].slice(-2000), removed: [...removed].slice(-2000),
  refused: [...refused.values()], reports: Object.fromEntries(Object.entries(idx.reports).filter(([k]) => items.has(k) || hidden.has(k)).slice(-2000)) };
fs.writeFileSync(path.join(OUT, 'photos.json'), JSON.stringify(out));
console.log(`Photos : ${pending.size} envois lus, ${ok} publiés, ${ko} refusés, ${items.size} en ligne`);

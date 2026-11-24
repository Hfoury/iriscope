// Outil manuel : cherche sur Wikimedia Commons des photos libres (usage commercial permis) pour illustrer les sorties,
// et les range dans candidats/ avec leur auteur et leur licence. Le tri final se fait à la main : rien n'est publié dans l'appli.
import fs from 'fs';
const UA = { headers: { 'User-Agent': 'iriscope-photos/1.0' } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const Q = JSON.parse(fs.readFileSync(new URL('./photos-candidats.json', import.meta.url)));
const out = 'candidats'; fs.mkdirSync(out, { recursive: true });
const res = {}; const seen = new Set();
for (const [th, queries] of Object.entries(Q)) {
  res[th] = [];
  for (const q of queries) {
    if (res[th].length >= 10) break;
    const u = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q + ' filetype:bitmap')}&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|extmetadata|size&iiurlwidth=960&format=json`;
    let j = null;
    for (let k = 0; k < 3 && !j; k++) { try { j = await (await fetch(u, UA)).json(); } catch (e) { await sleep(5000); } }
    const pages = Object.values((j && j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
    let taken = 0;
    for (const p of pages) {
      if (taken >= 4 || res[th].length >= 10 || seen.has(p.title)) continue;
      const ii = p.imageinfo && p.imageinfo[0];
      if (!ii || ii.width < ii.height * 1.25 || ii.width < 900) continue;
      const m = ii.extmetadata || {}; const lic = (m.LicenseShortName || {}).value || '';
      if (!/^(CC BY(-SA)? [0-9.]+|CC0|Public domain)/i.test(lic)) continue;
      const artist = String((m.Artist || {}).value || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 70);
      const f = `${th}-${res[th].length}.jpg`;
      try { const r = await fetch(ii.thumburl, UA); if (!r.ok) { console.log('refus', r.status, p.title); await sleep(3000); continue; } fs.writeFileSync(`${out}/${f}`, Buffer.from(await r.arrayBuffer())); } catch (e) { continue; }
      seen.add(p.title); taken++;
      res[th].push({ f, title: p.title, lic, artist, link: ii.descriptionurl, q });
      await sleep(1200);
    }
    await sleep(1500);
  }
  console.log(th, res[th].length);
}
fs.writeFileSync(`${out}/candidats.json`, JSON.stringify(res, null, 1));

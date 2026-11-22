// Manuel : cherche le site et l'adresse mail publique des salles de cinéma indépendantes de quelques départements
// (liste CNC de la branche cinemas + balises OpenStreetMap + page d'accueil et page contact du site). Affiche un tableau, ne publie rien.
const depts = (process.argv[2] || '29,56').split(',');
const UA = { 'User-Agent': 'Iriscope-donnees/1.0 (contacts cinemas)' };
const CHAIN = /PATHE|GAUMONT|UGC|CGR|KINEPOLIS|MEGARAMA|MK2|CINEVILLE|GRAND ECRAN|CINEMOVIDA/;
const j = await (await fetch('https://raw.githubusercontent.com/Hfoury/iriscope/cinemas/cinemas/index.json')).json();
const list = j.list.filter(r => depts.includes(r[4].slice(0, 2)) && !CHAIN.test(r[1]));
async function getText(url, ms = 15000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: c.signal, redirect: 'follow' }); if (!r.ok) return ''; return (await r.text()).slice(0, 600000); } catch (e) { return ''; } finally { clearTimeout(t); }
}
// Une seule requête OpenStreetMap pour toute la zone des salles (au lieu d'une par salle) : plus fiable et bien plus rapide
let osmAll = [];
async function loadOsm() {
  const la = list.map(r => r[8]), lo = list.map(r => r[9]);
  const bb = [Math.min(...la) - 0.1, Math.min(...lo) - 0.1, Math.max(...la) + 0.1, Math.max(...lo) + 0.1].join(',');
  const q = `[out:json][timeout:90];nwr["amenity"="cinema"](${bb});out center tags;`;
  for (let k = 0; k < 3; k++) for (const ep of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
    try {
      const c = new AbortController(); const t = setTimeout(() => c.abort(), 100000);
      const r = await fetch(ep, { method: 'POST', signal: c.signal, body: 'data=' + encodeURIComponent(q), headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' } }).finally(() => clearTimeout(t));
      if (!r.ok) throw new Error('HTTP ' + r.status);
      osmAll = ((await r.json()).elements || []).map(e => { const c2 = e.center || e; return { lat: c2.lat, lon: c2.lon, tags: e.tags || {} }; }).filter(x => x.lat != null);
      console.log(`OSM : ${osmAll.length} salles dans la zone (${ep})`);
      return;
    } catch (e) { console.log(`OSM ${ep} : ${e.message}`); await new Promise(res => setTimeout(res, 5000)); }
  }
}
const km = (a, b, c, d) => { const x = (c - a) * 111, y = (d - b) * 111 * Math.cos(a * Math.PI / 180); return Math.sqrt(x * x + y * y); };
function osmTags(lat, lon, name) {
  const near = osmAll.map(o => ({ o, d: km(lat, lon, o.lat, o.lon) })).filter(x => x.d < 1.2).sort((a, b) => a.d - b.d);
  const words = name.split(' ').filter(w => w.length > 2);
  const byName = near.find(x => x.o.tags.name && words.some(w => x.o.tags.name.toUpperCase().includes(w)));
  return (byName || near[0] || { o: { tags: {} } }).o.tags;
}
const BAD = /example|domaine|wix|sentry|\.png|\.jpg|\.gif|\.webp|@2x|noreply|no-reply|wordpress|godaddy|jquery/i;
const mails = html => [...new Set((html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g) || []).map(x => x.toLowerCase()).filter(x => !BAD.test(x)))];
await loadOsm();
const out = [];
for (const r of list) {
  const t = osmTags(r[8], r[9], r[1]);
  let site = t.website || t['contact:website'] || t.url || '';
  let mail = t.email || t['contact:email'] || '';
  if (site && !/^https?:/.test(site)) site = 'https://' + site;
  if (site && !mail) {
    let found = mails(await getText(site));
    if (!found.length) {
      const home = await getText(site);
      const links = [...home.matchAll(/href=["']([^"']*(contact|nous-contacter|infos|pratique|cinema)[^"']*)["']/gi)].map(m => m[1]).slice(0, 4);
      for (const l of links) { const u = new URL(l, site).href; found = mails(await getText(u)); if (found.length) break; }
    }
    mail = found.slice(0, 2).join(' ; ');
  }
  out.push({ dept: r[4].slice(0, 2), commune: r[5], nom: r[1], site, mail, ae: r[6] });
  console.log(`CINE | ${r[4].slice(0, 2)} | ${r[5]} | ${r[1]} | ${site} | ${mail}`);
}
console.log(`TOTAL ${out.length} salles, ${out.filter(x => x.mail).length} avec une adresse mail, ${out.filter(x => x.site).length} avec un site`);

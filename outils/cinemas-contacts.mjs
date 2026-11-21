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
async function osmTags(lat, lon) {
  const q = `[out:json][timeout:25];nwr["amenity"="cinema"](around:400,${lat},${lon});out tags 5;`;
  for (const ep of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']) {
    try { const c = new AbortController(); setTimeout(() => c.abort(), 20000); const r = await fetch(ep, { method: 'POST', signal: c.signal, body: 'data=' + encodeURIComponent(q), headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' } }); if (!r.ok) continue; return ((await r.json()).elements || []).map(e => e.tags || {}); } catch (e) { /* suivant */ }
  }
  return [];
}
const BAD = /example|domaine|wix|sentry|\.png|\.jpg|\.gif|\.webp|@2x|noreply|no-reply|wordpress|godaddy|jquery/i;
const mails = html => [...new Set((html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g) || []).map(x => x.toLowerCase()).filter(x => !BAD.test(x)))];
const out = [];
for (const r of list) {
  const tags = await osmTags(r[8], r[9]);
  const t = tags.find(x => x.name && r[1].split(' ').some(w => w.length > 2 && x.name.toUpperCase().includes(w))) || tags[0] || {};
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

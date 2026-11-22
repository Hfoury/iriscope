// Manuel : cherche le site et l'adresse mail publique des théâtres, opéras et salles de spectacle de quelques départements
// (balises OpenStreetMap amenity=theatre / arts_centre + page d'accueil et page contact du site). Affiche un tableau, ne publie rien.
const depts = (process.argv[2] || '10,35,75').split(',');
const UA = { 'User-Agent': 'Iriscope-donnees/1.0 (contacts spectacles)' };
async function getText(url, ms = 15000) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { headers: UA, signal: c.signal, redirect: 'follow' }); if (!r.ok) return ''; return (await r.text()).slice(0, 600000); } catch (e) { return ''; } finally { clearTimeout(t); }
}
const area = `area["boundary"="administrative"]["admin_level"="6"]["ref:INSEE"~"^(${depts.join('|')})$"]->.d;`;
const q = `[out:json][timeout:120];${area}(nwr["amenity"~"^(theatre|arts_centre)$"](area.d););out center tags;`;
let els = [];
outer: for (let k = 0; k < 3; k++) for (const ep of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter']) {
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 130000);
    const r = await fetch(ep, { method: 'POST', signal: c.signal, body: 'data=' + encodeURIComponent(q), headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' } }).finally(() => clearTimeout(t));
    if (!r.ok) throw new Error('HTTP ' + r.status);
    els = (await r.json()).elements || [];
    console.log(`OSM : ${els.length} lieux (${ep})`);
    break outer;
  } catch (e) { console.log(`OSM ${ep} : ${e.message}`); await new Promise(res => setTimeout(res, 5000)); }
}
const BAD = /example|domaine|wix|sentry|\.png|\.jpg|\.gif|\.webp|@2x|noreply|no-reply|wordpress|godaddy|jquery/i;
const mails = html => [...new Set((html.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/g) || []).map(x => x.toLowerCase()).filter(x => !BAD.test(x)))];
const seen = new Set();
const out = [];
for (const e of els) {
  const t = e.tags || {};
  const name = t.name || '';
  if (!name) continue;
  const key = name.toLowerCase();
  if (seen.has(key)) continue; seen.add(key);
  const cp = String(t['addr:postcode'] || '');
  const dept = cp.startsWith('75') ? '75' : cp.slice(0, 2);
  const kind = t.amenity === 'arts_centre' ? 'centre' : (/opera|opéra/i.test(name + ' ' + (t['theatre:genre'] || '')) ? 'opéra' : 'théâtre');
  let site = t.website || t['contact:website'] || t.url || '';
  let mail = t.email || t['contact:email'] || '';
  if (site && !/^https?:/.test(site)) site = 'https://' + site;
  if (site && !mail) {
    const home = await getText(site);
    let found = mails(home);
    if (!found.length) {
      const links = [...home.matchAll(/href=["']([^"']*(contact|nous-contacter|infos|pratique)[^"']*)["']/gi)].map(m => m[1]).slice(0, 4);
      for (const l of links) { try { found = mails(await getText(new URL(l, site).href)); } catch (e) { found = []; } if (found.length) break; }
    }
    mail = found.slice(0, 2).join(' ; ');
  }
  out.push({ dept, kind });
  console.log(`SPEC | ${dept} | ${t['addr:city'] || ''} | ${kind} | ${name} | ${site} | ${mail}`);
}
console.log(`TOTAL ${out.length} lieux, ${out.filter(x => x.kind).length} classés`);

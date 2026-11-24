// Diagnostic manuel : la requête de détection du terrain (essai 1.05) sur de vraies zones.
const zones = [['Quimper', 47.996, -4.102, 20], ['Paris', 48.857, 2.352, 10], ['Chamonix', 45.923, 6.869, 15], ['Rennes', 48.111, -1.68, 20]];
const mirrors = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
function q(lat, lon, km) {
  const at = r => `(around:${Math.round(r * 1000)},${lat.toFixed(4)},${lon.toFixed(4)})`;
  const reach = Math.max(3, Math.min(km || 15, 25));
  return `[out:json][timeout:25];
way["natural"="coastline"]${at(reach)}->.c; .c out count;
(way["natural"="water"]["water"~"lake|reservoir|pond|lagoon"]${at(reach)};relation["natural"="water"]["water"~"lake|reservoir|pond|lagoon"]${at(reach)};)->.l; .l out count;
way["waterway"="river"]${at(reach)}->.r; .r out count;
(way["landuse"="forest"]${at(reach)};way["natural"="wood"]${at(reach)};)->.f; .f out count;
way["landuse"~"^(residential|commercial|retail|industrial)$"]${at(Math.min(reach, 8))}->.b; .b out count;`;
}
for (const [n, lat, lon, km] of zones) {
  for (const m of mirrors) {
    const t0 = Date.now();
    try {
      const r = await fetch(m, { method: 'POST', body: 'data=' + encodeURIComponent(q(lat, lon, km)), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Iriscope-diagnostic/1.0 (https://hfoury.github.io/iriscope/)' } });
      const txt = await r.text();
      let c = '?'; try { c = JSON.parse(txt).elements.map(e => e.tags.total).join(' / '); } catch { c = txt.slice(0, 120); }
      console.log(`${n} ${km} km · ${m.split('/')[2]} · HTTP ${r.status} · ${Date.now() - t0} ms · côte/lacs/rivières/forêts/bâti = ${c}`);
      if (r.ok) break;
    } catch (e) { console.log(`${n} · ${m} · erreur ${e.message}`); }
  }
}

// Diagnostic manuel : détection du terrain des zones (essai 1.05 n° 8), une petite requête par type, dans le carré de la zone.
const zones = [['Quimper', 47.996, -4.102, 20], ['Chamonix', 45.923, 6.869, 15], ['Paris', 48.857, 2.352, 10]];
const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const UA = { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Iriscope-diagnostic/1.0 (https://hfoury.github.io/iriscope/)' };
const box = (lat, lon, km) => { const dl = km / 111, dn = km / (111 * Math.cos(lat * Math.PI / 180)); return `(${(lat - dl).toFixed(3)},${(lon - dn).toFixed(3)},${(lat + dl).toFixed(3)},${(lon + dn).toFixed(3)})`; };
const PARTS = {
  mer: b => `way["natural"="coastline"]${b}`,
  lac: b => `(way["natural"="water"]["water"~"^(lake|reservoir|lagoon)$"]["name"]${b};relation["natural"="water"]["water"~"^(lake|reservoir|lagoon)$"]["name"]${b};)`,
  riviere: b => `way["waterway"="river"]["name"]${b}`,
  foret: b => `(way["landuse"="forest"]${b};way["natural"="wood"]${b};relation["landuse"="forest"]${b};)`,
};
for (const [n, lat, lon, km] of zones) {
  const g = await fetch(`https://geo.api.gouv.fr/communes?lat=${lat}&lon=${lon}&fields=population&format=json`).then(r => r.json()).catch(e => e.message);
  console.log(`${n} ${km} km · population · ${JSON.stringify(g)}`);
  for (const [k, f] of Object.entries(PARTS)) {
    const q = `[out:json][timeout:20];${f(box(lat, lon, km))};out count;`;
    for (const m of MIRRORS) {
      const t0 = Date.now();
      try {
        const r = await fetch(m, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: UA, signal: AbortSignal.timeout(30000) });
        const t = await r.text(); let c; try { c = JSON.parse(t).elements[0].tags.total; } catch { c = t.slice(0, 60).replace(/\s+/g, ' '); }
        console.log(`${n} ${km} km · ${k} · ${m.split('/')[2]} · HTTP ${r.status} · ${Date.now() - t0} ms · ${c}`);
        if (r.ok) break;
      } catch (e) { console.log(`${n} ${km} km · ${k} · ${m.split('/')[2]} · erreur ${e.name} ${e.cause ? e.cause.code || e.cause.message : ''} ${Date.now() - t0} ms`); }
    }
  }
}

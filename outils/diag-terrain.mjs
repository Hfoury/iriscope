// Diagnostic manuel : temps de réponse de la détection du terrain (essai 1.05), requête par requête.
const zones = [['Quimper', 47.996, -4.102, 20], ['Chamonix', 45.923, 6.869, 15]];
const M = 'https://overpass-api.de/api/interpreter';
const UA = { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Iriscope-diagnostic/1.0 (https://hfoury.github.io/iriscope/)' };
const parts = {
  cote: r => `way["natural"="coastline"]${r}`,
  lacs: r => `(way["natural"="water"]["water"~"lake|reservoir|pond|lagoon"]${r};relation["natural"="water"]["water"~"lake|reservoir|pond|lagoon"]${r};)`,
  rivieres: r => `way["waterway"="river"]${r}`,
  forets: r => `(way["landuse"="forest"]${r};way["natural"="wood"]${r};)`,
  bati: r => `way["landuse"~"^(residential|commercial|retail|industrial)$"]${r}`,
};
for (const [n, lat, lon, km] of zones) for (const [k, f] of Object.entries(parts)) {
  const t0 = Date.now();
  const q = `[out:json][timeout:25];${f(`(around:${km * 1000},${lat},${lon})`)};out count;`;
  try {
    const r = await fetch(M, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: UA, signal: AbortSignal.timeout(40000) });
    const t = await r.text(); let c; try { c = JSON.parse(t).elements[0].tags.total; } catch { c = t.slice(0, 80).replace(/\s+/g, ' '); }
    console.log(`${n} ${km} km · ${k} · HTTP ${r.status} · ${Date.now() - t0} ms · ${c}`);
  } catch (e) { console.log(`${n} ${km} km · ${k} · erreur ${e.name} ${Date.now() - t0} ms`); }
}

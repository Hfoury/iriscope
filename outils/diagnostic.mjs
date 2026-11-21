// Diagnostic manuel (21 nov 2026) : sources « non joignables » sur la version web (B). Vérifie statut, durée et en-tête CORS. N'écrit rien.
const today = new Date().toISOString().slice(0, 10);
const P = ['alder_pollen', 'birch_pollen', 'grass_pollen', 'mugwort_pollen', 'ragweed_pollen', 'olive_pollen'];
const U = {
  vigilance: 'https://feeds.meteoalarm.org/api/v1/warnings/feeds-france',
  vigilanceAtom: 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-france',
  air: `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=47.618,48.188&longitude=-2.919,-3.817&current=european_aqi,${P.join(',')}&timezone=Europe%2FParis`,
  vacances: `https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records?where=${encodeURIComponent(`zones="Zone B" AND end_date >= date'${today}'`)}&order_by=start_date&limit=60`,
  geo: 'https://geo.api.gouv.fr/communes?lat=47.62&lon=-2.92&fields=departement&limit=1',
};
for (let k = 0; k < 2; k++) for (const [n, u] of Object.entries(U)) {
  const t0 = Date.now();
  try {
    const r = await fetch(u, { headers: { Origin: 'https://hfoury.github.io', Accept: 'application/json, text/xml, application/xml, */*' }, signal: AbortSignal.timeout(25000) });
    const body = await r.text();
    console.log(`${n} : HTTP ${r.status} en ${Date.now() - t0} ms, ACAO=${r.headers.get('access-control-allow-origin')}, ${body.length} octets, début=${body.slice(0, 120).replace(/\s+/g, ' ')}`);
  } catch (e) { console.log(`${n} : ÉCHEC en ${Date.now() - t0} ms : ${e.message} ${e.cause ? e.cause.code || '' : ''}`); }
}

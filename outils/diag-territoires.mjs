// Diagnostic manuel (25 nov 2026) : sources pour l'outre-mer, la Corse, Jersey-Guernesey et l'Andorre. N'écrit rien.
const H = { Origin: 'https://hfoury.github.io', Accept: 'application/json, text/xml, application/xml, */*' };
async function get(n, u, show = 300) {
  const t0 = Date.now();
  try {
    const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(25000) });
    const body = await r.text();
    console.log(`\n## ${n} : HTTP ${r.status} en ${Date.now() - t0} ms, ACAO=${r.headers.get('access-control-allow-origin')}, ${body.length} octets\n${body.slice(0, show).replace(/\s+/g, ' ')}`);
    return body;
  } catch (e) { console.log(`\n## ${n} : ÉCHEC en ${Date.now() - t0} ms : ${e.message} ${e.cause ? e.cause.code || '' : ''}`); return ''; }
}
const Z = ['metropole', 'alsace-moselle', 'guadeloupe', 'guyane', 'la-reunion', 'martinique', 'mayotte', 'nouvelle-caledonie', 'polynesie-francaise', 'saint-barthelemy', 'saint-martin', 'saint-pierre-et-miquelon', 'wallis-et-futuna'];
for (const z of Z) await get(`fériés ${z} 2027`, `https://calendrier.api.gouv.fr/jours-feries/${z}/2027.json`, 1200);
await get('vigilance Andorre (json)', 'https://feeds.meteoalarm.org/api/v1/warnings/feeds-andorra', 600);
await get('vigilance Andorre (atom)', 'https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-andorra', 900);
await get('actus Jersey', 'https://www.gov.je/_layouts/15/C5.Gov.Je.CMS/Feeds/News.aspx', 900);
await get('actus Jersey (open data)', 'https://opendata.gov.je/dataset/gov-je-news', 400);
for (const q of ['Nouméa', 'Papeete', 'Mata-Utu', 'Saint-Pierre 97500', 'Marigot', 'Gustavia', 'Mamoudzou', 'Saint-Hélier', 'Saint Peter Port', 'Andorre-la-Vieille', 'Ajaccio']) {
  await get(`communes « ${q} » (Géoplateforme)`, `https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(q)}&type=municipality&limit=2`, 500);
  await get(`lieux « ${q} » (Photon)`, `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lang=fr&limit=2`, 500);
}
for (const [n, lat, lon] of [['Saint-Hélier', 49.186, -2.106], ['Andorre-la-Vieille', 42.507, 1.521], ['Nouméa', -22.276, 166.458], ['Fort-de-France', 14.604, -61.067]]) {
  const q = `[out:json][timeout:25];(nwr["amenity"="marketplace"](around:25000,${lat},${lon}););out center tags 20;`;
  await get(`marchés OSM autour de ${n}`, `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`, 500);
}

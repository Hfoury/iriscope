// Diagnostic manuel (26 nov 2026) : valeurs exactes du champ « zones » du calendrier scolaire du ministère, et prochaines vacances par territoire. N'écrit rien.
const B = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records';
const today = new Date().toISOString().slice(0, 10);
const get = async q => { const r = await fetch(`${B}?${q}`, { signal: AbortSignal.timeout(25000) }); const t = await r.text(); if (!r.ok) throw new Error(`HTTP ${r.status} ${t.slice(0, 200)}`); return JSON.parse(t); };
try {
  const z = await get(`select=zones,count(*) as n&group_by=zones&where=${encodeURIComponent(`end_date >= date'${today}'`)}&limit=100`);
  console.log('ZONES', JSON.stringify(z.results));
  for (const x of z.results) {
    const r = await get(`where=${encodeURIComponent(`zones="${x.zones}" AND end_date >= date'${today}'`)}&order_by=start_date&limit=4`);
    console.log(`\n== ${x.zones} ==`);
    for (const e of r.results) console.log(JSON.stringify({ d: e.description, s: e.start_date, e: e.end_date, loc: e.location, pop: e.population, an: e.annee_scolaire }));
  }
} catch (e) { console.log('ÉCHEC', e.message); }

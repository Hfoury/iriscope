// Diagnostic manuel (24 nov 2026) : la recherche plein texte d'OpenAgenda (ODS) tolère-t-elle les accents et les fautes ? N'écrit rien.
const ODS = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/evenements-publics-openagenda';
const geo = `within_distance(location_coordinates, geom'POINT(-2.919 47.617)', 80km) AND lastdate_end >= date'${new Date().toISOString().slice(0, 10)}'`;
for (const w of ['lumière', 'lumiere', 'lumieres', 'luliere', 'lumi']) for (const f of [`search(*, "${w}")`, `search(title_fr, "${w}")`, `suggest(title_fr, "${w}")`]) {
  try {
    const r = await fetch(`${ODS}/records?limit=3&select=title_fr&where=${encodeURIComponent(`${geo} AND ${f}`)}`, { signal: AbortSignal.timeout(25000) });
    const j = await r.json();
    console.log(`${f} : HTTP ${r.status}, total ${j.total_count}, ex. ${(j.results || []).map(x => x.title_fr).join(' | ').slice(0, 160)} ${j.message || ''}`);
  } catch (e) { console.log(`${f} : ÉCHEC ${e.message}`); }
}

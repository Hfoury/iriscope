// Diagnostic manuel : pourquoi un événement d'une ville manque (ex. Vannes, « Faites des lumières », 28 nov 2026).
const UA = { 'User-Agent': 'Iriscope-diagnostic/1.0 (https://hfoury.github.io/iriscope/)' };
const ville = process.env.VILLE || 'Vannes', mot = process.env.MOT || 'lumi';
const get = async (u, o = {}) => { const t0 = Date.now(); try { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(30000), ...o }); const t = await r.text(); return { s: r.status, t, ms: Date.now() - t0 }; } catch (e) { return { s: 0, t: String(e.cause ? e.cause.code || e.cause.message : e.message), ms: Date.now() - t0 }; } };
// 1. OpenAgenda (jeu public ODS)
const base = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/evenements-publics-openagenda/records';
let w = `location_city="${ville}" AND lastdate_end>="2026-11-24"`;
let r = await get(`${base}?limit=100&select=title_fr,firstdate_begin,location_name,originagenda_title&where=${encodeURIComponent(w)}`);
try { const j = JSON.parse(r.t); console.log(`OA ${ville} : ${j.total_count} événements à venir`); const ag = {}; for (const x of j.results) ag[x.originagenda_title] = (ag[x.originagenda_title] || 0) + 1; console.log('OA agendas :', JSON.stringify(ag)); for (const x of j.results.filter(x => (x.title_fr || '').toLowerCase().includes(mot))) console.log('OA trouvé :', x.title_fr, x.firstdate_begin, x.location_name); } catch { console.log('OA', r.s, r.t.slice(0, 200)); }
r = await get(`${base}?limit=20&select=title_fr,firstdate_begin,location_city,originagenda_title&where=${encodeURIComponent(`search("faites des lumières") AND lastdate_end>="2026-11-24"`)}`);
console.log('OA recherche titre :', r.s, r.t.slice(0, 600));
// 2. Site de la mairie
for (const u of ['https://www.mairie-vannes.fr/agenda', 'https://www.mairie-vannes.fr/', 'https://www.mairie-vannes.fr/feed/', 'https://www.mairie-vannes.fr/agenda.ics', 'https://www.tourisme-vannes.com/agenda/']) {
  r = await get(u);
  const t = r.t;
  const hints = ['openagenda', 'ical', '.ics', 'rss', 'feed', 'json', 'lumi', 'kercado', 'licence', 'license', 'tourinsoft', 'apidae', 'sitra', 'decibelles', 'datatourisme'].filter(k => t.toLowerCase().includes(k));
  console.log(`SITE ${u} · HTTP ${r.s} · ${r.ms} ms · ${t.length} car. · indices : ${hints.join(', ')}`);
  for (const m of (t.match(/https?:\/\/[^"' <>]*(openagenda|\.ics|ical|feed|rss|tourinsoft|apidae)[^"' <>]*/gi) || []).slice(0, 8)) console.log('   lien :', m);
  const i = t.toLowerCase().indexOf('lumi'); if (i >= 0) console.log('   extrait :', t.slice(Math.max(0, i - 150), i + 150).replace(/\s+/g, ' '));
}

{ const t = (await get('https://www.mairie-vannes.fr/agenda')).t;
  let k = 0, i = -1; const low = t.toLowerCase();
  while ((i = low.indexOf('ical', i + 1)) >= 0 && k++ < 6) console.log('ICAL extrait :', t.slice(Math.max(0, i - 200), i + 150).replace(/\s+/g, ' '));
  for (const m of (t.match(/(href|src|action)="[^"]*(agenda|event|evenement)[^"]*"/gi) || []).slice(0, 12)) console.log('ICAL href :', m);
  for (const w of ['licence', 'Licence', 'mentions', 'CC BY', 'Etalab', 'open data', 'opendata']) if (t.includes(w)) console.log('ICAL mot :', w);
  const j = t.toLowerCase().indexOf('faites des'); if (j >= 0) console.log('ICAL faites :', t.slice(j - 300, j + 300).replace(/\s+/g, ' '));
}

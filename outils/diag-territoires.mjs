// Diagnostic manuel (25 nov 2026) : sources pour l'outre-mer, la Corse, Jersey-Guernesey et l'Andorre. N'écrit rien.
// Vérifie que les liens officiels proposés répondent (statut et adresse finale seulement).
const U = `https://www.lesilesdeguadeloupe.com/
https://www.martinique.org/
https://www.guyane-amazonie.fr/
https://www.reunion.fr/
https://mayotte-tourisme.com/
https://www.tahititourisme.fr/
https://www.nouvellecaledonie.travel/
https://www.visit-corsica.com/
https://www.meteo.nc/
https://www.meteo.nc/nouvelle-caledonie/vigilance/vigilance-meteo
https://la1ere.franceinfo.fr/guadeloupe/
https://la1ere.franceinfo.fr/wallisfutuna/
https://www.gov.je/news/
https://www.gov.je/News/RSS/Pages/default.aspx
https://www.gov.gg/news`.split('\n');
for (const u of U) {
  const t0 = Date.now();
  try {
    const r = await fetch(u, { headers: { Accept: 'text/html,application/xhtml+xml,application/json,*/*' }, signal: AbortSignal.timeout(20000) });
    const body = await r.text();
    const title = (body.match(/<title[^>]*>([^<]*)/i) || [])[1] || '';
    console.log(`${r.status} ${u} -> ${r.url} (${body.length} o, ${Date.now() - t0} ms) ${title.trim().slice(0, 90)}`);
  } catch (e) { console.log(`ECHEC ${u} : ${e.message} ${e.cause ? e.cause.code || '' : ''}`); }
}

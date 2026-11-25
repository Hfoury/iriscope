// Diagnostic manuel (25 nov 2026) : sources pour l'outre-mer, la Corse, Jersey-Guernesey et l'Andorre. N'écrit rien.
// Vérifie que les liens officiels proposés répondent (statut et adresse finale seulement).
const U = `https://www.jersey.com/events/
https://www.visitguernsey.com/events/
https://visitandorra.com/fr/agenda/
https://www.st-martin.org/
https://www.saintbarth-tourisme.com/
https://www.wallis-et-futuna.gouv.fr/
https://www.spm-tourisme.fr/
https://vigilance.meteofrance.fr/fr/guadeloupe
https://vigilance.meteofrance.fr/fr/martinique
https://vigilance.meteofrance.fr/fr/guyane
https://vigilance.meteofrance.fr/fr/la-reunion
https://vigilance.meteofrance.fr/fr/mayotte
https://meteofrance.gp/fr/vigilance
https://meteofrance.mq/fr/vigilance
https://meteofrance.gf/fr/vigilance
https://meteofrance.re/fr/vigilance
https://meteofrance.yt/fr/vigilance
https://meteofrance.pm/fr/vigilance
https://meteofrance.wf/fr/vigilance
https://www.meteo.nc/nouvelle-caledonie/vigilance
https://meteo.pf/fr/vigilance
https://www.gov.je/weather/
https://www.meteo.ad/
https://www.gov.je/News/Pages/default.aspx
https://www.gov.je/_layouts/15/C5.Gov.Je.CMS/Feeds/GovJeNews.aspx
https://brocabrac.fr/
https://vide-greniers.org/
https://feeds.meteoalarm.org/api/v1/warnings/feeds-andorra`.split('\n');
for (const u of U) {
  const t0 = Date.now();
  try {
    const r = await fetch(u, { headers: { Accept: 'text/html,application/xhtml+xml,application/json,*/*' }, signal: AbortSignal.timeout(20000) });
    const body = await r.text();
    const title = (body.match(/<title[^>]*>([^<]*)/i) || [])[1] || '';
    console.log(`${r.status} ${u} -> ${r.url} (${body.length} o, ${Date.now() - t0} ms) ${title.trim().slice(0, 90)}`);
  } catch (e) { console.log(`ECHEC ${u} : ${e.message} ${e.cause ? e.cause.code || '' : ''}`); }
}

// Diagnostic manuel (15 nov 2026) : schéma, licence et taille des agendas repérés par le chef des sources. N'écrit rien.
const UA = 'iriscope-sources/1.0 (+https://github.com/Hfoury/iriscope)';
const L = ['data.iledefrance.fr/ile-de-france-nature-animations', 'data.paysdelaloire.fr/agenda-culture-de-la-region-des-pays-de-la-loire', 'data.cc-autourdechenonceaux.fr/attractivite-intramuros-api-agenda', 'data.laregion.fr/lagenda-des-maisons-de-la-region', 'data.nantesmetropole.fr/244400404_agenda-evenements-nantes-metropole_v2', 'data.laregion.fr/agenda-d-occitanie-musees', 'data.laregion.fr/agendas-participatif-des-sorties-en-occitanie', 'data.meudon.fr/agenda-de-la-ville-de-meudon-copie', 'opendata.isere.fr/agenda-musee-dep', 'opendata.clermontmetropole.eu/agenda-vcf', 'data.nantesmetropole.fr/244400404_agenda-animations-culturelles-bibliotheque-municipale-nantes', 'data.paysdelaloire.fr/234400034_070-002_offre-touristique-fetes_et_manifestations-rpdl'];
for (const u of L) {
  const [h, ...r] = u.split('/'); const d = r.join('/');
  try {
    const j = await (await fetch(`https://${h}/api/explore/v2.1/catalog/datasets/${d}`, { headers: { 'User-Agent': UA } })).json();
    const m = (j.metas && j.metas.default) || {};
    console.log(`== ${d} n=${m.records_count} licence=${m.license} maj=${m.data_processed || m.modified}`);
    console.log('  champs :', (j.fields || []).map(f => `${f.name}:${f.type}`).join(' '));
    const s = await (await fetch(`https://${h}/api/explore/v2.1/catalog/datasets/${d}/records?limit=1`, { headers: { 'User-Agent': UA } })).json();
    console.log('  exemple :', JSON.stringify((s.results || [])[0] || s).slice(0, 900));
  } catch (e) { console.log(`== ${d} erreur ${e.message}`); }
}

// Diagnostic (manuel) : à quoi ressemblent les affiches dans DATAtourisme et OpenAgenda (champ, licence, crédit) ?
const KEY = process.env.DATATOURISME_KEY;
const j = async (u, h = {}) => { const r = await fetch(u, { headers: { Accept: 'application/json', ...h } }); const t = await r.text(); return { s: r.status, t }; };
const base = 'https://api.datatourisme.fr/v1/entertainmentAndEvent?page_size=15&lang=fr&filters=' + encodeURIComponent(`takesPlaceAt.endDate[gte]=${new Date().toISOString().slice(0, 10)}`);
for (const f of ['uuid,label,hasRepresentation', 'uuid,label,hasRepresentation.hasRelatedResource,hasRepresentation.rdfs:comment', 'uuid,label,hasRepresentation.hasRelatedResource.license,hasRepresentation.hasRelatedResource.locator,hasRepresentation.hasRelatedResource.copyrightNotice,hasRepresentation.hasRelatedResource.rightsHolder']) {
  const r = await j(`${base}&fields=${encodeURIComponent(f)}`, { 'X-API-Key': KEY });
  console.log('=== DT champs :', f, '→ HTTP', r.s); console.log(r.t.slice(0, 3500));
}
// OpenAgenda : export public d'un agenda ouvert (champs image)
const oa = await j('https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/evenements-publics-openagenda/records?limit=5&select=uid,title_fr,image,imagecredits,license,firstdate_begin&where=' + encodeURIComponent('location_countrycode="FR" AND image IS NOT NULL'));
console.log('=== OpenAgenda → HTTP', oa.s); console.log(oa.t.slice(0, 3000));

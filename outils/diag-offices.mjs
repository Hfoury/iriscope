// Diagnostic manuel (24 nov 2026) : comment l'API DATAtourisme expose les offices de tourisme (type, site, position). N'écrit rien.
const KEY = process.env.DATATOURISME_KEY;
const H = { 'X-API-Key': KEY, Accept: 'application/json' };
const show = async (n, u) => {
  try {
    const r = await fetch(u, { headers: H, signal: AbortSignal.timeout(30000) });
    const t = await r.text();
    console.log(`\n== ${n} : HTTP ${r.status}, ${t.length} octets\n${t.slice(0, 1500)}`);
  } catch (e) { console.log(`\n== ${n} : ÉCHEC ${e.message}`); }
};
const F = 'uuid,label,type,isLocatedAt.geo,isLocatedAt.address,hasContact.homepage,hasContact.email,isOwnedBy,hasBeenCreatedBy';
await show('racine', 'https://api.datatourisme.fr/v1/');
await show('openapi', 'https://api.datatourisme.fr/v1/openapi.json');
for (const ep of ['placeOfInterest', 'pointOfInterest', 'touristInformationCenter', 'product', 'poi'])
  await show(ep, `https://api.datatourisme.fr/v1/${ep}?page_size=2&lang=fr&fields=${F}&filters=${encodeURIComponent('type[in]=TouristInformationCenter')}`);
await show('event createdBy', `https://api.datatourisme.fr/v1/entertainmentAndEvent?page_size=1&lang=fr&fields=${F}`);

// Diagnostic manuel (25 nov 2026) : sources pour l'outre-mer, la Corse, Jersey-Guernesey et l'Andorre. N'écrit rien.
// Lit une page publique et ses pages légales : statut, titre, liens utiles, passages sur la réutilisation.
const get = async u => { const r = await fetch(u, { headers: { Accept: 'text/html,*/*' }, signal: AbortSignal.timeout(20000) }); return { r, body: await r.text() }; };
const text = h => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const base = 'https://www.francebrocante.fr';
const seen = new Set();
async function look(u, deep) {
  if (seen.has(u)) return; seen.add(u);
  try {
    const { r, body } = await get(u);
    const t = text(body);
    console.log(`\n## ${r.status} ${u} -> ${r.url} (${body.length} o) ${(body.match(/<title[^>]*>([^<]*)/i) || [])[1] || ''}`);
    for (const m of t.matchAll(/[^.]{0,200}(reproduction|réutilisation|commercial|propriété intellectuelle|extraction|base de données|robots?|aspiration|lien hypertexte|liens hypertextes)[^.]{0,260}\./gi)) console.log('  >', m[0].trim().slice(0, 460));
    if (!deep) return;
    console.log('  début :', t.slice(0, 700));
    const links = [...body.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
    console.log('  liens outre-mer :', [...new Set(links.filter(l => /outre|guadeloupe|martinique|reunion|guyane|mayotte|corse|departement|region/i.test(l)))].slice(0, 40).join(' '));
    const legal = [...new Set(links.filter(l => /mention|legal|cgu|condition|contact|propos|confidential/i.test(l)))].slice(0, 6);
    console.log('  liens légaux :', legal.join(' '));
    for (const l of legal) await look(new URL(l, base).href, false);
  } catch (e) { console.log(`ECHEC ${u} : ${e.message} ${e.cause ? e.cause.code || '' : ''}`); }
}
for (const u of [`${base}/mentions-legales`, `${base}/contact`, `${base}/`]) {
  try {
    const { r, body } = await get(u);
    console.log(`\n## ${r.status} ${u}`);
    console.log('  mailto :', [...new Set([...body.matchAll(/mailto:([^"'?]+)/g)].map(m => m[1]))].join(' '));
    console.log('  adresses :', [...new Set(body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [])].slice(0, 8).join(' '));
    console.log('  liens contact :', [...new Set([...body.matchAll(/href="([^"]*(contact|redaction|ecrire|publier)[^"]*)"/gi)].map(m => m[1]))].slice(0, 8).join(' '));
    const t = text(body); const i = t.search(/[ÉE]diteur/); console.log('  éditeur :', t.slice(Math.max(0, i), i + 900));
  } catch (e) { console.log(`ECHEC ${u} : ${e.message}`); }
}

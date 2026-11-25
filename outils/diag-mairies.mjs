// Diagnostic manuel (25 nov 2026) : adresses mail des mairies d'outre-mer et de Corse dans l'annuaire officiel
// (service-public, Licence Ouverte). Ne publie rien : écrit la liste dans le journal du workflow.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
execSync('curl -sfL -o /tmp/annuaire.tar.bz2 https://lecomarquage.service-public.gouv.fr/donnees_locales_v4/all_latest.tar.bz2 && mkdir -p /tmp/annuaire && tar xjf /tmp/annuaire.tar.bz2 -C /tmp/annuaire --wildcards "*local.json"', { stdio: 'inherit' });
const f = fs.readdirSync('/tmp/annuaire', { recursive: true }).find(x => String(x).endsWith('local.json'));
const raw = JSON.parse(fs.readFileSync(`/tmp/annuaire/${f}`, 'utf8'));
const ZONES = /^(97[1-8]|98[6-8]|2A|2B)/;
let n = 0;
for (const r of raw.service || []) {
  const insee = r.code_insee_commune || '';
  if (!ZONES.test(insee)) continue;
  const piv = (r.pivot || []).map(p => p.type_service_local);
  if (!piv.includes('mairie')) continue;
  const mail = (r.adresse_courriel || []).map(x => (typeof x === 'string' ? x : x.valeur)).filter(Boolean).join(',');
  const site = ((r.site_internet || [])[0] || {}).valeur || '';
  console.log(['MAIRIE', insee, r.nom, mail, site].join(' | '));
  n++;
}
console.log(`TOTAL ${n}`);

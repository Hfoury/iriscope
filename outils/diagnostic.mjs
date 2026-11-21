// Diagnostic manuel (21 nov 2026) : structure de l'annuaire de l'administration (DILA, Licence Ouverte). N'écrit rien.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
execSync('curl -sfL -o /tmp/a.tar.bz2 https://lecomarquage.service-public.gouv.fr/donnees_locales_v4/all_latest.tar.bz2 && mkdir -p /tmp/a && tar xjf /tmp/a.tar.bz2 -C /tmp/a');
console.log(execSync('ls -laR /tmp/a | head -20').toString());
const f = execSync("find /tmp/a -name '*.json' | head -3").toString().trim().split('\n');
console.log('fichiers json', f);
const j = JSON.parse(fs.readFileSync(f[0], 'utf8'));
const arr = Array.isArray(j) ? j : j.service || j.data || Object.values(j)[0];
console.log('n=', arr.length, 'clés racine', Object.keys(j).slice(0, 5));
const types = {}; let site = 0;
for (const r of arr) { const t = (r.pivot || []).map(p => p.type_service_local).join(',') || r.type_organisme || '?'; types[t] = (types[t] || 0) + 1; if ((r.site_internet || []).length) site++; }
console.log('avec site', site); console.log(Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 25));
const m = arr.find(r => JSON.stringify(r.pivot || '').includes('mairie') && (r.site_internet || []).length);
console.log('exemple mairie', JSON.stringify(m).slice(0, 2500));
const e = arr.find(r => JSON.stringify(r.pivot || '').includes('epci'));
console.log('exemple epci', JSON.stringify(e).slice(0, 1200));

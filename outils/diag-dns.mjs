// Mesure (27 nov 2026) : le domaine d'envoi des codes (iriscope-app.fr) est-il bien authentifié (SPF, DKIM, DMARC) ? Affiche, ne publie rien.
import { promises as dns } from 'node:dns';
const show = async (label, fn) => { try { console.log(label, JSON.stringify(await fn())); } catch (e) { console.log(label, 'ABSENT', e.code || e.message); } };
const D = 'iriscope-app.fr';
await show('TXT ' + D, () => dns.resolveTxt(D));
await show('MX ' + D, () => dns.resolveMx(D));
await show('TXT _dmarc.' + D, () => dns.resolveTxt('_dmarc.' + D));
for (const s of ['brevo1', 'brevo2', 'mail', 'brevo']) {
  await show(`CNAME ${s}._domainkey.${D}`, () => dns.resolveCname(`${s}._domainkey.${D}`));
  await show(`TXT ${s}._domainkey.${D}`, () => dns.resolveTxt(`${s}._domainkey.${D}`).then(x => x.map(a => a.join('').slice(0, 80))));
}

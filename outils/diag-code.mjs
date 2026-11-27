// Mesure (27 nov 2026) : le circuit d'envoi du code de connexion répond-il ? Demande un code pour la boîte de contact du projet
// (clé publique de l'appli, la même que dans la version web) et affiche la réponse du service. Ne publie rien.
const URL_ = 'https://xbkfaeagnegjmtjbxtbi.supabase.co';
const KEY = 'sb_publishable_ZL437s7XwfNfkxr7fSs73Q_f3obrU4e';
const h = { 'Content-Type': 'application/json', apikey: KEY };
for (const p of ['/auth/v1/health', '/auth/v1/settings']) {
  const r = await fetch(URL_ + p, { headers: h }); console.log(p, r.status, (await r.text()).slice(0, 500));
}
const t0 = Date.now();
const r = await fetch(URL_ + '/auth/v1/otp', { method: 'POST', headers: h, body: JSON.stringify({ email: 'contact.iriscope@gmail.com', create_user: true }) });
console.log('/auth/v1/otp', r.status, (await r.text()).slice(0, 500), Date.now() - t0, 'ms', new Date().toISOString());

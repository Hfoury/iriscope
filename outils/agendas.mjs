// Agendas ouverts d'appoint (15 nov 2026), repérés par le chef des sources sur data.gouv.fr et vérifiés à la main :
// licence permettant l'usage commercial, données propres (pas une copie d'OpenAgenda ni de DATAtourisme), mises à jour.
// Chaque agenda donne des événements au format des tuiles (id, t, lat, lon, c, a, cp, p, d, k, u) + s (crédit) + src.
// Écartés : copies d'OpenAgenda (Pays de la Loire Culture, Meudon, Île-de-France Nature, Haute-Garonne), Maisons de la
// Région (réunions d'entreprise), agendas ministériels, bilans de subventions, bibliothèques de Nantes (sans coordonnées).
const UA = 'iriscope-sources/1.0 (+https://github.com/Hfoury/iriscope)';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ent = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/\(…\)$/, '').replace(/\s+/g, ' ').trim();
// Descriptif gardé dans les tuiles : 600 caractères au plus, coupé à la fin d'une phrase (sinon au dernier mot entier, avec « … »).
// Avant : 300 caractères tout rond, donc des textes coupés en plein mot (« Certaines sont recher »).
export const couper = (t, max = 600) => {
  const x = String(t || '').replace(/\s+/g, ' ').trim();
  if (x.length <= max) return x;
  const part = x.slice(0, max);
  const fin = Math.max(part.lastIndexOf('. '), part.lastIndexOf('! '), part.lastIndexOf('? '));
  return fin > max * 0.5 ? part.slice(0, fin + 1) : `${part.replace(/\s+\S*$/, '').replace(/[,;:(«\-–]+$/, '').trim()}…`;
};
const hm = v => String(v || '').match(/\d{2}:\d{2}/)?.[0] || '';
const d10 = v => String(v || '').slice(0, 10);
const list = v => (v == null ? [] : Array.isArray(v) ? v : String(v).split(/[;,|]/)).map(x => ent(x)).filter(Boolean);
function geoOf(r) {
  for (const v of Object.values(r)) if (v && typeof v === 'object' && v.lat != null && v.lon != null && Number.isFinite(+v.lat) && Number.isFinite(+v.lon)) return { lat: +v.lat, lon: +v.lon };
  const lat = +(r.latitude ?? r.coordonnees_y_wgs84), lon = +(r.longitude ?? r.coordonnees_x_wgs84);
  return Number.isFinite(lat) && Number.isFinite(lon) && lat && lon ? { lat, lon } : null;
}
const cpOf = (...v) => String(v.find(x => /^\d{5}$/.test(String(x || '').trim())) || '').trim();

async function ods(host, dataset, where, select = '') {
  const url = `https://${host}/api/explore/v2.1/catalog/datasets/${dataset}/exports/json?where=${encodeURIComponent(where)}${select ? `&select=${select}` : ''}`;
  for (let k = 0; ; k++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(600000) });
      if (r.ok) return await r.json();
      throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 150)}`);
    } catch (e) { if (k >= 2) throw e; await sleep(4000 * (k + 1)); }
  }
}

export const AGENDAS = [
  {
    id: 'nantes', s: 'Nantes Métropole (Licence Ouverte)',
    async lire(from, to) {
      const rows = await ods('data.nantesmetropole.fr', '244400404_agenda-evenements-nantes-metropole_v2', `date >= date'${from}' AND date <= date'${to}'`);
      const by = new Map(); // une ligne par date : on regroupe par manifestation
      for (const r of rows) {
        if (/^oui/i.test(r.annule || '') || !r.nom) continue;
        const g = geoOf(r); if (!g) continue;
        const key = `${r.id_manif || r.nom}`;
        if (!by.has(key)) by.set(key, {
          id: `nantes-${key}`, t: ent(r.nom), ...g, c: ent(r.ville), a: ent(r.adresse || r.lieu).slice(0, 80), cp: cpOf(r.code_postal),
          p: [], d: couper(ent(r.description_evt)), k: [...list(r.types_libelles), ...list(r.themes_libelles), ...(/^oui/i.test(r.gratuit || '') ? ['gratuit'] : [])].slice(0, 8),
          u: r.lien_agenda || r.url_site || '',
        });
        by.get(key).p.push({ s: d10(r.date), e: d10(r.date), st: hm(r.heure_debut), et: hm(r.heure_fin) });
      }
      return [...by.values()];
    },
  },
  {
    id: 'occitanie', s: 'Région Occitanie, agendas participatifs (Licence Ouverte)',
    async lire(from, to) {
      const rows = await ods('data.laregion.fr', 'agendas-participatif-des-sorties-en-occitanie', `date_fin >= date'${from}' AND date_debut <= date'${to}'`);
      return rows.map((r, i) => {
        const g = geoOf(r); if (!g || !r.titre) return null;
        return { id: `occ-${(r.url || '').split('-').pop() || i}`, t: ent(r.titre), ...g, c: ent(r.commune), a: ent(r.adresse).slice(0, 80), cp: cpOf((String(r.adresse || '').match(/\b\d{5}\b/) || [])[0]),
          p: [{ s: d10(r.date_debut), e: d10(r.date_fin || r.date_debut), st: '', et: '' }], d: couper(ent(r.description)), k: list(r.thematique).filter(x => x !== 'Autres'), u: r.url || '' };
      });
    },
  },
  {
    id: 'occitanie-musees', s: 'Occitanie Musées (Licence Ouverte)',
    async lire(from, to) {
      const rows = await ods('data.laregion.fr', 'agenda-d-occitanie-musees', `date_fin >= date'${from}' AND date_debut <= date'${to}'`);
      return rows.map(r => {
        const g = geoOf(r); if (!g || !r.titre) return null;
        return { id: `occm-${r.identifiant}`, t: ent(r.titre), ...g, c: ent(r.ville), a: ent(r.nom_du_lieu || r.adresse_du_lieu).slice(0, 80), cp: cpOf(r.code_postal_du_lieu),
          p: [{ s: d10(r.date_debut), e: d10(r.date_fin || r.date_debut), st: hm(r.horaire_1_debut), et: hm(r.horaire_1_fin) }], d: couper(ent(r.a_propos || r.description)),
          k: [...list(r.theme), ...(/oui/i.test(r.conditions_de_participation_gratuit_oui_non || '') ? ['gratuit'] : [])].slice(0, 8), u: r.site_web_de_l_evenement || '' };
      });
    },
  },
  {
    id: 'chenonceaux', s: 'CC Autour de Chenonceaux Bléré-Val de Cher (Licence Ouverte)',
    async lire(from, to) {
      const rows = await ods('data.cc-autourdechenonceaux.fr', 'attractivite-intramuros-api-agenda', `end_date >= date'${from}' AND start_date <= date'${to}'`);
      return rows.map(r => {
        const g = geoOf(r); if (!g || !r.title) return null;
        return { id: `ccac-${r.id}`, t: ent(r.title), ...g, c: ent(r.city_name || r.author_name?.replace(/^Mairie (de )?/i, '')), a: ent(r.address_label).slice(0, 80), cp: '',
          p: [{ s: d10(r.start_date), e: d10(r.end_date || r.start_date), st: hm(r.start_time), et: hm(r.end_time) }], d: couper(ent(r.description)), k: list(r.category_name), u: r.shared_url || '' };
      });
    },
  },
  {
    id: 'clermont', s: 'Clermont Auvergne Métropole (Licence Ouverte)',
    async lire(from, to) {
      const rows = await ods('opendata.clermontmetropole.eu', 'agenda-vcf', `ouverture_datefin >= date'${from}' AND ouverture_datedebut <= date'${to}'`);
      return rows.map(r => {
        const g = geoOf(r); if (!g || !r.nom) return null;
        return { id: `cfd-${r.id}`, t: ent(r.nom), ...g, c: ent(r.localisation_adresse_commune_nom), a: ent(r.localisation_adresse_nomdulieu || r.localisation_adresse_adresse1).slice(0, 80), cp: cpOf(r.localisation_adresse_codepostal),
          p: [{ s: d10(r.ouverture_datedebut), e: d10(r.ouverture_datefin || r.ouverture_datedebut), st: hm(r.ouverture_horaireouverture), et: hm(r.ouverture_horairefermeture) }],
          d: couper(ent(r.presentation)), k: [...list(r.informationsfeteetmanifestation_typesmanifestation_item_libellefr), ...list(r.informationsfeteetmanifestation_categories_item_libellefr)].slice(0, 8),
          u: (String(r.informations_moyenscommunication_siteweb || '').match(/https?:\/\/\S+/) || [''])[0] };
      });
    },
  },
];

// Lit tous les agendas ; un agenda en panne n'empêche jamais les autres. Renvoie { events, bilan }.
// 21 nov 2026 : OpenAgenda et Que faire à Paris passent AUSSI par les tuiles de nuit, en entier (exports complets, sans plafond).
// Avant, le téléphone les lisait seulement en direct : 300 OpenAgenda et 400 Paris au plus par zone, et une page ratée était perdue.
// Le direct reste dans l'appli pour les nouveautés du jour ; les tuiles garantissent que rien n'est oublié si un serveur flanche.
const JUNK = /emploi|m[ée]tiers?\b|recrutement|job ?dating|france travail|semaine de l.industrie|webinaire|permanence|conseil municipal|r[ée]union d.information/i;
const slot = v => { const m = String(v || '').match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?/); return m ? { d: m[1], h: m[2] || '' } : null; };
function periodsFrom(pairs, from, to) {
  const out = [];
  for (const [b, e] of pairs) {
    const x = slot(b), y = slot(e) || x; if (!x) continue;
    if (y.d < from || x.d > to) continue;
    out.push({ s: x.d, e: y.d, st: x.h, et: y.h });
  }
  return out.sort((p, q) => `${p.s}${p.st}`.localeCompare(`${q.s}${q.st}`)).slice(0, 6);
}
const parseJson = v => { if (Array.isArray(v)) return v; try { return JSON.parse(v); } catch (e) { return []; } };
AGENDAS.push(
  {
    id: 'oa', s: 'OpenAgenda (agendas publics ouverts)',
    async lire(from, to) {
      const sel = 'uid,title_fr,description_fr,firstdate_begin,lastdate_end,timings,location_coordinates,location_name,location_address,location_city,location_postalcode,keywords_fr,conditions_fr,canonicalurl';
      const where = `lastdate_end >= date'${from}' AND firstdate_begin <= date'${to}' AND location_countrycode = 'FR'`;
      let rows;
      try { rows = await ods('public.opendatasoft.com', 'evenements-publics-openagenda', where, sel); }
      catch (e) { rows = await ods('public.opendatasoft.com', 'evenements-publics-openagenda', where); }
      return rows.map(r => {
        const g = geoOf({ c: r.location_coordinates }); const t = ent(r.title_fr);
        if (!g || !t || JUNK.test(`${t} ${[].concat(r.keywords_fr || []).join(' ')}`)) return null;
        const tm = parseJson(r.timings).map(x => [x.begin || x.start, x.end]);
        const p = periodsFrom(tm.length ? tm : [[r.firstdate_begin, r.lastdate_end]], from, to);
        if (!p.length) return null;
        const free = /gratuit|libre|free/i.test(r.conditions_fr || '');
        return { id: `oa-${r.uid || t}`, t: t.slice(0, 140), ...g, c: ent(r.location_city), a: ent(r.location_name || r.location_address).slice(0, 80), cp: cpOf(r.location_postalcode),
          p, d: couper(ent(r.description_fr)), k: [...list(r.keywords_fr), ...(free ? ['gratuit'] : [])].slice(0, 8), u: r.canonicalurl || '' };
      });
    },
  },
  {
    id: 'paris', s: 'Que faire à Paris (Ville de Paris, ODbL)',
    async lire(from, to) {
      const rows = await ods('opendata.paris.fr', 'que-faire-a-paris-', `date_end >= date'${from}' AND date_start <= date'${to}'`);
      return rows.map(r => {
        const g = geoOf({ c: r.lat_lon }); const t = ent(r.title);
        if (!g || !t) return null;
        const occ = String(r.occurrences || '').split(';').map(x => x.split('_')).filter(x => x.length === 2);
        // une « occurrence » de plus de 45 jours sans détail = exposition ou offre permanente : on garde le dernier jour, l'appli la marque « longue »
        const p = periodsFrom(occ.length ? occ : [[r.date_start, r.date_end]], from, to);
        if (!p.length) return null;
        const free = /gratuit/i.test(`${r.price_type || ''} ${r.price_detail || ''}`);
        return { id: `paris-${r.id || t}`, t: t.slice(0, 140), ...g, c: ent(r.address_city || 'Paris'), a: ent(r.address_name).slice(0, 80), cp: cpOf(r.address_zipcode),
          p, d: couper(ent(r.lead_text || r.description)), k: [...list(r.qfap_tags), ...(free ? ['gratuit'] : [])].slice(0, 8), u: r.url || '' };
      });
    },
  },
);

export async function lireAgendas(from, to) {
  const events = [], bilan = {};
  for (const a of AGENDAS) {
    try {
      const got = (await a.lire(from, to)).filter(e => e && e.t && e.p.length && e.p[0].s);
      for (const e of got) {
        e.p = e.p.filter(p => p.e >= from && p.s <= to).sort((x, y) => x.s.localeCompare(y.s)).slice(0, 6);
        if (!e.p.length) continue;
        e.lat = +e.lat.toFixed(5); e.lon = +e.lon.toFixed(5); e.s = a.s; e.src = a.id;
        events.push(e);
      }
      bilan[a.id] = { ok: true, n: got.length, nom: a.s };
    } catch (e) { bilan[a.id] = { ok: false, erreur: String(e.message).slice(0, 160), nom: a.s }; }
    console.log('Agenda', a.id, JSON.stringify(bilan[a.id]));
  }
  return { events, bilan };
}

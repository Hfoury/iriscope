// Matchs des équipes nationales, tous sports (foot, rugby, hand, basket… hommes et femmes), pour les pronos (0.58.0).
// Source : Wikipédia en français (CC BY-SA, source citée). On cherche chaque nuit les pages de l'année qui utilisent
// un modèle de feuille de match (« Feuille de match », « Feuille de match handball », « Match rugby »…), on lit chaque
// feuille, et on ne garde que les matchs entre deux sélections nationales (modèles de pays, pas des clubs).
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
// codes FIFA / CIO utilisés par les modèles de Wikipédia ({{FRA football}}, {{TUR football|d}}…)
export const CODES = {
  FRA: 'France', TUR: 'Turquie', TUN: 'Tunisie', ITA: 'Italie', BEL: 'Belgique', ESP: 'Espagne', GER: 'Allemagne', ENG: 'Angleterre', SCO: 'Écosse', WAL: 'Pays de Galles',
  NIR: 'Irlande du Nord', IRL: 'Irlande', POR: 'Portugal', NED: 'Pays-Bas', SUI: 'Suisse', AUT: 'Autriche', CRO: 'Croatie', SRB: 'Serbie', SVN: 'Slovénie', SVK: 'Slovaquie',
  CZE: 'Tchéquie', POL: 'Pologne', HUN: 'Hongrie', ROU: 'Roumanie', BUL: 'Bulgarie', GRE: 'Grèce', DEN: 'Danemark', SWE: 'Suède', NOR: 'Norvège', FIN: 'Finlande', ISL: 'Islande',
  UKR: 'Ukraine', RUS: 'Russie', BLR: 'Biélorussie', LTU: 'Lituanie', LVA: 'Lettonie', EST: 'Estonie', GEO: 'Géorgie', ARM: 'Arménie', AZE: 'Azerbaïdjan', KAZ: 'Kazakhstan',
  ISR: 'Israël', CYP: 'Chypre', MLT: 'Malte', LUX: 'Luxembourg', LIE: 'Liechtenstein', AND: 'Andorre', SMR: 'Saint-Marin', MON: 'Monaco', GIB: 'Gibraltar', FRO: 'Îles Féroé',
  ALB: 'Albanie', MKD: 'Macédoine du Nord', MNE: 'Monténégro', BIH: 'Bosnie-Herzégovine', KOS: 'Kosovo', MDA: 'Moldavie',
  MAR: 'Maroc', ALG: 'Algérie', EGY: 'Égypte', SEN: 'Sénégal', CIV: "Côte d'Ivoire", CMR: 'Cameroun', NGA: 'Nigeria', GHA: 'Ghana', MLI: 'Mali', BFA: 'Burkina Faso',
  GUI: 'Guinée', COD: 'RD Congo', CGO: 'Congo', GAB: 'Gabon', RSA: 'Afrique du Sud', ZAM: 'Zambie', ANG: 'Angola', CPV: 'Cap-Vert', BEN: 'Bénin', TOG: 'Togo', NIG: 'Niger',
  MTN: 'Mauritanie', LBY: 'Libye', SUD: 'Soudan', ETH: 'Éthiopie', KEN: 'Kenya', UGA: 'Ouganda', TAN: 'Tanzanie', MAD: 'Madagascar', COM: 'Comores', GAM: 'Gambie',
  GNB: 'Guinée-Bissau', EQG: 'Guinée équatoriale', ZIM: 'Zimbabwe', MOZ: 'Mozambique', NAM: 'Namibie', BOT: 'Botswana', MWI: 'Malawi', RWA: 'Rwanda', BDI: 'Burundi', CTA: 'Centrafrique',
  CHA: 'Tchad', SLE: 'Sierra Leone', LBR: 'Liberia',
  BRA: 'Brésil', ARG: 'Argentine', URU: 'Uruguay', COL: 'Colombie', CHI: 'Chili', PER: 'Pérou', ECU: 'Équateur', PAR: 'Paraguay', BOL: 'Bolivie', VEN: 'Venezuela',
  USA: 'États-Unis', MEX: 'Mexique', CAN: 'Canada', CRC: 'Costa Rica', PAN: 'Panama', JAM: 'Jamaïque', HON: 'Honduras', SLV: 'Salvador', GUA: 'Guatemala', HAI: 'Haïti',
  TRI: 'Trinité-et-Tobago', CUW: 'Curaçao', CUB: 'Cuba', SUR: 'Suriname', NCA: 'Nicaragua', GLP: 'Guadeloupe', MTQ: 'Martinique', GUF: 'Guyane',
  JPN: 'Japon', KOR: 'Corée du Sud', PRK: 'Corée du Nord', CHN: 'Chine', AUS: 'Australie', NZL: 'Nouvelle-Zélande', IRN: 'Iran', IRQ: 'Irak', KSA: 'Arabie saoudite', QAT: 'Qatar',
  UAE: 'Émirats arabes unis', JOR: 'Jordanie', SYR: 'Syrie', LIB: 'Liban', OMA: 'Oman', BHR: 'Bahreïn', KUW: 'Koweït', UZB: 'Ouzbékistan', IND: 'Inde', THA: 'Thaïlande', VIE: 'Viêt Nam',
  IDN: 'Indonésie', MAS: 'Malaisie', PHI: 'Philippines', PLE: 'Palestine', KGZ: 'Kirghizistan', TJK: 'Tadjikistan', NCL: 'Nouvelle-Calédonie', TAH: 'Tahiti', FIJ: 'Fidji',
  SAM: 'Samoa', TGA: 'Tonga', HKG: 'Hong Kong', TPE: 'Taïwan', SIN: 'Singapour',
};
// découpe les paramètres d'un modèle en tenant compte des {{…}} et [[…]] imbriqués
export function params(body) {
  const out = {}; const parts = []; let depth = 0, cur = '';
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') { depth++; cur += two; i++; continue; }
    if ((two === '}}' || two === ']]') && depth > 0) { depth--; cur += two; i++; continue; }
    if (body[i] === '|' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += body[i];
  }
  parts.push(cur);
  parts.slice(1).forEach(p => { const k = p.indexOf('='); if (k > 0) out[p.slice(0, k).trim().toLowerCase().replace(/\s+/g, ' ')] = p.slice(k + 1).trim(); });
  return { name: parts[0].trim(), p: out };
}
// tous les modèles de premier niveau dont le nom commence par un préfixe donné
export function templates(text, test) {
  const out = []; let i = 0;
  while ((i = text.indexOf('{{', i)) >= 0) {
    let depth = 0, j = i;
    for (; j < text.length - 1; j++) { const two = text.slice(j, j + 2); if (two === '{{') { depth++; j++; } else if (two === '}}') { depth--; j++; if (!depth) break; } }
    const body = text.slice(i + 2, j - 1);
    const name = body.split('|')[0].trim();
    if (test(name)) out.push(params(body)); else { i += 2; continue; }
    i = j + 1;
  }
  return out;
}
const SPORT_WORDS = /\s+(football|rugby|rugby à xv|rugby à 7|hbf|hbm|handball|basket|basket-ball|bb|bbf|bbm|volley|volley-ball|vb|vbf|vbm|water-polo|hockey|f|m|féminin|masculin)$/i;
// l'équipe d'une case : un modèle de pays ({{FRA football|d}}, {{Slovénie HBF}}, {{France rugby}}) ; un lien [[club]] n'est pas une sélection
export function team(v) {
  if (!v) return null;
  const s = v.replace(/'''/g, '').replace(/<[^>]+>/g, '').trim();
  // un drapeau suivi d'un lien ({{NOR-d}} [[Bodø/Glimt]]) est un club, pas une sélection
  if (/\[\[/.test(s.replace(/\{\{[^{}]*\}\}/g, ''))) return null;
  const m = s.match(/\{\{([^|}]+)/);
  if (!m) return null;
  let n = m[1].trim();
  // équipes de jeunes, espoirs, réserves : pas les sélections A
  if (/\b(U\s?-?\d{2}|moins de|espoirs|juniors?|jeunes|universitaire|militaire|B)\b/i.test(n) || /moins de \d+ ans|U-?\d{2}\b/i.test(s)) return null;
  // {{FRA football}}, {{TUR football|d}} : le code doit être suivi du sport ({{FRA-d}} seul n'est qu'un drapeau)
  const code = n.match(/^([A-Z]{3})\s+(football|rugby|handball|basket|volley|hockey)/i);
  if (code) return CODES[code[1]] || null;
  if (/^(lien|date|heure|nobr|small|petit|sp|cap|drapeau|drapeaux)$/i.test(n)) return null;
  let prev; do { prev = n; n = n.replace(SPORT_WORDS, ''); } while (n !== prev);
  return /^[A-ZÀ-Ý]/.test(n) && n.length < 40 ? n : null;
}
const strip = s => String(s || '').replace(/'''|''/g, '').replace(/<ref[\s\S]*?(<\/ref>|\/>)/g, '').replace(/\{\{(?:date|date-)\|([^}]*)\}\}/gi, (x, a) => a.split('|').slice(0, 3).join(' ')).replace(/\{\{heure\|(\d+)\|(\d+)[^}]*\}\}/gi, '$1 h $2').replace(/\{\{[^{}]*\}\}/g, ' ').replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1').replace(/<br\s*\/?>/g, ' ');
export function dayOf(v) {
  const t = strip(v).toLowerCase();
  const m = t.match(/(\d{1,2})(?:er)?\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/);
  if (!m) { const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/); return iso ? iso[0] : null; }
  const mo = MOIS.findIndex(x => x.normalize('NFD').replace(/[̀-ͯ]/g, '') === m[2].normalize('NFD').replace(/[̀-ͯ]/g, ''));
  return `${m[3]}-${String(mo + 1).padStart(2, '0')}-${String(+m[1]).padStart(2, '0')}`;
}
export function timeOf(v) {
  const m = strip(v).match(/(\d{1,2})\s*h\s*(\d{2})?/i) || strip(v).match(/(\d{1,2}):(\d{2})/);
  return m ? `${String(+m[1]).padStart(2, '0')}:${m[2] || '00'}` : null;
}
export function scoreOf(v) {
  const m = strip(v).match(/(\d+)\s*[-–—:]\s*(\d+)/);
  return m ? [+m[1], +m[2]] : null;
}
// sport d'après le nom du modèle et le modèle d'équipe
function sportOf(tpl, raw) {
  const t = (tpl + ' ' + raw).toLowerCase();
  if (/rugby/.test(t)) return 'rugby';
  if (/handball|hbf|hbm/.test(t)) return 'hand';
  if (/basket/.test(t)) return 'basket';
  if (/volley/.test(t)) return 'volley';
  if (/hockey/.test(t)) return 'hockey';
  return 'foot';
}
const fem = (title, tpl, raw) => /féminin|feminin|femmes|\bhbf\b|\bbbf\b|\bvbf\b/i.test(`${title} ${tpl} ${raw}`);
export const IS_MATCH = n => /^(feuille de match|match rugby|match basket|match handball|match de basket|match de handball|basketballbox|footballbox)/i.test(n);
// toutes les rencontres entre sélections d'une page
export function nationMatches(text, title) {
  const out = [];
  for (const { name, p } of templates(text, IS_MATCH)) {
    const e1 = p['équipe 1'] || p['équipe1'] || p['equipe1'] || p['team1'] || p['domicile'];
    const e2 = p['équipe 2'] || p['équipe2'] || p['equipe2'] || p['team2'] || p['extérieur'];
    const home = team(e1), away = team(e2);
    if (!home || !away || home === away) continue;
    const date = dayOf(p.date || p['date et heure'] || '');
    if (!date) continue;
    const sport = sportOf(name, `${e1} ${e2}`);
    out.push({ sport, women: fem(title, name, `${e1} ${e2}`), date, time: timeOf(p.heure || p['date et heure'] || (p.date && /\d\s*h/.test(strip(p.date)) ? p.date : '') || ''),
      home, away, score: scoreOf(p.score || ''), round: strip(p.titre || '').replace(/\s+/g, ' ').trim().slice(0, 80) || title });
  }
  return out;
}

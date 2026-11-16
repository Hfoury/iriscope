// Copie de apps/mobile/src/moderation.js de l'appli (garder les deux identiques).
// Filtre des textes publiés par les IriScopien(ne)s (0.60.0) : commentaires des photos, textes lus dans les photos, visuels.
// Le même fichier sert dans l'appli (refus immédiat, avant l'envoi) et dans le tri de nuit d'iriscope (outils/moderation.mjs).
// Refusés : numéros de téléphone même déguisés (0-6.2-0, o6, zéro six, chiffres espacés), liens, e-mails, pseudos de messagerie,
// insultes, messages politiques. Pas de contact entre inconnus : c'est la règle d'Iriscope.
export const MAX_COMMENT = 200;

const NUM_WORDS = { zero: '0', 'zéro': '0', un: '1', une: '1', deux: '2', trois: '3', quatre: '4', cinq: '5', six: '6', sept: '7', huit: '8', neuf: '9',
  dix: '10', onze: '11', douze: '12', treize: '13', quatorze: '14', quinze: '15', seize: '16', vingt: '20', trente: '30', quarante: '40', cinquante: '50', soixante: '60',
  'soixante-dix': '70', 'quatre-vingt': '80', 'quatre-vingts': '80', 'quatre-vingt-dix': '90' };
const base = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Suite de chiffres d'un texte, une fois défaits les déguisements habituels
export function digitsOf(text) {
  let t = ` ${base(text)} `;
  // nombres écrits en lettres (« zéro six douze »), même collés par des tirets ou des points
  t = t.replace(/[a-z]+(?:-[a-z]+)*/g, w => (NUM_WORDS[w] != null ? NUM_WORDS[w] : w.split('-').every(x => NUM_WORDS[x] != null) ? w.split('-').map(x => NUM_WORDS[x]).join('') : w));
  // lettres qui imitent des chiffres quand elles touchent un chiffre (o6, 0l, 6s…)
  for (let k = 0; k < 3; k++) t = t.replace(/(\d)[\s._\-/|]*([oilsbzg])(?=[\s._\-/|]*\d|\b)/g, (x, d, c) => d + ({ o: '0', i: '1', l: '1', s: '5', b: '8', z: '2', g: '9' }[c]))
    .replace(/\b([oilszg])[\s._\-/|]*(?=\d)/g, (x, c) => ({ o: '0', i: '1', l: '1', s: '5', z: '2', g: '9' }[c]));
  return t;
}
// Un numéro : 8 chiffres ou plus d'affilée une fois retirés espaces, points, tirets, barres, parenthèses (et 06/07/+33 dès 6 chiffres)
export function hasPhone(text) {
  // les dates complètes (12/05/2026) ne sont pas des numéros
  const t = digitsOf(String(text || '').replace(/\b\d{1,2}[/.-]\d{1,2}[/.-](19|20)\d{2}\b/g, ' '));
  const runs = t.replace(/[\s._\-/|()+*,:;'"~]+/g, '').match(/\d{6,}/g) || [];
  return runs.some(r => r.length >= 8 || /^(0[1-9]|33|0033)/.test(r));
}
const LINK = /(https?:|www\.|\.(com|fr|net|org|io|be|ch|me|ly|gg)\b|\bpoint\s*(com|fr|net)\b|@[a-z0-9_.]{2,}|\barobase\b)/i;
const CONTACT = /\b(insta(gram)?|snap(chat)?|whats ?app|wh?ats?app|telegram|tiktok|facebook|fb|messenger|discord|signal|appelle[sz]?[- ]?moi|ecris[- ]?moi|contacte[sz]?[- ]?moi|mon (num|numero|tel|tél|portable|0[67])|mp moi|dm moi|en prive)\b/i;
// insultes (y compris abréviations courantes) ; liste volontairement courte et sans faux amis (« con » seul est trop fréquent dans « concert »)
const INSULT = /\b(connard|connasse|conne|pute|putain de|salope|salaud|encul\w*|batard|bâtard|fdp|ntm|tg|nique|niquer|ta gueule|ta mere|pd|pédé|pede|tapette|negro|négro|bougnoul\w*|youpin|raton|bicot|chintok|gouine|enfoire|enfoiré|abruti|debile|débile|merdeux|trou du cul|bite|couille[s]?|chatte|sucer|suce|branl\w*|nazi[s]?|sieg heil)\b/i;
// politique : partis, figures et slogans ; une sortie ne sert pas de tribune
const POLITIC = /\b(macron\w*|le ?pen|marine le pen|bardella|zemmour|melenchon|mélenchon|lfi|insoumis|rassemblement national|front national|reconquete|reconquête|parti renaissance|ps|lr|les republicains|républicains|ecolos?|eelv|nupes|nfp|nouveau front populaire|gauchiste[s]?|facho[s]?|fasciste[s]?|islamo\w*|wokis\w*|votez|vote(z)? pour|elections?|élections?|presidentielle|présidentielle|legislatives|législatives|manif(estation)? contre|gouvernement|ministre|depute|député|senateur|sénateur|maire de (gauche|droite)|extreme (gauche|droite)|extrême (gauche|droite)|palestin\w*|israel\w*|israël\w*|hamas|ukraine|poutine|trump|biden)\b/i;

// Lettres déguisées par des chiffres ou des symboles (« s4l0pe », « p.u.t.e ») : on les remet en lettres pour chercher les mots
function letters(text) {
  return base(text).replace(/[0@]/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5|\$/g, 's').replace(/7/g, 't').replace(/8/g, 'b')
    .replace(/(\b\w)[.\-_*\s](?=\w\b)/g, '$1');
}

// { ok: true } ou { ok: false, why } ; why est montré tel quel à l'auteur
export function checkText(text, max = MAX_COMMENT) {
  const s = String(text || '');
  if (s.length > max) return { ok: false, why: `${max} caractères au plus` };
  if (hasPhone(s)) return { ok: false, why: 'Pas de numéro de téléphone' };
  const b = base(s);
  if (LINK.test(b) || LINK.test(s)) return { ok: false, why: "Pas de lien ni d'adresse e-mail" };
  if (CONTACT.test(b)) return { ok: false, why: 'Pas de moyen de contact : Iriscope ne met pas les inconnus en relation' };
  if (INSULT.test(b) || INSULT.test(letters(s))) return { ok: false, why: 'Message refusé : propos insultant' };
  if (POLITIC.test(b)) return { ok: false, why: 'Message refusé : pas de politique sur les sorties' };
  return { ok: true };
}

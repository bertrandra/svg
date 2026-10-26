// Les petites aides de texte que plusieurs couches partagent.

import { langue, t, traduction } from './i18n.js';

/**
 * Un mot au pluriel : un « s » de plus, sauf aux mots deja termines par s, x ou z, qui ne changent pas (« tapis »,
 * « prix », « nez »). Une expression de plusieurs mots s'accorde mot a mot (« petite forme », « petites formes ») :
 * c'est le cas de nos libelles, un nom et son adjectif. Les pluriels irreguliers (-al, -eau) n'y sont pas : aucun
 * libelle de l'interface n'en emploie, et une regle de plus serait une regle a tenir ; `pluriel` les recoit entiers.
 * La regle vaut aussi pour l'anglais courant (ADR-0042) ; une exception (« copy », « copies ») se donne au dictionnaire.
 */
export const auPluriel = (mot: string): string => mot.split(' ').map(m => (m === '' || /[sxz]$/i.test(m) ? m : m + 's')).join(' ');

/**
 * « 1 forme », « 3 formes », « 2 tapis » : le nombre, un blanc, le mot, accorde en nombre au-dela de un. Un pluriel irregulier se
 * donne entier : `pluriel(n, 'cheval', 'chevaux')`. Le mot passe par `t` (ADR-0042) : dans une autre langue, le singulier est
 * son entree du dictionnaire, et le pluriel l'entree de la forme plurielle francaise (« copies » : « copies ») quand le
 * dictionnaire la donne, sinon la regle d'`auPluriel` sur le singulier traduit (« shape », « shapes »).
 */
export function pluriel(n: number, mot: string, plurielIrregulier?: string): string {
  if (n <= 1) return n + ' ' + t(mot);
  const forme = plurielIrregulier ?? auPluriel(mot);
  // Un mot invariable en francais (« tapis ») ne l'est pas forcement ailleurs : son entree est celle du singulier, pas d'un pluriel.
  const traduite = forme === mot ? undefined : traduction(forme);
  return n + ' ' + (traduite ?? (langue() === 'fr' ? forme : auPluriel(t(mot))));
}

/**
 * Les verbes de la souris, dits au doigt : une aide qui dit « Cliquez » a quelqu'un qui touche l'ecran le fait chercher
 * un geste qu'il n'a pas. Les remplacements vont du plus long au plus court, pour que « double-cliquez » ne devienne
 * pas « double-touchez ». Glisser, maintenir et choisir valent pour les deux : ils restent. Sans doigt, la phrase est rendue telle quelle.
 */
const AU_DOIGT: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bDouble-cliquez\b/g, 'Touchez deux fois'],
  [/\bdouble-cliquez\b/g, 'touchez deux fois'],
  [/\bdouble-clic\b/g, 'double appui'],
  [/\bUn clic\b/g, 'Un appui'],
  [/\bun clic\b/g, 'un appui'],
  [/\bCliquez\b/g, 'Touchez'],
  [/\bcliquez\b/g, 'touchez']
];

export function selonSaisie(phrase: string, doigt: boolean): string {
  return doigt ? AU_DOIGT.reduce((t, [motif, mot]) => t.replace(motif, mot), phrase) : phrase;
}

/**
 * La distance d'edition (Damerau-Levenshtein restreinte : insertion, suppression, substitution, inversion de deux lettres
 * voisines) entre deux mots, bornee : au-dela de `plafond`, on rend `plafond + 1` sans finir le calcul. Une faute de frappe
 * (« halowen », « guitarre ») est a une ou deux operations du mot voulu.
 */
export function distanceEdition(a: string, b: string, plafond = 2): number {
  if (Math.abs(a.length - b.length) > plafond) return plafond + 1;
  // Trois lignes de la matrice suffisent : l'inversion lit deux lignes en arriere.
  let precedente: number[] = [];
  let courante: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const suivante: number[] = [i];
    let minimum = i;
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min((courante[j] ?? 0) + 1, (suivante[j - 1] ?? 0) + 1, (courante[j - 1] ?? 0) + cout);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, (precedente[j - 2] ?? 0) + 1);
      suivante.push(d);
      minimum = Math.min(minimum, d);
    }
    if (minimum > plafond) return plafond + 1;
    precedente = courante;
    courante = suivante;
  }
  return Math.min(courante[b.length] ?? plafond + 1, plafond + 1);
}

/**
 * La typographie francaise : une espace insecable avant « ; : ? ! » et le guillemet fermant, apres le guillemet ouvrant. Sans elle,
 * une ligne etroite (une bulle sur un telephone) commence par « ; » ou laisse un « « » seul en fin de ligne.
 */
export const insecables = (t: string): string => t.replace(/ ([;:?!»])/g, ' $1').replace(/« /g, '« ');

/** La longueur d'un nom de fichier propose : au-dela, un nom de forme n'est plus un nom, et certains systemes coupent. */
const LONGUEUR_NOM_FICHIER = 80;

/**
 * Un nom de fichier tire d'un nom affiche (« Bonhomme de neige » donne « bonhomme-de-neige ») : minuscules, sans accents ni
 * ligatures, un tiret pour tout ce qui n'est ni lettre ni chiffre, sans tiret au bord. Pourquoi : le fichier d'une forme de la
 * bibliotheque portait son identifiant anglais, que la personne n'a jamais vu ; un nom sans espace ni accent passe partout
 * (Design Space, un courriel, un serveur). Un nom qui ne garde rien (« ??? ») rend `secours`.
 */
export function nomDeFichier(texte: string, secours = 'dessin'): string {
  const base = texte.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const court = base.slice(0, LONGUEUR_NOM_FICHIER).replace(/-+$/, '');
  return court || secours;
}

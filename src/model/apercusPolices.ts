// Les apercus des polices (ADR-0026) : le nom de chaque famille dessine dans sa propre fonte, en contours, pour que la liste
// « Toutes les polices » montre l'allure d'une police sans rien telecharger. Ce module porte la forme d'un apercu (un trace en
// coordonnees entieres sur un corps de 32 unites), son codage compact, et la validation de l'annexe qui les livre
// (dist/polices-apercus.js, tiree de l'instantane commis data/apercus-polices.json). Pur : des donnees en entree et en sortie.
//
// Pourquoi un codage a soi plutot qu'un attribut `d` : plus de deux mille noms, une douzaine de lettres chacun. En chemin SVG
// relatif, une lettre coute une centaine de caracteres ; ici chaque coordonnee est un ecart au point precedent, ecrit en
// longueur variable (un caractere de -15 a 15, deux jusqu'a 511), et la lettre de commande ne se repete pas. Le texte reste
// du JSON sans echappement (ni guillemet, ni barre oblique inverse, ni chevron) : l'annexe se pose par une balise <script>.

/** Une commande d'un apercu, en absolu, coordonnees entieres (Y vers le bas, la ligne de base en y = 0). */
export interface CommandeApercu { readonly c: 'M' | 'L' | 'Q' | 'C' | 'Z'; readonly p: readonly number[] }

/** Un apercu : sa largeur (le trace commence en x = 0) et ses commandes. */
export interface TraceApercu { readonly largeur: number; readonly commandes: readonly CommandeApercu[] }

/**
 * Le cadre de tous les apercus : le corps de composition (32 unites par em), la hauteur gardee au-dessus et au-dessous de la
 * ligne de base, et la largeur au-dela de laquelle on ne dessine plus de lettre (une ligne de la liste n'en montre pas plus).
 * Le meme pour toutes les familles : les polices se comparent a la meme taille, comme sur un specimen.
 */
export const CADRE_APERCU = { corps: 32, haut: 30, bas: 13, largeurMax: 400 } as const;

/** Les bornes d'une annexe : au-dela, ce n'est pas une annexe de ce programme (ADR-0014 : refusee sans lever). */
export const LIMITES_APERCUS = { entrees: 10_000, code: 8_192, total: 6 * 1024 * 1024, coordonnee: 4_096, commandes: 4_000 } as const;

// Soixante-quatre caracteres pour les nombres, sans les cinq lettres de commande, sans guillemet, barre oblique inverse ni chevron.
const CHIFFRES = '0123456789abcdefghijklmnopqrstuvwxyzABDEFGHIJKNOPRSTUVWXY-_+*~^!';
const VALEUR: ReadonlyMap<string, number> = new Map([...CHIFFRES].map((c, i) => [c, i]));
const ARITE: Readonly<Record<CommandeApercu['c'], number>> = { M: 2, L: 2, Q: 4, C: 6, Z: 0 };
/** Le code entier : la largeur puis les commandes, rien d'autre que ces caracteres. */
const CODE = /^[0-9a-zA-Z\-_+*~^!]*$/;

/** Un entier en longueur variable : le signe dans le bit faible, cinq bits par caractere, le sixieme dit « la suite vient ». */
function ecrireNombre(n: number): string {
  let u = n < 0 ? (-n << 1) | 1 : n << 1, s = '';
  do {
    let g = u & 31;
    u >>>= 5;
    if (u > 0) g |= 32;
    s += CHIFFRES.charAt(g);
  } while (u > 0);
  return s;
}

/** Le code compact d'un apercu. Les coordonnees doivent etre entieres et dans les bornes (le script et le moteur les arrondissent). */
export function encoderApercu(t: TraceApercu): string {
  let s = ecrireNombre(t.largeur), precedente = '', x = 0, y = 0, dx = 0, dy = 0;
  for (const c of t.commandes) {
    // La lettre ne se repete pas : apres M, des points sans lettre sont des L, comme dans un chemin SVG.
    const implicite = c.c !== 'M' && c.c !== 'Z' && (precedente === c.c || (precedente === 'M' && c.c === 'L'));
    if (!implicite) s += c.c;
    precedente = c.c;
    if (c.c === 'Z') { x = dx; y = dy; continue; }
    for (let i = 0; i + 1 < c.p.length; i += 2) {
      const px = c.p[i] ?? 0, py = c.p[i + 1] ?? 0;
      s += ecrireNombre(px - x) + ecrireNombre(py - y);
      x = px; y = py;
    }
    if (c.c === 'M') { dx = x; dy = y; }
  }
  return s;
}

/** Le trace d'un code compact, ou null s'il est mal forme (caractere inconnu, commande tronquee, coordonnee hors bornes). Ne leve jamais. */
export function decoderApercu(code: string): TraceApercu | null {
  if (typeof code !== 'string' || code.length > LIMITES_APERCUS.code || !CODE.test(code)) return null;
  let i = 0;
  const nombre = (): number | null => {
    let u = 0, decalage = 0;
    for (;;) {
      const v = i < code.length ? VALEUR.get(code.charAt(i)) : undefined;
      if (v === undefined || decalage > 15) return null;
      i++;
      u += (v & 31) * 2 ** decalage;
      decalage += 5;
      if (!(v & 32)) break;
    }
    return u % 2 ? -(u - 1) / 2 : u / 2;
  };
  const largeur = nombre();
  if (largeur === null || largeur < 0 || largeur > LIMITES_APERCUS.coordonnee) return null;
  const commandes: CommandeApercu[] = [];
  let courante: CommandeApercu['c'] | null = null, x = 0, y = 0, dx = 0, dy = 0;
  while (i < code.length) {
    const ch = code.charAt(i);
    if (ch === 'M' || ch === 'L' || ch === 'Q' || ch === 'C' || ch === 'Z') { courante = ch; i++; }
    else if (courante === null || courante === 'Z') return null;
    else if (courante === 'M') courante = 'L';
    if (commandes.length === 0 && courante !== 'M') return null;
    if (commandes.length >= LIMITES_APERCUS.commandes) return null;
    if (courante === 'Z') { commandes.push({ c: 'Z', p: [] }); x = dx; y = dy; continue; }
    const p: number[] = [];
    for (let k = 0; k < ARITE[courante]; k += 2) {
      const ex = nombre(), ey = ex === null ? null : nombre();
      if (ex === null || ey === null) return null;
      x += ex; y += ey;
      if (Math.abs(x) > LIMITES_APERCUS.coordonnee || Math.abs(y) > LIMITES_APERCUS.coordonnee) return null;
      p.push(x, y);
    }
    if (courante === 'M') { dx = x; dy = y; }
    commandes.push({ c: courante, p });
  }
  return { largeur, commandes };
}

/** L'attribut `d` d'un apercu, en absolu et en entiers : ce que la ligne de la liste dessine. */
export function cheminApercu(t: TraceApercu): string {
  let s = '';
  for (const c of t.commandes) {
    s += c.c;
    for (let i = 0; i < c.p.length; i++) s += (i ? (c.p[i] ?? 0) < 0 ? '' : ' ' : '') + String(c.p[i] ?? 0);
  }
  return s;
}

/** La boite de vue d'un apercu : le cadre commun, de la largeur du trace. */
export const vueApercu = (t: TraceApercu): string => '0 ' + -CADRE_APERCU.haut + ' ' + Math.max(1, t.largeur) + ' ' + (CADRE_APERCU.haut + CADRE_APERCU.bas);

// --- L'annexe : un fichier, on ne la croit pas sur parole ---

/** L'annexe lue : la date de l'instantane, le corps, et les codes par cle de famille (`depot:id`, celle des favoris). */
export interface AnnexeApercus {
  readonly format: 1;
  readonly instantane: string;
  readonly apercus: ReadonlyMap<string, string>;
}

/** La cle d'une famille de l'index : son depot et son identifiant (model/cataloguePolices.ts). */
const CLE = /^(?:fontsource|velvetyne|fontshare):[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * L'annexe validee, ou la raison de la refuser. On verifie la forme, le cadre (le meme que celui du programme : un apercu
 * dessine a un autre corps serait mal place), chaque cle, chaque code (ses caracteres et sa longueur) et la taille totale.
 * Un code se decode a l'affichage, et un code qui ne se decode pas laisse simplement la ligne a son nom ecrit.
 */
export function validerApercus(v: unknown): AnnexeApercus | { erreur: string } {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return { erreur: 'l’annexe des aperçus n’est pas un objet' };
  const o = v as Record<string, unknown>;
  if (o.format !== 1) return { erreur: 'format d’aperçus inconnu' };
  if (typeof o.instantane !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.instantane)) return { erreur: 'date d’instantané invalide' };
  if (o.corps !== CADRE_APERCU.corps || o.haut !== CADRE_APERCU.haut || o.bas !== CADRE_APERCU.bas) return { erreur: 'cadre des aperçus différent de celui du programme' };
  const brut = o.apercus;
  if (typeof brut !== 'object' || brut === null || Array.isArray(brut)) return { erreur: 'aperçus absents' };
  const cles = Object.keys(brut);
  if (cles.length > LIMITES_APERCUS.entrees) return { erreur: 'trop d’aperçus' };
  const apercus = new Map<string, string>();
  let total = 0;
  for (const cle of cles) {
    const code = (brut as Record<string, unknown>)[cle];
    if (!CLE.test(cle)) return { erreur: 'clé d’aperçu invalide (' + cle.slice(0, 40) + ')' };
    if (typeof code !== 'string' || !code.length || code.length > LIMITES_APERCUS.code || !CODE.test(code)) return { erreur: cle + ' : aperçu invalide' };
    total += code.length;
    if (total > LIMITES_APERCUS.total) return { erreur: 'annexe des aperçus trop grosse' };
    apercus.set(cle, code);
  }
  return { format: 1, instantane: o.instantane, apercus };
}

// La mise en page d'un PDF : la taille de la page, la marge, le fond perdu et les reperes de coupe, plus les
// metadonnees. Pur. Tout est calcule en points (1/72 pouce) ; les options se donnent en millimetres.
//
// Les boites d'une page imprimee : `TrimBox` est la page finie (apres coupe), `BleedBox` la depasse du fond
// perdu (ce qui doit deborder pour qu'une coupe approximative ne laisse pas de litere blanc), `MediaBox` et
// `CropBox` englobent en plus la marge des reperes. Le dessin est coupe au `BleedBox` : un trace qui deborde
// du plan ne pollue pas la zone des reperes.

import { MM_PAR_POUCE, PT_PAR_POUCE, poucesParUnite, tailleValide, type Taille } from './dimensions.js';

export type FormatPage = 'dessin' | 'A4' | 'A3' | 'Letter' | { readonly largeur: number; readonly hauteur: number };

/** Les formats normalises, en millimetres, portrait. */
export const PAGES_MM: Readonly<Record<'A4' | 'A3' | 'Letter', readonly [number, number]>> = { A4: [210, 297], A3: [297, 420], Letter: [215.9, 279.4] };

export interface OptionsPdf {
  /** Des couleurs en DeviceCMYK naif (`versCmjnNaif`, sans profil ICC) au lieu de DeviceRGB. */
  readonly cmjn?: boolean;
  readonly titre?: string;
  readonly producteur?: string;
  /** La page : `dessin` (defaut) la taille du plan plus la marge ; un format fixe y ajuste le dessin. */
  readonly page?: FormatPage;
  /** La marge autour du dessin, en mm (dans la page finie). */
  readonly marge?: number;
  /** Le fond perdu autour de la page finie, en mm ; 0 ou absent : aucun. */
  readonly fondPerdu?: number;
  /** Les reperes de coupe, hors du fond perdu. */
  readonly reperes?: boolean;
  /** La largeur voulue du dessin ; absente, il garde sa taille (un point par unite sur `dessin`, ajuste sur un format). */
  readonly taille?: Taille | null;
}

type Boite4 = readonly [number, number, number, number];

export interface MiseEnPage {
  readonly media: Boite4;
  readonly trim: Boite4;
  readonly bleed: Boite4;
  /** Vrai si les boites TrimBox/BleedBox/CropBox s'ecrivent (il y a un fond perdu ou des reperes). */
  readonly boites: boolean;
  readonly echelle: number;
  readonly dx: number;
  readonly dy: number;
  readonly reperes: boolean;
}

const nb = (v: number) => { const r = Number(v.toFixed(3)); return Object.is(r, -0) ? '0' : String(r); };
const mmEnPt = (mm: number) => (mm * PT_PAR_POUCE) / MM_PAR_POUCE;
const borne = (v: number | undefined, max: number) => (v !== undefined && Number.isFinite(v) && v > 0 ? Math.min(v, max) : 0);

/** Le jeu de reperes : decalage au-dela du fond perdu, et longueur, en mm. */
const DECALAGE_REPERE_MM = 1, LONGUEUR_REPERE_MM = 5;

/**
 * La mise en page demandee, ou null si les options n'en changent rien (page = plan, un point par unite,
 * aucune marge, aucun fond perdu) : le PDF reste alors celui d'avant, octet pour octet.
 */
export function miseEnPage(vb: readonly [number, number, number, number], o: OptionsPdf): MiseEnPage | null {
  const [, , l, h] = vb, taille = tailleValide(o.taille);
  const fixe = o.page !== undefined && o.page !== 'dessin';
  const marge0 = borne(o.marge, 500), fond = borne(o.fondPerdu, 50), reperes = o.reperes === true;
  if (!fixe && !taille && marge0 === 0 && fond === 0 && !reperes) return null;
  let tw: number, th: number, k: number;
  if (fixe) {
    const dims = typeof o.page === 'object' ? [o.page.largeur, o.page.hauteur] as const : PAGES_MM[o.page as 'A4' | 'A3' | 'Letter'];
    const valides = dims[0] > 0 && dims[1] > 0 && Number.isFinite(dims[0]) && Number.isFinite(dims[1]);
    let [pw, ph] = valides ? [mmEnPt(dims[0]), mmEnPt(dims[1])] : [l, h];
    // La page prend l'orientation du dessin : un plan large sur une page debout se retrouverait minuscule.
    if (valides && (l > h) !== (pw > ph)) [pw, ph] = [ph, pw];
    const m = Math.min(mmEnPt(marge0), 0.45 * Math.min(pw, ph));
    k = taille ? poucesParUnite(vb, taille) * PT_PAR_POUCE : Math.min((pw - 2 * m) / Math.max(l, 1e-9), (ph - 2 * m) / Math.max(h, 1e-9));
    [tw, th] = [pw, ph];
  } else {
    k = taille ? poucesParUnite(vb, taille) * PT_PAR_POUCE : 1;
    const m = mmEnPt(marge0);
    [tw, th] = [l * k + 2 * m, h * k + 2 * m];
  }
  const b = mmEnPt(fond), e = b + (reperes ? mmEnPt(DECALAGE_REPERE_MM + LONGUEUR_REPERE_MM) : 0);
  return {
    media: [0, 0, tw + 2 * e, th + 2 * e], trim: [e, e, e + tw, e + th], bleed: [e - b, e - b, e + tw + b, e + th + b],
    boites: e > 0, echelle: k, dx: e + (tw - l * k) / 2, dy: e + (th - h * k) / 2, reperes
  };
}

export const tableau = (b: Boite4) => '[' + b.map(nb).join(' ') + ']';

/**
 * Le flux d'une page mise en page : le dessin coupe au fond perdu, mis a l'echelle et place, puis les
 * reperes de coupe. `contenu` est le trace du dessin, dans le repere du plan (origine en bas a gauche).
 */
export function fluxMisEnPage(contenu: string, m: MiseEnPage, cmjn: boolean): string {
  const [bx0, by0, bx1, by1] = m.bleed, lignes: string[] = [];
  if (m.boites) lignes.push('q', nb(bx0) + ' ' + nb(by0) + ' ' + nb(bx1 - bx0) + ' ' + nb(by1 - by0) + ' re W n');
  // L'echelle s'ecrit a six decimales : trois feraient deriver une grande page de plusieurs dixiemes de point.
  const e = Number(m.echelle.toFixed(6));
  lignes.push('q', [String(e), '0', '0', String(e), nb(m.dx), nb(m.dy)].join(' ') + ' cm', contenu, 'Q');
  if (m.boites) lignes.push('Q');
  if (m.reperes) lignes.push(reperes(m, cmjn));
  return lignes.join('\n');
}

/** Les reperes de coupe : deux traits par coin, hors du fond perdu, en couleur de repere (tous les encres en CMJN). */
function reperes(m: MiseEnPage, cmjn: boolean): string {
  const [x0, y0, x1, y1] = m.trim;
  const d = m.trim[0] - m.bleed[0] + mmEnPt(DECALAGE_REPERE_MM), long = mmEnPt(LONGUEUR_REPERE_MM);
  const l: string[] = ['q', cmjn ? '1 1 1 1 K' : '0 G', '0.25 w'];
  const trait = (a: number, b: number, c: number, e: number) => l.push(nb(a) + ' ' + nb(b) + ' m ' + nb(c) + ' ' + nb(e) + ' l S');
  for (const y of [y0, y1]) { trait(x0 - d, y, x0 - d - long, y); trait(x1 + d, y, x1 + d + long, y); }
  for (const x of [x0, x1]) { trait(x, y0 - d, x, y0 - d - long); trait(x, y1 + d, x, y1 + d + long); }
  l.push('Q');
  return l.join('\n');
}

/** Une chaine de texte PDF : ASCII entre parentheses, sinon UTF-16BE avec marque d'ordre en hexadecimal. */
export function chainePdf(t: string): string {
  const propre = Array.from(t, c => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? ' ' : c)).join('');
  if (/^[\x20-\x7e]*$/.test(propre)) return '(' + propre.replace(/[\\()]/g, c => '\\' + c) + ')';
  let hex = 'FEFF';
  for (let i = 0; i < propre.length; i++) hex += propre.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0');
  return '<' + hex + '>';
}

/** Le dictionnaire d'informations : `Producer` seul (comme avant) ou avec un titre. Aucune date : le meme dessin, les memes octets. */
export function infoPdf(o: OptionsPdf): string {
  return '<< ' + (o.titre ? '/Title ' + chainePdf(o.titre) + ' ' : '') + '/Producer ' + chainePdf(o.producteur ?? 'svg') + ' >>';
}

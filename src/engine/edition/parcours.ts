// La marche d'un SVG vers des formes a plat : on descend l'arbre en portant la matrice, l'heritage et l'opacite
// des ancetres, chaque forme lue devient une forme du dessin. Les groupes se fondent dans leurs enfants ; un
// <use> se deplie en autant de formes independantes (ids neufs) que sa cible en porte, avec l'heritage DU <use>
// (un clone voit les valeurs heritees du <use>, pas celles du parent d'origine de sa cible, comme en CSS).
// Ce qui ne se ramene pas a des chemins pleins est refuse en le nommant. Pur.

import type { Noeud } from '../../util/xml.js';
import type { Forme, Matrice } from './types.js';
import { IDENTITE } from './types.js';
import { facteur, lireTransformation, multiplier, transformerChemin, translation } from './geometrie.js';
import { COULEUR_COURANTE, lirePeintureAlpha } from './peinture.js';
import { lireTrait } from './trait.js';
import { lireOpacite } from './opacites.js';
import { ATTRIBUT_ORIGINE, lireOrigines } from './provenance.js';
import { cheminDeForme } from './elements.js';
import { heriter, lireEpaisseur, lireOpacites, peinture, refusDe } from './heritage.js';
import { proprietesDe, type Analyse } from './cascade.js';
import { ANIMATIONS, MSG_ANIMATIONS, MSG_SYMBOLE_ROGNE, MSG_USE_ABSENT, ignoresDeMarqueurs, type Proprietes } from './ignores.js';
import { peintureSure } from './peinture.js';
import { COORDONNEE_MAX, coordonneeSaine, DONNEES_TRACE_MAX, PROFONDEUR_MARCHE_MAX } from './limites.js';
import {
  cibleDe, depasseDuCadre, CLONES_MAX, inverse, lireAspect, lireVue, longueurUse, matriceCadre, PROFONDEUR_USE_MAX, type Cadre
} from './clones.js';

const IGNORES = new Set(['defs', 'title', 'desc', 'metadata', 'style', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'pattern', 'symbol', 'marker', 'filter']);
const NON_PRIS: ReadonlyMap<string, string> = new Map([
  ['text', 'du texte (vectorisez-le dans votre logiciel)'], ['image', 'une image'], ['foreignObject', 'un objet étranger'],
  ['svg', 'un SVG imbriqué'], ['switch', 'un aiguillage <switch>']
]);

/** Ce que la marche partage : le document analyse, le plan, et ce qu'elle ramasse (formes, refus ; les pertes sont celles de l'analyse). */
export interface Parcours {
  readonly analyse: Analyse;
  readonly plan: readonly [number, number, number, number];
  readonly formes: Forme[];
  readonly refus: Set<string>;
  /** Les elements sur le chemin en cours (groupes et <use> compris) : une cible qui y figure est un cycle. */
  readonly actifs: Set<Noeud>;
  /** Combien de clones la marche a deplies ou produits (bornes par `CLONES_MAX`). */
  clones: number;
  /** Vrai une fois la borne des clones franchie : on cesse de marcher, le SVG est refuse. */
  trop: boolean;
  /** Caracteres de trace lus jusqu'ici, clones compris (bornes par `DONNEES_TRACE_MAX`). */
  donnees: number;
}

/** Ce que les enfants d'un element recoivent. `profondeur` compte les <use> emboites. */
export interface Contexte { readonly m: Matrice; readonly heritees: Proprietes; readonly opacite: number; readonly profondeur: number }

/** Un element prepare : son contexte (matrice et opacite avec les siennes) et ses proprietes propres. */
interface Pret extends Contexte { readonly pr: Proprietes }

/** Le contexte d'un element, ou null s'il ne se dessine pas (cache) ou se refuse (nomme dans `refus`). */
function preparer(p: Parcours, n: Noeud, ctx: Contexte): Pret | null {
  const pr = proprietesDe(p.analyse, n);
  if ((pr.display ?? '').trim() === 'none') return null;
  const nonPris = NON_PRIS.get(n.nom);
  if (nonPris) { p.refus.add(nonPris); return null; }
  const refusNoeud = refusDe(pr);
  if (refusNoeud) { p.refus.add(refusNoeud); return null; }
  const t = n.attributs.transform ? lireTransformation(n.attributs.transform) : IDENTITE;
  if (!t) { p.refus.add('une transformation illisible'); return null; }
  return {
    pr,
    heritees: heriter(ctx.heritees, pr),
    opacite: ctx.opacite * (pr.opacity !== undefined ? lireOpacite(pr.opacity) : 1),
    m: multiplier(ctx.m, t),
    profondeur: ctx.profondeur
  };
}

function parcourirEnfants(p: Parcours, n: Noeud, ctx: Contexte): void {
  p.actifs.add(n);
  for (const e of n.enfants) visiter(p, e, ctx);
  p.actifs.delete(n);
}

/** Compte un clone (un <use> deplie, ou une forme qu'il produit) ; au-dela de la borne, arrete la marche et refuse le SVG. */
function depasseBorne(p: Parcours): boolean {
  if (++p.clones <= CLONES_MAX) return false;
  p.refus.add('des clones <use> trop nombreux (plus de ' + CLONES_MAX + ' clones et formes de clones)');
  p.trop = true;
  return true;
}

/** Pose la forme d'un element de forme, avec la peinture que ses ancetres lui laissent. */
function poserForme(p: Parcours, n: Noeud, b: Pret): void {
  p.donnees += (n.attributs.d?.length ?? 0) + (n.attributs.points?.length ?? 0);
  if (p.donnees > DONNEES_TRACE_MAX) {
    p.refus.add('trop de données de tracé (plus de ' + (DONNEES_TRACE_MAX / 1e6).toLocaleString('fr-FR') + ' millions de caractères de chemins, clones <use> compris)');
    p.trop = true;
    return;
  }
  const d = cheminDeForme(n);
  if (d === undefined) return;
  const { heritees, m } = b;
  if ((heritees.visibility ?? '').trim() === 'hidden') return;
  // Une ligne n'a pas d'aire : seul son contour se voit.
  // `currentColor` est la couleur courante de CETTE forme (ses ancetres et elle), noire faute de `color`.
  const courante = heritees.color === undefined ? COULEUR_COURANTE : lirePeintureAlpha(heritees.color);
  const fond = n.nom === 'line' ? { couleur: null, alpha: 1 } : peinture(heritees.fill, '#000000', courante);
  const trait = peinture(heritees.stroke, null, courante);
  const { couleur: remplissage } = fond, { couleur: contour } = trait;
  if ((remplissage && remplissage.startsWith('url(')) || (contour && contour.startsWith('url('))) { p.refus.add('un dégradé ou un motif'); return; }
  if ((remplissage && !peintureSure(remplissage)) || (contour && !peintureSure(contour))) { p.refus.add('une peinture qui n’est pas une couleur lisible'); return; }
  if (b.profondeur > 0 && depasseBorne(p)) return;
  const chemin = transformerChemin(d, m);
  // NaN n'est pas dans l'intervalle : un exposant demesure (1e308) qui deborde est refuse comme une coordonnee hors bornes.
  if (!chemin.every(c => c.p.every(coordonneeSaine)) || !Number.isFinite(facteur(m))) {
    p.refus.add('des coordonnées démesurées (au-delà de ± ' + COORDONNEE_MAX.toLocaleString('fr-FR') + ')');
    return;
  }
  const epaisseur = contour ? lireEpaisseur(heritees['stroke-width']) * facteur(m) : 0;
  const { champs: styleTrait, ignores: pertesTrait } = contour ? lireTrait(heritees, facteur(m)) : { champs: {}, ignores: [] };
  // Un trait invisible (epaisseur nulle) ne perd rien de ce qu'on ne porte pas.
  for (const msg of [...(epaisseur > 0 ? pertesTrait : []), ...ignoresDeMarqueurs(heritees)]) p.analyse.ignores.add(msg);
  if (n.enfants.some(e => ANIMATIONS.has(e.nom))) p.analyse.ignores.add(MSG_ANIMATIONS);
  // La provenance qu'un SVG ecrit ici porte sur son <path> : on la reprend (rien si absente ou inconnue).
  const origine = lireOrigines(n.attributs[ATTRIBUT_ORIGINE]);
  p.formes.push({
    id: 'f' + (p.formes.length + 1),
    d: chemin,
    remplissage,
    contour,
    epaisseur,
    ...styleTrait,
    ...lireOpacites(b.opacite, heritees, fond, trait),
    ...(origine ? { origine } : {}),
    regle: (heritees['fill-rule'] ?? '').trim() === 'evenodd' ? 'evenodd' : 'nonzero',
    visible: true,
    verrouille: false
  });
}

/** Le <symbol> d'un <use> : un cadre (x, y, largeur, hauteur) dans lequel son viewBox se place, puis ses enfants comme ceux d'un groupe. */
function visiterSymbole(p: Parcours, s: Noeud, b: Pret, cadre: Cadre): void {
  const pr = proprietesDe(p.analyse, s);
  const refusS = refusDe(pr);
  if (refusS) { p.refus.add(refusS); return; }
  // Un cadre nul ou un viewBox vide desactive le rendu, comme dans un navigateur.
  const vue = lireVue(s.attributs.viewBox);
  if (!(cadre.l > 0 && cadre.h > 0) || vue === 'vide') return;
  const ctx: Contexte = {
    m: multiplier(b.m, matriceCadre(vue, cadre, lireAspect(s.attributs.preserveAspectRatio))),
    heritees: heriter(b.heritees, pr),
    opacite: b.opacite * (pr.opacity !== undefined ? lireOpacite(pr.opacity) : 1),
    profondeur: b.profondeur
  };
  const avant = p.formes.length;
  parcourirEnfants(p, s, ctx);
  // Un <symbol> rogne son contenu au cadre (overflow: hidden) ; on ne rogne pas, alors on le dit s'il y a quelque chose a rogner.
  const debord = (pr.overflow ?? '').trim().toLowerCase();
  const versCadre = inverse(b.m);
  const visibles = p.formes.slice(avant).filter(f => f.remplissage !== null || f.contour !== null);
  if (debord !== 'visible' && debord !== 'auto' && versCadre && depasseDuCadre(visibles, versCadre, cadre)) p.analyse.ignores.add(MSG_SYMBOLE_ROGNE);
}

/** Les quatre longueurs d'un <use> (x, y, largeur, hauteur) ; null si l'une est dans une unite qu'on ne calcule pas. */
function cadreDeUse(u: Noeud, plan: readonly [number, number, number, number]): Cadre | null {
  const x = longueurUse(u.attributs.x, plan[2], 0), y = longueurUse(u.attributs.y, plan[3], 0);
  const l = longueurUse(u.attributs.width, plan[2], plan[2]), h = longueurUse(u.attributs.height, plan[3], plan[3]);
  if (x === 'unite' || y === 'unite' || l === 'unite' || h === 'unite') return null;
  return { x: x.v, y: y.v, l: l.v, h: h.v };
}

/** Deplie un <use> : la cible, vue comme un groupe translate de (x, y) puis transforme par le <use>, avec l'heritage du <use>. */
function visiterUse(p: Parcours, u: Noeud, b: Pret): void {
  if (u.enfants.some(e => ANIMATIONS.has(e.nom))) p.analyse.ignores.add(MSG_ANIMATIONS);
  const cible = cibleDe(u, p.analyse.ids);
  if ('externe' in cible) { p.refus.add('un clone <use> vers un fichier ou une adresse extérieurs (« ' + cible.externe + ' »)'); return; }
  if ('absente' in cible) { p.analyse.ignores.add(MSG_USE_ABSENT); return; }
  const c = cible.noeud;
  if (c === u || p.actifs.has(c)) { p.refus.add('un cycle de clones <use> (« #' + (c.attributs.id ?? '') + ' » se contient lui-même)'); return; }
  if (b.profondeur >= PROFONDEUR_USE_MAX) { p.refus.add('des clones <use> emboîtés sur plus de ' + PROFONDEUR_USE_MAX + ' niveaux'); return; }
  const cadre = cadreDeUse(u, p.plan);
  if (!cadre) { p.refus.add('un clone <use> dont une longueur (x, y, width, height) n’est ni un nombre, ni des pixels, ni un pourcentage'); return; }
  if (depasseBorne(p)) return;
  p.actifs.add(u);
  const interne: Pret = { ...b, profondeur: b.profondeur + 1 };
  if (c.nom === 'symbol') visiterSymbole(p, c, interne, cadre);
  else visiter(p, c, { ...interne, m: cadre.x === 0 && cadre.y === 0 ? b.m : multiplier(b.m, translation(cadre.x, cadre.y)) });
  p.actifs.delete(u);
}

/** Lit un element et, pour un groupe ou un clone, tout ce qu'il porte. */
export function visiter(p: Parcours, n: Noeud, ctx: Contexte): void {
  if (p.trop || IGNORES.has(n.nom)) return;
  if (p.actifs.size > PROFONDEUR_MARCHE_MAX) {
    p.refus.add('des éléments imbriqués sur plus de ' + PROFONDEUR_MARCHE_MAX + ' niveaux (clones <use> compris)');
    p.trop = true;
    return;
  }
  if (ANIMATIONS.has(n.nom)) { p.analyse.ignores.add(MSG_ANIMATIONS); return; }
  const b = preparer(p, n, ctx);
  if (!b) return;
  if (n.nom === 'g' || n.nom === 'a') parcourirEnfants(p, n, b);
  else if (n.nom === 'use') visiterUse(p, n, b);
  else poserForme(p, n, b);
}

// La marche d'un SVG vers des formes a plat : on descend l'arbre en portant la matrice, l'heritage et l'opacite
// des ancetres, chaque forme lue devient une forme du dessin. Les groupes se fondent dans leurs enfants ; un
// <use> se deplie en autant de formes independantes (ids neufs) que sa cible en porte, avec l'heritage DU <use>
// (un clone voit les valeurs heritees du <use>, pas celles du parent d'origine de sa cible, comme en CSS).
// Ce qui ne se ramene pas a des chemins pleins est refuse en le nommant. Pur.
//
// En mode riche (ADR-0012, etape 1), le lecteur des groupes (fonctions/groupes.ts) garde chaque <g> comme un groupe : il le range
// dans `Parcours.groupes` et lit ses enfants avec `Contexte.parent`, que chaque feuille posee recopie. La matrice et l'heritage se
// resolvent toujours sur les feuilles ; seule l'opacite du groupe reste au groupe.

import type { Noeud } from '../../util/xml.js';
import type { Forme, Groupe, Matrice } from './types.js';
import { IDENTITE } from './types.js';
import { boiteChemin, facteur, lireTransformation, multiplier, transformerChemin, translation } from './geometrie.js';
import { COULEUR_COURANTE, lirePeintureAlpha } from './peinture.js';
import { lireTrait } from './trait.js';
import { lireOpacite } from './opacites.js';
import { ATTRIBUT_ORIGINE, lireOrigines } from './provenance.js';
import { cheminDeForme } from './elements.js';
import { heriter, lireEpaisseur, lireOpacites, peinture, refusDe, refusHorsFeuille } from './heritage.js';
import { proprietesDe, type Analyse } from './cascade.js';
import { lireTexte, type ContexteTexte } from './texteSvg.js';
import { lireTexteVivant, MSG_TEXTE_ILLISIBLE, type LienLu } from './texteVivant.js';
import { ATTRIBUT_OPERATION, lireOperation } from './operation.js';
import { ANIMATIONS, MSG_ANIMATIONS, MSG_SYMBOLE_ROGNE, MSG_USE_ABSENT, ignoresDeMarqueurs, type Proprietes } from './ignores.js';
import { peintureSure } from './peinture.js';
import { COORDONNEE_MAX, coordonneeSaine, DONNEES_TRACE_MAX, PROFONDEUR_MARCHE_MAX } from './limites.js';
import {
  cibleDe, depasseDuCadre, CLONES_MAX, inverse, lireAspect, lireVue, longueurUse, matriceCadre, PROFONDEUR_USE_MAX, type Cadre
} from './clones.js';
import { completerFeuille, lecteurDe, prisesDe, resoudrePeinture, type Fonctionnalite, type Marche, type PeintureResolue } from './fonctionnalites.js';
import { ignoresDeFusion } from './fusion.js';
import { nombre, t } from '../../util/i18n.js';

const IGNORES = new Set(['defs', 'title', 'desc', 'metadata', 'style', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'pattern', 'symbol', 'marker', 'filter']);
/** Les balises que la lecture plate refuse en les nommant ; la phrase se fait au moment du refus, dans la langue de l'interface. */
const NON_PRIS: ReadonlyMap<string, () => string> = new Map([
  ['text', () => t('du texte (vectorisez-le dans votre logiciel)')], ['image', () => t('une image')], ['foreignObject', () => t('un objet étranger')],
  ['svg', () => t('un SVG imbriqué')], ['switch', () => t('un aiguillage <switch>')]
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
  /** De quoi lire le texte en lettres ; absent (null), un <text> est refuse en le nommant, comme avant. */
  readonly texte?: ContexteTexte | null;
  /** Les liens des textes poses vers leur forme (ADR-0031), resolus quand toutes les formes sont lues. */
  readonly liens?: Array<{ readonly id: string; readonly lien: LienLu }>;
  /**
   * Les fonctionnalites du modele v2 que la lecture consulte (fonctionnalites.ts) : le catalogue en mode riche, aucune (absente ou
   * vide) en mode plat, qui lit alors exactement comme avant (ADR-0012, annexe 2 §1).
   */
  readonly fonctions?: readonly Fonctionnalite[];
  /**
   * Les groupes lus en mode riche, par identifiant, dans l'ordre de lecture (le lecteur des groupes les y range) ; absente en mode
   * plat, ou les groupes se fondent dans leurs feuilles.
   */
  readonly groupes?: Map<string, Groupe>;
}

const AUCUNE: readonly Fonctionnalite[] = [];
const fonctionsDe = (p: Parcours): readonly Fonctionnalite[] => p.fonctions ?? AUCUNE;

/**
 * Ce que les enfants d'un element recoivent. `profondeur` compte les <use> emboites. `parent` : le groupe que lit le mode riche
 * (absent a la racine, et toujours en mode plat).
 */
export interface Contexte { readonly m: Matrice; readonly heritees: Proprietes; readonly opacite: number; readonly profondeur: number; readonly parent?: string }

/**
 * Un element prepare : son contexte (matrice et opacite avec les siennes) et ses proprietes propres. `opaciteDuParent` est l'opacite
 * recue, avant la sienne : un groupe du mode riche garde la sienne pour lui et ne la transmet pas a ses feuilles.
 */
export interface Pret extends Contexte { readonly pr: Proprietes; readonly opaciteDuParent: number }

/** Le groupe du contexte, a etaler dans un contexte ou une forme : rien hors d'un groupe. */
const parentDe = (ctx: Contexte): { parent?: string } => (ctx.parent !== undefined ? { parent: ctx.parent } : {});

/** Le contexte d'un element, ou null s'il ne se dessine pas (cache) ou se refuse (nomme dans `refus`). */
function preparer(p: Parcours, n: Noeud, ctx: Contexte): Pret | null {
  const pr = proprietesDe(p.analyse, n);
  if ((pr.display ?? '').trim() === 'none') return null;
  // Une balise qu'une fonctionnalite sait lire (mode riche) n'est plus refusee ici : son lecteur en decide.
  const nonPris = NON_PRIS.get(n.nom);
  if (nonPris && !(n.nom === 'text' && p.texte) && !lecteurDe(fonctionsDe(p), n.nom)) { p.refus.add(nonPris()); return null; }
  const refusNoeud = refusDe(pr, prisesDe(fonctionsDe(p)));
  if (refusNoeud) { p.refus.add(refusNoeud); return null; }
  const m = n.attributs.transform ? lireTransformation(n.attributs.transform) : IDENTITE;
  if (!m) { p.refus.add(t('une transformation illisible')); return null; }
  // Ce qui se perdait sans etre dit (fusion, ordre de peinture, vector-effect) : dit, dans les deux modes (fusion.ts).
  for (const msg of ignoresDeFusion(pr, n)) p.analyse.ignores.add(msg);
  return {
    pr,
    heritees: heriter(ctx.heritees, pr),
    opacite: ctx.opacite * (pr.opacity !== undefined ? lireOpacite(pr.opacity) : 1),
    opaciteDuParent: ctx.opacite,
    m: multiplier(ctx.m, m),
    profondeur: ctx.profondeur,
    ...parentDe(ctx)
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
  p.refus.add(t('des clones <use> trop nombreux (plus de {n} clones et formes de clones)', { n: CLONES_MAX }));
  p.trop = true;
  return true;
}

/** Pose la forme d'un element de forme, avec la peinture que ses ancetres lui laissent. */
function poserForme(p: Parcours, n: Noeud, b: Pret): void {
  p.donnees += (n.attributs.d?.length ?? 0) + (n.attributs.points?.length ?? 0);
  if (p.donnees > DONNEES_TRACE_MAX) {
    p.refus.add(t('trop de données de tracé (plus de {n} millions de caractères de chemins, clones <use> compris)', { n: nombre(DONNEES_TRACE_MAX / 1e6) }));
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
  let { couleur: remplissage } = fond, { couleur: contour } = trait;
  // Une peinture url(#…) : refusee comme avant, sauf si une fonctionnalite du mode riche la resout (sa couleur de repli prend la place).
  let peintureR: PeintureResolue | null = null, peintureC: PeintureResolue | null = null;
  if ((remplissage && remplissage.startsWith('url(')) || (contour && contour.startsWith('url('))) {
    const fonctions = fonctionsDe(p);
    if (remplissage && remplissage.startsWith('url(')) peintureR = fonctions.length ? resoudrePeinture(fonctions, remplissage, 'remplissage', n, b, marche(p)) : null;
    if (contour && contour.startsWith('url(')) peintureC = fonctions.length ? resoudrePeinture(fonctions, contour, 'contour', n, b, marche(p)) : null;
    if ((remplissage && remplissage.startsWith('url(') && !peintureR) || (contour && contour.startsWith('url(') && !peintureC)) { p.refus.add(t('un dégradé ou un motif')); return; }
    if (peintureR) remplissage = peintureR.repli;
    if (peintureC) contour = peintureC.repli;
  }
  if ((remplissage && !peintureSure(remplissage)) || (contour && !peintureSure(contour))) { p.refus.add(t('une peinture qui n’est pas une couleur lisible')); return; }
  if (b.profondeur > 0 && depasseBorne(p)) return;
  const chemin = transformerChemin(d, m);
  // NaN n'est pas dans l'intervalle : un exposant demesure (1e308) qui deborde est refuse comme une coordonnee hors bornes.
  if (!chemin.every(c => c.p.every(coordonneeSaine)) || !Number.isFinite(facteur(m))) {
    p.refus.add(t('des coordonnées démesurées (au-delà de ± {max})', { max: nombre(COORDONNEE_MAX) }));
    return;
  }
  const epaisseur = contour ? lireEpaisseur(heritees['stroke-width']) * facteur(m) : 0;
  const { champs: styleTrait, ignores: pertesTrait } = contour ? lireTrait(heritees, facteur(m)) : { champs: {}, ignores: [] };
  // Un trait invisible (epaisseur nulle) ne perd rien de ce qu'on ne porte pas.
  // Les pertes du trait sont des cles d'ignores.ts (trait.ts les rend telles quelles) : traduites ici, quand on les dit.
  for (const msg of [...(epaisseur > 0 ? pertesTrait : []), ...ignoresDeMarqueurs(heritees)]) p.analyse.ignores.add(t(msg));
  if (n.enfants.some(e => ANIMATIONS.has(e.nom))) p.analyse.ignores.add(t(MSG_ANIMATIONS));
  // La provenance qu'un SVG ecrit ici porte sur son <path> : on la reprend (rien si absente ou inconnue).
  const origine = lireOrigines(n.attributs[ATTRIBUT_ORIGINE]);
  // Le texte vivant qu'un SVG ecrit ici porte sur son <path> (ADR-0022) : on le reprend, compose avec les groupes autour.
  const lu = n.nom === 'path' ? lireTexteVivant(n.attributs, m) : null;
  if (lu && 'illisible' in lu) p.analyse.ignores.add(t(MSG_TEXTE_ILLISIBLE));
  else if (lu?.remplacement) p.analyse.ignores.add(lu.remplacement);
  const texte = lu && 'texte' in lu ? lu.texte : undefined;
  if (lu && 'texte' in lu && lu.lien) p.liens?.push({ id: 'f' + (p.formes.length + 1), lien: lu.lien });
  // L'operation de production (ADR-0028) qu'un SVG ecrit ici porte sur la forme elle-meme (jamais heritee d'un groupe).
  const operation = lireOperation(n.attributs[ATTRIBUT_OPERATION]);
  const forme: Forme = {
    id: 'f' + (p.formes.length + 1),
    d: chemin,
    remplissage,
    contour,
    epaisseur,
    ...styleTrait,
    ...lireOpacites(b.opacite, heritees, fond, trait),
    ...(origine ? { origine } : {}),
    ...(texte ? { texte } : {}),
    ...(operation ? { operation } : {}),
    regle: (heritees['fill-rule'] ?? '').trim() === 'evenodd' ? 'evenodd' : 'nonzero',
    visible: true,
    verrouille: false,
    ...parentDe(b),
    ...(peintureR ? { peintureRemplissage: peintureR.peinture } : {}),
    ...(peintureC ? { peintureContour: peintureC.peinture } : {})
  };
  // Le mode riche : chaque fonctionnalite complete la feuille (son filtre…) ; en mode plat, il n'y en a aucune.
  p.formes.push(fonctionsDe(p).length ? completerFeuille(fonctionsDe(p), forme, n, b, marche(p)) : forme);
}

/** Le <symbol> d'un <use> : un cadre (x, y, largeur, hauteur) dans lequel son viewBox se place, puis ses enfants comme ceux d'un groupe. */
function visiterSymbole(p: Parcours, s: Noeud, b: Pret, cadre: Cadre): void {
  const pr = proprietesDe(p.analyse, s);
  const refusS = refusDe(pr, prisesDe(fonctionsDe(p))) ?? refusHorsFeuille(pr, t('posé sur un symbole'));
  if (refusS) { p.refus.add(refusS); return; }
  // Un cadre nul ou un viewBox vide desactive le rendu, comme dans un navigateur.
  const vue = lireVue(s.attributs.viewBox);
  if (!(cadre.l > 0 && cadre.h > 0) || vue === 'vide') return;
  const ctx: Contexte = {
    m: multiplier(b.m, matriceCadre(vue, cadre, lireAspect(s.attributs.preserveAspectRatio))),
    heritees: heriter(b.heritees, pr),
    opacite: b.opacite * (pr.opacity !== undefined ? lireOpacite(pr.opacity) : 1),
    profondeur: b.profondeur,
    ...parentDe(b)
  };
  const avant = p.formes.length;
  parcourirEnfants(p, s, ctx);
  // Un <symbol> rogne son contenu au cadre (overflow: hidden) ; on ne rogne pas, alors on le dit s'il y a quelque chose a rogner.
  const debord = (pr.overflow ?? '').trim().toLowerCase();
  const versCadre = inverse(b.m);
  const visibles = p.formes.slice(avant).filter(f => f.remplissage !== null || f.contour !== null);
  if (debord !== 'visible' && debord !== 'auto' && versCadre && depasseDuCadre(visibles, versCadre, cadre)) p.analyse.ignores.add(t(MSG_SYMBOLE_ROGNE));
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
  if (u.enfants.some(e => ANIMATIONS.has(e.nom))) p.analyse.ignores.add(t(MSG_ANIMATIONS));
  const cible = cibleDe(u, p.analyse.ids);
  if ('externe' in cible) { p.refus.add(t('un clone <use> vers un fichier ou une adresse extérieurs (« {adresse} »)', { adresse: cible.externe })); return; }
  if ('absente' in cible) { p.analyse.ignores.add(t(MSG_USE_ABSENT)); return; }
  const c = cible.noeud;
  if (c === u || p.actifs.has(c)) { p.refus.add(t('un cycle de clones <use> (« #{id} » se contient lui-même)', { id: c.attributs.id ?? '' })); return; }
  if (b.profondeur >= PROFONDEUR_USE_MAX) { p.refus.add(t('des clones <use> emboîtés sur plus de {n} niveaux', { n: PROFONDEUR_USE_MAX })); return; }
  const cadre = cadreDeUse(u, p.plan);
  if (!cadre) { p.refus.add(t('un clone <use> dont une longueur (x, y, width, height) n’est ni un nombre, ni des pixels, ni un pourcentage')); return; }
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
    p.refus.add(t('des éléments imbriqués sur plus de {n} niveaux (clones <use> compris)', { n: PROFONDEUR_MARCHE_MAX }));
    p.trop = true;
    return;
  }
  if (ANIMATIONS.has(n.nom)) { p.analyse.ignores.add(t(MSG_ANIMATIONS)); return; }
  const b = preparer(p, n, ctx);
  if (!b) return;
  // Le mode riche : une fonctionnalite qui sait lire cette balise la lit (fonctionnalites.ts) ; en mode plat, aucune.
  const lecteur = fonctionsDe(p).length ? lecteurDe(fonctionsDe(p), n.nom) : undefined;
  if (lecteur) { lecteur(n, b, marche(p)); return; }
  // Une prise du mode riche (un filtre) n'est lue que sur une feuille ou un groupe : ailleurs, aucune fonctionnalite ne la porterait,
  // elle reste refusee (en mode plat, `preparer` l'a deja refusee).
  const ou = n.nom === 'use' ? t('posé sur un clone <use>') : n.nom === 'text' && p.texte ? t('posé sur un texte') : n.nom === 'g' || n.nom === 'a' ? t('posé sur un groupe') : null;
  const refusPrise = ou ? refusHorsFeuille(b.pr, ou) : null;
  if (refusPrise) { p.refus.add(refusPrise); return; }
  if (n.nom === 'g' || n.nom === 'a') parcourirEnfants(p, n, b);
  else if (n.nom === 'use') visiterUse(p, n, b);
  else if (n.nom === 'text' && p.texte) lireTexteDans(p, p.texte, n, b);
  else poserForme(p, n, b);
}

/** Un <text> lu en lettres ; dans un groupe du mode riche, ses lettres en sont des feuilles. */
function lireTexteDans(p: Parcours, texte: ContexteTexte, n: Noeud, b: Pret): void {
  const avant = p.formes.length;
  lireTexte(texte, n, b.heritees, b.m, b.opacite);
  if (b.parent === undefined) return;
  for (let i = avant; i < p.formes.length; i++) { const f = p.formes[i]; if (f) p.formes[i] = { ...f, parent: b.parent }; }
}

const marches = new WeakMap<Parcours, Marche>();

/** Ce que la marche offre aux lecteurs des fonctionnalites (fonctionnalites.ts), une fois par lecture. */
function marche(p: Parcours): Marche {
  let m = marches.get(p);
  if (!m) {
    m = {
      parcours: p,
      enfants: (n, ctx) => parcourirEnfants(p, n, ctx),
      visiter: (n, ctx) => visiter(p, n, ctx),
      poserForme: (n, pret) => poserForme(p, n, pret),
      boiteForme: (n, pret) => { const d = cheminDeForme(n); return d ? boiteChemin(transformerChemin(d, pret.m)) : null; },
      refuser: phrase => { p.refus.add(phrase); },
      ignorer: phrase => { p.analyse.ignores.add(phrase); }
    };
    marches.set(p, m);
  }
  return m;
}

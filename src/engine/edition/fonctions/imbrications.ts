// Les imbrications du modele v2 (ADR-0012, etape 13c ; annexe 2 §2) : deux elements qui, en mode riche, deviennent des groupes au lieu
// de se refuser ou de se fondre dans leurs feuilles.
//
// Un <svg> imbrique est un groupe : son cadre (x, y, width, height, en nombres, pixels ou pourcentages de la fenetre qui l'entoure), son
// viewBox et son preserveAspectRatio composent une matrice cuite dans ses feuilles, comme celle d'un <symbol> (`matriceCadre`) ; sa
// fenetre le rogne (`overflow: hidden`, la feuille de style de tout navigateur pour un <svg> qui n'est pas la racine) : une decoupe
// rectangulaire, celle de la fonctionnalite des decoupes, sauf `overflow` visible ou auto. Une decoupe, un masque ou un filtre poses sur
// le <svg> lui-meme s'appliquent a ce qu'il dessine deja rogne : ils restent au groupe du <svg>, la fenetre passe a un groupe interieur.
// Un <use> qui vise un <svg> lui donne sa largeur et sa hauteur (SVG 1.1, 5.6). Un cadre nul ou un viewBox vide ne dessinent rien.
//
// Un <text> lu en lettres (ADR-0020 : seulement quand la lecture a des polices) est un groupe de ses lettres, nomme « Texte « … » » comme
// la vectorisation en lettres separees (annexe 4 A §2) : sa decoupe, son masque, son filtre se posent sur ce groupe par leurs propres
// fonctionnalites (le mode riche les refusait, « posé sur un texte »), son opacite y compose. Un texte d'une seule lettre, sans rien de
// tout cela, reste une feuille. Dans un <clipPath> (qui n'admet pas de <g>), un texte sans prise se lit en lettres comme avant.
//
// Rien ne s'ecrit par ici : un groupe s'ecrit par les groupes, une fenetre par les decoupes. Le mode plat ne consulte aucune
// fonctionnalite : un <svg> imbrique y reste refuse (« un SVG imbriqué »), un <text> s'y lit a plat, comme avant.

import type { Fonctionnalite, Marche } from '../fonctionnalites.js';
import { completerGroupe } from '../fonctionnalites.js';
import type { Noeud } from '../../../util/xml.js';
import type { Boite, Chemin, Groupe } from '../types.js';
import type { Parcours, Pret } from '../parcours.js';
import type { Proprietes } from '../ignores.js';
import { PROFONDEUR_GROUPES_MAX } from '../arbre.js';
import { arrondirOpacite, lireOpacite } from '../opacites.js';
import { boiteChemin, multiplier, transformerChemin, unir } from '../geometrie.js';
import { cibleDe, inverse, lireAspect, lireVue, longueurUse, matriceCadre, type Cadre } from '../clones.js';
import { refusHorsFeuille } from '../heritage.js';
import { lireTexte, nomGroupeTexte } from '../texteSvg.js';
import { COORDONNEE_MAX, coordonneeSaine } from '../limites.js';
import { lireReference, NOEUDS_DEFS_MAX } from '../resolution.js';
import { boiteDescendants, etatContenus, placeVide, poserBoiteConnue, reserverGroupe } from '../contenus.js';
import { GROUPES_MAX, MSG_GROUPES_NOMBREUX, MSG_GROUPES_PROFONDS, nomDuGroupe, profondeurDans } from './groupes.js';
import { feuilleDeDecoupe, REFUS_DECOUPES } from './decoupes.js';
import { nombre } from '../../../util/i18n.js';

// ---------------------------------------------------------------- phrases

/** Ce que la lecture riche refuse en le nommant (apres « Ce SVG contient … »). */
export const REFUS_IMBRICATIONS = {
  /** Sans polices, un <text> est refuse comme en mode plat (la phrase de `parcours.ts`, a l'identique). */
  texte: 'du texte (vectorisez-le dans votre logiciel)',
  /** Sans table des groupes (une liste de fonctionnalites donnee par un test), un <svg> imbrique reste refuse comme en mode plat. */
  svg: 'un SVG imbriqué',
  longueur: 'un SVG imbriqué dont une longueur (x, y, width, height) n’est ni un nombre, ni des pixels, ni un pourcentage',
  demesure: 'des coordonnées démesurées (au-delà de ± ' + nombre(COORDONNEE_MAX) + ')'
} as const;

/** Ce que la lecture riche dit (`ignores`) : ce que les navigateurs ne rendent pas tous pareil. */
export const MSG_IMBRICATIONS = {
  /**
   * Mesure a la main dans les trois moteurs (26 octobre 2026) : Firefox pose une decoupe dans le repere ou le <svg> imbrique est pose
   * et la fenetre rogne le contenu avant le filtre ; Chromium et WebKit posent la decoupe dans le repere de son viewBox, et Chromium
   * floute le contenu avant de le rogner. La lecture suit Firefox (la lettre de CSS Masking), et le dit.
   */
  prises: 'les découpes, masques et filtres posés sur un SVG imbriqué (les navigateurs ne les placent pas tous pareil : lus dans le repère où il est posé, sur son contenu rogné à sa fenêtre)',
  /**
   * Un navigateur mesure la boite d'un texte sur les cellules de ses glyphes (avance, hauteur de la fonte) ; la lecture n'a que les
   * contours des lettres de la fonte de remplacement : une decoupe ou un contenu de masque en unites de boite s'y place a peu pres.
   */
  boiteTexte: 'les découpes et masques en unités de boîte posés sur un texte (mesurés sur le contour de ses lettres, pas sur les cellules de la fonte)'
} as const;

// ---------------------------------------------------------------- un groupe neuf

/** Vrai si ces proprietes posent une decoupe, un masque ou un filtre. */
function porteUnePrise(pr: Proprietes): boolean {
  for (const k of ['clip-path', 'mask', 'filter']) {
    const v = (pr[k] ?? '').trim().toLowerCase();
    if (v !== '' && v !== 'none') return true;
  }
  return false;
}

/**
 * Un groupe neuf pour l'element `n`, range dans la table de la lecture comme le lecteur des groupes range un <g> : son opacite, son nom,
 * puis ce que les fonctionnalites y lisent (decoupe, masque, filtre poses sur `n`). null si les bornes des groupes le refusent.
 */
function ouvrirGroupe(table: Map<string, Groupe>, n: Noeud, pret: Pret, marche: Marche, nom: string | undefined): Groupe | null {
  if (table.size >= GROUPES_MAX) { marche.refuser(MSG_GROUPES_NOMBREUX); return null; }
  if (profondeurDans(table, pret.parent) >= PROFONDEUR_GROUPES_MAX) { marche.refuser(MSG_GROUPES_PROFONDS); return null; }
  const id = 'g' + (table.size + 1);
  const opacite = arrondirOpacite(pret.pr.opacity !== undefined ? lireOpacite(pret.pr.opacity) : 1);
  const lu: Groupe = {
    id,
    ...(pret.parent !== undefined ? { parent: pret.parent } : {}),
    ...(nom !== undefined ? { nom } : {}),
    visible: true,
    verrouille: false,
    ...(opacite < 1 ? { opacite } : {})
  };
  const g = completerGroupe(marche.parcours.fonctions ?? [], lu, n, pret, marche);
  table.set(id, g);
  return g;
}

// ---------------------------------------------------------------- <text>

/** Le texte d'un <text> tel qu'un nom le montre : ses morceaux et ceux de ses <tspan> et <a>, blancs ramenes (borne). */
function contenuDe(n: Noeud): string {
  let out = '';
  const marcher = (e: Noeud): void => {
    for (const m of e.suite ?? []) {
      if (out.length > 200) return;
      if (typeof m === 'string') out += m;
      else if (m.nom === 'tspan' || m.nom === 'a') marcher(m);
    }
  };
  marcher(n);
  return out.replace(/\s+/g, ' ').trim();
}

/** Le nom d'un texte lu : le calque d'Inkscape ou le nom d'un logiciel s'il y en a un, sinon « Texte « … » ». */
function nomDuTexte(n: Noeud): string {
  for (const v of [n.attributs['inkscape:label'], n.attributs['data-name']]) {
    const t = (v ?? '').trim();
    if (t) return nomDuGroupe({ 'data-name': t }) ?? t;
  }
  return nomGroupeTexte(contenuDe(n));
}

/** Vrai si la decoupe ou le contenu du masque que posent ces proprietes se mesurent en unites de boite (la boite du texte). */
function enUnitesDeBoite(pr: Proprietes, ids: ReadonlyMap<string, Noeud>): boolean {
  const cible = (v: string | undefined): Noeud | undefined => { const r = lireReference(v ?? ''); return r && r.genre === 'locale' ? ids.get(r.id) : undefined; };
  const c = cible(pr['clip-path']), m = cible(pr.mask);
  return (c?.nom === 'clipPath' && (c.attributs.clipPathUnits ?? '').trim() === 'objectBoundingBox')
    || (m?.nom === 'mask' && (m.attributs.maskContentUnits ?? '').trim() === 'objectBoundingBox');
}

/** La boite des lettres posees de `debut` a `fin`, ramenee dans le repere du texte (de quoi resoudre `objectBoundingBox`). */
function boiteDesLettres(p: Parcours, debut: number, fin: number, pret: Pret): Boite | null {
  const inv = inverse(pret.m);
  if (!inv) return null;
  const boites: Array<Boite | null> = [];
  for (let i = debut; i < fin; i++) { const f = p.formes[i]; if (f) boites.push(boiteChemin(transformerChemin(f.d, inv))); }
  return unir(boites);
}

/** Lit un <text> en lettres ; en mode riche, ses lettres deviennent un groupe (voir l'en-tete). */
function lireTexteEnGroupe(n: Noeud, pret: Pret, marche: Marche): void {
  const p = marche.parcours, texte = p.texte;
  if (!texte) { marche.refuser(REFUS_IMBRICATIONS.texte); return; }
  const prise = porteUnePrise(pret.pr), table = p.groupes;
  const actives = etatContenus(marche).actives;
  const dansDecoupe = actives[actives.length - 1]?.nom === 'clipPath';
  const avant = p.formes.length;
  if (!table || (dansDecoupe && !prise)) {
    // Sans table, aucune fonctionnalite ne porterait la prise : refusee en disant ou elle est posee, comme avant l'etape 13c.
    const refus = prise ? refusHorsFeuille(pret.pr, 'posé sur un texte') : null;
    if (refus) { marche.refuser(refus); return; }
    lireTexte(texte, n, pret.heritees, pret.m, pret.opacite);
    if (pret.parent !== undefined) for (let i = avant; i < p.formes.length; i++) { const f = p.formes[i]; if (f) p.formes[i] = { ...f, parent: pret.parent }; }
    return;
  }
  // Les lettres d'abord, sans l'opacite du texte (elle compose au groupe) : leur boite sert aux unites de boite de la prise.
  lireTexte(texte, n, pret.heritees, pret.m, pret.opaciteDuParent);
  const fin = p.formes.length;
  if (fin === avant) return;
  const opaque = pret.pr.opacity === undefined || lireOpacite(pret.pr.opacity) === 1;
  if (fin - avant === 1 && !prise && opaque) {
    const f = p.formes[avant];
    if (f && pret.parent !== undefined) p.formes[avant] = { ...f, parent: pret.parent };
    return;
  }
  if (prise) {
    if (enUnitesDeBoite(pret.pr, p.analyse.ids)) marche.ignorer(MSG_IMBRICATIONS.boiteTexte);
    poserBoiteConnue(p.analyse, n, boiteDesLettres(p, avant, fin, pret));
  }
  const g = ouvrirGroupe(table, n, pret, marche, nomDuTexte(n));
  if (!g) return;
  for (let i = avant; i < fin; i++) { const f = p.formes[i]; if (f) p.formes[i] = { ...f, parent: g.id }; }
}

// ---------------------------------------------------------------- <svg> imbrique

/** Les fenetres des <svg> imbriques en cours de lecture (largeur, hauteur : ce que vaut un pourcentage dedans), par lecture. */
const fenetres = new WeakMap<Parcours, Array<readonly [number, number]>>();
function pileDe(p: Parcours): Array<readonly [number, number]> {
  let t = fenetres.get(p);
  if (!t) { t = []; fenetres.set(p, t); }
  return t;
}

/** L'element en cours de lecture le plus recent (celui qui visite `n` : son parent, ou le <use> qui le clone). */
function dernierActif(p: Parcours): Noeud | undefined {
  let d: Noeud | undefined;
  for (const x of p.actifs) d = x;
  return d;
}

/** Une longueur d'un <svg> imbrique ; `auto` (SVG 2) vaut l'absence, donc 100 % pour une largeur ou une hauteur. */
const longueur = (v: string | undefined, reference: number, defaut: number) => longueurUse(v?.trim().toLowerCase() === 'auto' ? undefined : v, reference, defaut);
const donnee = (v: string | undefined): boolean => v !== undefined && v.trim() !== '';

/** Le rectangle d'un cadre, en trace ferme. */
const rectangle = (c: Cadre): Chemin => [
  { c: 'M', p: [c.x, c.y] }, { c: 'L', p: [c.x + c.l, c.y] }, { c: 'L', p: [c.x + c.l, c.y + c.h] }, { c: 'L', p: [c.x, c.y + c.h] }, { c: 'Z', p: [] }
];

/** Lit un <svg> imbrique en groupe (voir l'en-tete). */
function lireSvgImbrique(n: Noeud, pret: Pret, marche: Marche): void {
  const p = marche.parcours, table = p.groupes, a = n.attributs;
  if (!table) { marche.refuser(REFUS_IMBRICATIONS.svg); return; }
  const pile = pileDe(p);
  const [rl, rh] = pile[pile.length - 1] ?? [p.plan[2], p.plan[3]];
  // Un <use> qui vise ce <svg> remplace sa largeur et sa hauteur par les siennes, quand il en donne.
  const u = dernierActif(p);
  const porteur = u && u !== n && u.nom === 'use' && (() => { const c = cibleDe(u, p.analyse.ids); return 'noeud' in c && c.noeud === n; })() ? u : null;
  const x = longueur(a.x, rl, 0), y = longueur(a.y, rh, 0);
  const l = longueur(porteur && donnee(porteur.attributs.width) ? porteur.attributs.width : a.width, rl, rl);
  const h = longueur(porteur && donnee(porteur.attributs.height) ? porteur.attributs.height : a.height, rh, rh);
  if (x === 'unite' || y === 'unite' || l === 'unite' || h === 'unite') { marche.refuser(REFUS_IMBRICATIONS.longueur); return; }
  // Un cadre nul (ou negatif, une erreur) et un viewBox vide desactivent le rendu, comme dans un navigateur : rien n'est perdu.
  const vue = lireVue(a.viewBox);
  if (!(l.v > 0 && h.v > 0) || vue === 'vide') return;
  const cadre: Cadre = { x: x.v, y: y.v, l: l.v, h: h.v };
  const repere = matriceCadre(vue, cadre, lireAspect(a.preserveAspectRatio));
  const interieur = multiplier(pret.m, repere);
  if (![cadre.x, cadre.y, cadre.l, cadre.h, ...interieur].every(Number.isFinite)) { marche.refuser(REFUS_IMBRICATIONS.demesure); return; }
  // La fenetre, dans le repere du plan : ce qu'elle rogne (sauf overflow visible ou auto).
  const debord = (pret.pr.overflow ?? '').trim().toLowerCase();
  const fenetre = debord === 'visible' || debord === 'auto' ? null : transformerChemin(rectangle(cadre), pret.m);
  if (fenetre && !fenetre.every(c => c.p.every(coordonneeSaine))) { marche.refuser(REFUS_IMBRICATIONS.demesure); return; }
  // La boite d'un <svg> en unites de boite (sa propre decoupe, son masque) : celle de son contenu, place dans son cadre.
  if (porteUnePrise(pret.pr)) {
    marche.ignorer(MSG_IMBRICATIONS.prises);
    poserBoiteConnue(p.analyse, n, boiteDescendants(p.analyse, n, repere));
  }
  const g = ouvrirGroupe(table, n, pret, marche, nomDuGroupe(a));
  if (!g) return;
  let parent = g.id;
  if (fenetre) {
    const etat = etatContenus(marche);
    if (++etat.noeuds > NOEUDS_DEFS_MAX) {
      if (!etat.trop) marche.refuser(REFUS_DECOUPES.trop);
      etat.trop = true;
      return;
    }
    // La feuille de la fenetre prend son numero dans l'espace commun (I1) et laisse sa place vide dans les formes, comme une decoupe lue.
    const idFeuille = 'f' + (p.formes.length + 1);
    p.formes.push(placeVide(idFeuille));
    const decoupe = { contenu: { formes: [feuilleDeDecoupe(idFeuille, fenetre, 'nonzero')] } };
    if (g.decoupe || g.masque || g.effets) {
      // Ce que porte le <svg> s'applique a son contenu deja rogne par la fenetre : la fenetre passe a un groupe interieur.
      if (table.size >= GROUPES_MAX) { marche.refuser(MSG_GROUPES_NOMBREUX); return; }
      if (profondeurDans(table, g.id) >= PROFONDEUR_GROUPES_MAX) { marche.refuser(MSG_GROUPES_PROFONDS); return; }
      const id = reserverGroupe(table, etat);
      table.set(id, { id, parent: g.id, visible: true, verrouille: false, decoupe });
      etat.places.delete(id);
      parent = id;
    } else table.set(g.id, { ...g, decoupe });
  }
  // Un pourcentage, dedans, se mesure sur le viewBox (ou, sans lui, sur le cadre).
  pile.push(vue ? [vue[2], vue[3]] : [cadre.l, cadre.h]);
  try {
    marche.enfants(n, { m: interieur, heritees: pret.heritees, opacite: pret.opaciteDuParent, profondeur: pret.profondeur, parent });
  } finally {
    pile.pop();
  }
}

export const imbrications: Fonctionnalite = {
  nom: 'imbrications',
  lecture: { elements: { svg: lireSvgImbrique, text: lireTexteEnGroupe } }
};

// La lecture d'un SVG en dessin a plat : peintures, feuille <style>, heritage, transformations des
// groupes, formes de base ramenees a des chemins. Ce qui ne se ramene pas a des chemins pleins est
// refuse avec son nom : on n'edite pas un dessin qu'on ne saurait pas reecrire.

import { lireXml, type Noeud } from '../../util/xml.js';
import type { Commande, DessinSvg, Forme, Matrice } from './types.js';
import { IDENTITE } from './types.js';
import { lireChemin } from './chemins.js';
import { facteur, lireTransformation, multiplier, transformerChemin } from './geometrie.js';
import { COULEUR_COURANTE, lirePeintureAlpha, type PeintureLue } from './peinture.js';
import { lireTrait } from './trait.js';
import { arrondirOpacite, lireOpacite } from './opacites.js';
import {
  ANIMATIONS, MSG_ANIMATIONS, MSG_SELECTEURS, ignoresDeMarqueurs, reglePeint, type Proprietes
} from './ignores.js';

function lireDeclarations(t: string): Proprietes {
  const r: Proprietes = {};
  for (const decl of t.split(';')) {
    const k = decl.indexOf(':');
    if (k > 0) r[decl.slice(0, k).trim().toLowerCase()] = decl.slice(k + 1).replace(/!important/i, '').trim();
  }
  return r;
}

/**
 * Les regles de classe d'une feuille <style> : `.a, .b { fill: … }`. Les autres selecteurs sont
 * ignores, et `autres` dit si l'un d'eux posait une peinture : c'est un rendu qui change, a signaler.
 */
function lireFeuille(t: string): { classes: Map<string, Proprietes>; autres: boolean } {
  const classes = new Map<string, Proprietes>();
  let autres = false;
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t.replace(/\/\*[\s\S]*?\*\//g, '')))) {
    const decl = lireDeclarations(m[2] ?? '');
    for (const sel of (m[1] ?? '').split(',').map(s => s.trim())) {
      const c = /^\.([\w-]+)$/.exec(sel);
      if (c?.[1]) classes.set(c[1], { ...(classes.get(c[1]) ?? {}), ...decl });
      else if (sel && reglePeint(decl)) autres = true;
    }
  }
  return { classes, autres };
}

const PROPRIETES = [
  'fill', 'stroke', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'display', 'visibility', 'clip-path', 'mask', 'filter',
  'color', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'marker-start', 'marker-mid', 'marker-end'
];
// Les proprietes que CSS transmet d'un element a ses enfants (`opacity`, `display`, le masque ne le sont pas).
const HERITEES = [
  'color', 'fill', 'stroke', 'stroke-width', 'fill-rule', 'visibility', 'fill-opacity', 'stroke-opacity',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'marker-start', 'marker-mid', 'marker-end', 'marker'
];
const IGNORES = new Set(['defs', 'title', 'desc', 'metadata', 'style', 'clipPath', 'mask', 'linearGradient', 'radialGradient', 'pattern', 'symbol', 'marker', 'filter']);
const NON_PRIS: Record<string, string> = {
  text: 'du texte (vectorisez-le dans votre logiciel)', image: 'une image', use: 'un clone <use>', foreignObject: 'un objet étranger', svg: 'un SVG imbriqué', switch: 'un aiguillage <switch>'
};

interface Contexte { m: Matrice; heritees: Proprietes; opacite: number }

/** Un dessin lu, avec ce que la lecture a laisse tomber sans refuser (voir `ignores.ts`) : vide quand rien ne s'est perdu. */
export interface DessinLu { dessin: DessinSvg; ignores: readonly string[] }
export type LectureDessin = DessinLu | { erreur: string };

/**
 * Une epaisseur de trait. Zero est une epaisseur (un trait invisible, a garder tel quel), pas une
 * valeur absente ; une valeur absente, illisible ou negative est ignoree par un navigateur : 1.
 */
function lireEpaisseur(v: string | undefined): number {
  const x = Number.parseFloat(v ?? '');
  return Number.isFinite(x) && x >= 0 ? x : 1;
}

const peinture = (p: string | undefined, defaut: string | null, courante: PeintureLue): PeintureLue => (p === undefined ? { couleur: defaut, alpha: 1 } : lirePeintureAlpha(p, courante));

/**
 * Les proprietes que les enfants d'un element recoivent : celles de ses parents, recouvertes par les siennes.
 * `inherit` ne recouvre rien (c'est le parent). `color: currentColor` non plus (la couleur du parent) ;
 * `color: none` n'est pas une couleur, un navigateur l'ecarte.
 */
function heriter(parent: Proprietes, pr: Proprietes): Proprietes {
  const heritees: Proprietes = { ...parent };
  for (const p of HERITEES) {
    const v = pr[p];
    if (v === undefined || v.trim().toLowerCase() === 'inherit') continue;
    if (p === 'color' && ['currentcolor', 'none'].includes(v.trim().toLowerCase())) continue;
    heritees[p] = v;
  }
  return heritees;
}

/** Ce qui change le rendu au point de ne pas s'editer (masque, decoupe, filtre) sur un element, ou null. */
function refusDe(pr: Proprietes): string | null {
  if ((pr['clip-path'] && pr['clip-path'] !== 'none') || (pr.mask && pr.mask !== 'none')) return 'un masque ou une découpe';
  if (pr.filter && pr.filter !== 'none') return 'un filtre';
  return null;
}

/**
 * Les opacites d'une forme. `opacite` est celle des groupes et de la forme (`opacity`) ; l'alpha de la
 * couleur et `fill-opacity` / `stroke-opacity` vont au remplissage et au contour. Sans contour, forme
 * entiere et remplissage ne font qu'un (rien ne se voit a travers un trait absent) : tout se range
 * dans `opacite`, ce qui garde le SVG ecrit d'avant et le rend stable a la relecture. Avec un contour,
 * fond et trait gardent chacun la leur : un fond a demi transparent n'estompe pas son trait.
 */
function lireOpacites(opacite: number, h: Proprietes, fond: PeintureLue, trait: PeintureLue): Pick<Forme, 'opacite' | 'opaciteRemplissage' | 'opaciteContour'> {
  const fo = lireOpacite(h['fill-opacity']);
  if (trait.couleur === null) return { opacite: arrondirOpacite(opacite * fo * fond.alpha) };
  const remplissage = arrondirOpacite(fond.alpha * fo);
  const contour = arrondirOpacite(trait.alpha * lireOpacite(h['stroke-opacity']));
  return {
    opacite: arrondirOpacite(opacite),
    ...(fond.couleur !== null && remplissage < 1 ? { opaciteRemplissage: remplissage } : {}),
    ...(contour < 1 ? { opaciteContour: contour } : {})
  };
}

/** Le dessin d'un SVG et ce qu'il a fallu laisser tomber, ou ce qui empeche de l'editer. */
export function lireDessin(svg: string): LectureDessin {
  const doc = lireXml(svg);
  const racine = doc?.enfants.find(e => e.nom === 'svg');
  if (!racine) return { erreur: 'Ce SVG ne se lit pas.' };
  const vb = (racine.attributs.viewBox ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
  const l = Number.parseFloat(racine.attributs.width ?? ''), h = Number.parseFloat(racine.attributs.height ?? '');
  const plan: [number, number, number, number] | null = vb.length === 4 && vb.every(Number.isFinite) && (vb[2] ?? 0) > 0 && (vb[3] ?? 0) > 0
    ? [vb[0] ?? 0, vb[1] ?? 0, vb[2] ?? 0, vb[3] ?? 0] : l > 0 && h > 0 ? [0, 0, l, h] : null;
  if (!plan) return { erreur: 'Ce SVG n’a ni viewBox ni dimensions.' };
  let feuille = '';
  const ramasser = (n: Noeud) => { if (n.nom === 'style') feuille += n.texte + '\n'; n.enfants.forEach(ramasser); };
  ramasser(racine);
  const { classes, autres } = lireFeuille(feuille);
  const formes: Forme[] = [];
  const refus = new Set<string>();
  const ignores = new Set<string>(autres ? [MSG_SELECTEURS] : []);
  const proprietes = (n: Noeud): Proprietes => {
    const r: Proprietes = {};
    for (const p of PROPRIETES) { const v = n.attributs[p]; if (v !== undefined) r[p] = v; }
    for (const c of (n.attributs.class ?? '').split(/\s+/).filter(Boolean)) Object.assign(r, classes.get(c) ?? {});
    Object.assign(r, lireDeclarations(n.attributs.style ?? ''));
    return r;
  };
  // La balise <svg> est un element comme un groupe : ce qu'elle pose se transmet aux formes. `opacity` s'y
  // applique au dessin entier, donc se multiplie a chaque forme comme celle d'un <g> (le dessin etant a plat,
  // il n'y a pas de groupe a composer : voir lireOpacites). Masque, decoupe et filtre se refusent comme ailleurs.
  const prRacine = proprietes(racine);
  const refusRacine = refusDe(prRacine);
  if (refusRacine) refus.add(refusRacine);
  const visiter = (n: Noeud, ctx: Contexte) => {
    if (IGNORES.has(n.nom)) return;
    if (ANIMATIONS.has(n.nom)) { ignores.add(MSG_ANIMATIONS); return; }
    const pr = proprietes(n);
    if ((pr.display ?? '').trim() === 'none') return;
    const nonPris = NON_PRIS[n.nom];
    if (nonPris) { refus.add(nonPris); return; }
    const refusNoeud = refusDe(pr);
    if (refusNoeud) { refus.add(refusNoeud); return; }
    const t = n.attributs.transform ? lireTransformation(n.attributs.transform) : IDENTITE;
    if (!t) { refus.add('une transformation illisible'); return; }
    const heritees = heriter(ctx.heritees, pr);
    const opacite = ctx.opacite * (pr.opacity !== undefined ? lireOpacite(pr.opacity) : 1);
    const m = multiplier(ctx.m, t);
    if (n.nom === 'g' || n.nom === 'a') { n.enfants.forEach(e => visiter(e, { m, heritees, opacite })); return; }
    const d = cheminDeForme(n);
    if (d === undefined) return;
    if ((heritees.visibility ?? '').trim() === 'hidden') return;
    // Une ligne n'a pas d'aire : seul son contour se voit.
    // `currentColor` est la couleur courante de CETTE forme (ses ancetres et elle), noire faute de `color`.
    const courante = heritees.color === undefined ? COULEUR_COURANTE : lirePeintureAlpha(heritees.color);
    const fond = n.nom === 'line' ? { couleur: null, alpha: 1 } : peinture(heritees.fill, '#000000', courante);
    const trait = peinture(heritees.stroke, null, courante);
    const { couleur: remplissage } = fond, { couleur: contour } = trait;
    if ((remplissage && remplissage.startsWith('url(')) || (contour && contour.startsWith('url('))) { refus.add('un dégradé ou un motif'); return; }
    const epaisseur = contour ? lireEpaisseur(heritees['stroke-width']) * facteur(m) : 0;
    const { champs: styleTrait, ignores: pertesTrait } = contour ? lireTrait(heritees, facteur(m)) : { champs: {}, ignores: [] };
    // Un trait invisible (epaisseur nulle) ne perd rien de ce qu'on ne porte pas.
    for (const msg of [...(epaisseur > 0 ? pertesTrait : []), ...ignoresDeMarqueurs(heritees)]) ignores.add(msg);
    if (n.enfants.some(e => ANIMATIONS.has(e.nom))) ignores.add(MSG_ANIMATIONS);
    formes.push({
      id: 'f' + (formes.length + 1),
      d: transformerChemin(d, m),
      remplissage,
      contour,
      epaisseur,
      ...styleTrait,
      ...lireOpacites(opacite, heritees, fond, trait),
      regle: (heritees['fill-rule'] ?? '').trim() === 'evenodd' ? 'evenodd' : 'nonzero',
      visible: true,
      verrouille: false
    });
  };
  racine.enfants.forEach(e => visiter(e, { m: IDENTITE, heritees: heriter({}, prRacine), opacite: lireOpacite(prRacine.opacity) }));
  if (refus.size) return { erreur: 'Ce SVG contient ' + [...refus].join(', ') + ' : il ne s’édite pas ici. Vectorisez l’image, ou simplifiez-le dans votre logiciel.' };
  if (!formes.length) return { erreur: 'Ce SVG ne contient aucune forme à éditer.' };
  return { dessin: { vb: plan, formes: formes.filter(f => f.d.length > 0) }, ignores: [...ignores] };
}

const nombreAttr = (n: Noeud, a: string, defaut = 0) => { const v = Number.parseFloat(n.attributs[a] ?? ''); return Number.isFinite(v) ? v : defaut; };

/** Le chemin d'un element de forme, ou undefined si ce n'en est pas un. */
function cheminDeForme(n: Noeud): Commande[] | undefined {
  switch (n.nom) {
    case 'path': return lireChemin(n.attributs.d ?? '');
    case 'rect': {
      const x = nombreAttr(n, 'x'), y = nombreAttr(n, 'y'), l = nombreAttr(n, 'width'), h = nombreAttr(n, 'height');
      if (!(l > 0 && h > 0)) return [];
      let rx = nombreAttr(n, 'rx', NaN), ry = nombreAttr(n, 'ry', NaN);
      if (Number.isNaN(rx)) rx = Number.isNaN(ry) ? 0 : ry;
      if (Number.isNaN(ry)) ry = rx;
      rx = Math.min(rx, l / 2); ry = Math.min(ry, h / 2);
      if (!(rx > 0 && ry > 0)) return lireChemin(`M${x} ${y}H${x + l}V${y + h}H${x}Z`);
      return lireChemin(`M${x + rx} ${y}H${x + l - rx}A${rx} ${ry} 0 0 1 ${x + l} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + l - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`);
    }
    case 'circle':
    case 'ellipse': {
      const cx = nombreAttr(n, 'cx'), cy = nombreAttr(n, 'cy');
      const rx = n.nom === 'circle' ? nombreAttr(n, 'r') : nombreAttr(n, 'rx'), ry = n.nom === 'circle' ? rx : nombreAttr(n, 'ry');
      if (!(rx > 0 && ry > 0)) return [];
      return lireChemin(`M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`);
    }
    case 'line': return lireChemin(`M${nombreAttr(n, 'x1')} ${nombreAttr(n, 'y1')}L${nombreAttr(n, 'x2')} ${nombreAttr(n, 'y2')}`);
    case 'polyline':
    case 'polygon': {
      const p = (n.attributs.points ?? '').trim();
      return p ? lireChemin('M' + p + (n.nom === 'polygon' ? 'Z' : '')) : [];
    }
    default: return undefined;
  }
}

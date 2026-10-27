// Un EPS (Encapsulated PostScript, niveau 2) du dessin, ecrit a la main comme le PDF : les formes en
// operateurs de trace, remplies et contournees avec leur couleur, leur epaisseur, leurs bouts, leurs
// jonctions, leur limite de pointe et leurs pointilles. Pur et deterministe (ni date, ni identifiant).
//
// Deux limites, dites et non cachees :
//  - l'EPS ne sait pas representer une opacite. Par defaut une forme translucide est aplatie sur du blanc
//    (sa couleur est melangee au blanc a son opacite) ; a la demande, l'opacite est ignoree. Dans les deux cas
//    le fichier est rendu avec un avertissement qui dit combien de formes sont touchees. Un recouvrement de
//    deux formes translucides ne se voit donc plus a travers : c'est une approximation, pas un rendu fidele.
//  - le CMJN est naif (`versCmjnNaif`), sans profil ICC : une indication de saturation, pas une separation.
//
// Le cadre (`%%BoundingBox`) est celui de l'encre : l'union des etendues des formes peintes, trait compris
// (`boiteAvecTrait`), et non celui du plan. Le dessin est translate pour que ce cadre commence en (0, 0).

import { LIMITE_MITRE_DEFAUT, boiteAvecTrait, depart, opaciteDuContour, opaciteDuRemplissage, pointillesEcrits, unir, type Boite, type Chemin, type Forme } from '../engine/editionSvg.js';
import type { DessinPlat } from '../engine/aplatir.js';
import { lireHex, superposer, versCmjnNaif, type Rgb } from '../util/couleur.js';
import { t } from '../util/i18n.js';
import { pluriel } from '../util/texte.js';
import { PT_PAR_POUCE, poucesParUnite, type Taille } from './dimensions.js';

export interface OptionsEps {
  readonly taille?: Taille | null;
  /** Des couleurs en CMJN naif (`setcmykcolor`) au lieu de RVB (`setrgbcolor`). */
  readonly cmjn?: boolean;
  /** `aplatir` (defaut) melange une couleur translucide au blanc ; `ignorer` la peint pleine. */
  readonly opacite?: 'aplatir' | 'ignorer';
  readonly titre?: string;
}

export interface ResultatEps {
  /** Le fichier, en ASCII 7 bits. */
  readonly eps: string;
  /** Ce que l'EPS ne sait pas dire fidelement, en francais, pour la personne. */
  readonly avertissements: readonly string[];
  /** Le cadre ecrit, en points : `[0, 0, largeur, hauteur]` de l'encre. */
  readonly cadre: readonly [number, number, number, number];
}

const nb = (v: number) => { const r = Number(v.toFixed(3)); return Object.is(r, -0) ? '0' : String(r); };
const BLANC: Rgb = { r: 255, g: 255, b: 255 };

/** Un texte de commentaire DSC : ASCII imprimable seulement, une ligne, sans accent (qu'un commentaire 7 bits ne porte pas). */
export function texteDsc(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '_').trim().slice(0, 120);
}

const PROLOGUE = [
  '/gs{gsave}bind def', '/gr{grestore}bind def', '/m{moveto}bind def', '/l{lineto}bind def', '/c{curveto}bind def',
  '/h{closepath}bind def', '/f{fill}bind def', '/e{eofill}bind def', '/s{stroke}bind def',
  '/rgb{setrgbcolor}bind def', '/cmyk{setcmykcolor}bind def'
];

/** Les formes qui peignent quelque chose : visibles, avec un fond ou un trait d'epaisseur non nulle. */
const peint = (f: Forme) => f.visible && (f.remplissage !== null || (f.contour !== null && f.epaisseur > 0));
const trait = (f: Forme) => f.contour !== null && f.epaisseur > 0;

/** L'etendue de l'encre : le trait compte seulement quand il est trace. */
function encre(formes: readonly Forme[]): Boite | null {
  return unir(formes.map(f => (trait(f) ? boiteAvecTrait(f) : boiteAvecTrait({ ...f, contour: null }))));
}

function operateursEps(d: Chemin, X: (x: number) => string, Y: (y: number) => string): string[] {
  const r: string[] = [];
  d.forEach((c, i) => {
    const p = c.p;
    if (c.c === 'M') r.push(X(p[0] ?? 0) + ' ' + Y(p[1] ?? 0) + ' m');
    else if (c.c === 'L') r.push(X(p[0] ?? 0) + ' ' + Y(p[1] ?? 0) + ' l');
    else if (c.c === 'C') r.push([X(p[0] ?? 0), Y(p[1] ?? 0), X(p[2] ?? 0), Y(p[3] ?? 0), X(p[4] ?? 0), Y(p[5] ?? 0)].join(' ') + ' c');
    else if (c.c === 'Q') {
      // Une quadratique en cubique equivalente : les poignees aux deux tiers.
      const [x0, y0] = depart(d, i), [x1, y1, x, y] = [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0, p[3] ?? 0];
      r.push([X(x0 + (2 / 3) * (x1 - x0)), Y(y0 + (2 / 3) * (y1 - y0)), X(x + (2 / 3) * (x1 - x)), Y(y + (2 / 3) * (y1 - y)), X(x), Y(y)].join(' ') + ' c');
    } else r.push('h');
  });
  return r;
}

interface Contexte { readonly k: number; readonly cmjn: boolean; readonly aplatir: boolean; translucides: number }

/** La couleur d'une peinture a son opacite, en operateur PostScript. L'opacite est aplatie sur blanc ou ignoree. */
function couleur(hex: string, alpha: number, ctx: Contexte): string {
  const c = lireHex(hex) ?? { r: 0, g: 0, b: 0 }, rgb = alpha < 1 && ctx.aplatir ? superposer(c, BLANC, alpha) : c;
  if (ctx.cmjn) { const m = versCmjnNaif(rgb); return [m.c, m.m, m.j, m.n].map(v => nb(v / 100)).join(' ') + ' cmyk'; }
  return [rgb.r, rgb.g, rgb.b].map(v => nb(v / 255)).join(' ') + ' rgb';
}

/** Le style du trait en operateurs : epaisseur, bout, jonction, limite de pointe, pointilles (tout mis a l'echelle `k`). */
function styleTrait(f: Forme, k: number): string {
  const r = [nb(f.epaisseur * k) + ' setlinewidth', (f.bout === 'round' ? 1 : f.bout === 'square' ? 2 : 0) + ' setlinecap', (f.jonction === 'miter' ? 0 : f.jonction === 'bevel' ? 2 : 1) + ' setlinejoin'];
  if (f.jonction === 'miter') r.push(nb(Math.max(1, f.limiteMitre ?? LIMITE_MITRE_DEFAUT)) + ' setmiterlimit');
  const p = pointillesEcrits(f);
  if (p) r.push('[' + p.liste.map(v => nb(Number(v) * k)).join(' ') + '] ' + nb(Number(p.decalage) * k) + ' setdash');
  return r.join(' ');
}

function ecrireForme(f: Forme, ctx: Contexte, X: (x: number) => string, Y: (y: number) => string): string {
  const remplie = f.remplissage !== null, traite = trait(f);
  const alphaFond = f.opacite * opaciteDuRemplissage(f), alphaTrait = f.opacite * opaciteDuContour(f);
  if ((remplie && alphaFond < 1) || (traite && alphaTrait < 1)) ctx.translucides++;
  const l = ['gs', 'newpath', ...operateursEps(f.d, X, Y)];
  const pair = f.regle === 'evenodd' ? 'e' : 'f';
  if (f.remplissage !== null) l.push(traite ? 'gs ' + couleur(f.remplissage, alphaFond, ctx) + ' ' + pair + ' gr' : couleur(f.remplissage, alphaFond, ctx) + ' ' + pair);
  if (traite && f.contour !== null) l.push(couleur(f.contour, alphaTrait, ctx) + ' ' + styleTrait(f, ctx.k) + ' s');
  l.push('gr');
  return l.join('\n');
}

/** Le plus petit decimal au-dessus (a 1/1000) : un sommet arrondi au millieme ne depasse jamais le cadre ecrit. */
const plafond = (v: number) => Math.ceil(v * 1000 - 1e-6) / 1000;

/** Le fichier EPS et ce qu'il ne dit pas fidelement. */
export function ecrireEps(dessin: DessinPlat, options: OptionsEps = {}): ResultatEps {
  const peintes = dessin.formes.filter(peint);
  const k = poucesParUnite(dessin.vb, options.taille) * PT_PAR_POUCE;
  const boite = encre(peintes) ?? { x: dessin.vb[0], y: dessin.vb[1], l: dessin.vb[2], h: dessin.vb[3] };
  const largeur = plafond(boite.l * k), hauteur = plafond(boite.h * k), bas = boite.y + boite.h;
  const ctx: Contexte = { k, cmjn: options.cmjn === true, aplatir: options.opacite !== 'ignorer', translucides: 0 };
  const X = (x: number) => nb((x - boite.x) * k), Y = (y: number) => nb((bas - y) * k);
  const corps = peintes.map(f => ecrireForme(f, ctx, X, Y));
  const avertissements: string[] = [];
  if (ctx.translucides) {
    const formes = pluriel(ctx.translucides, 'forme translucide');
    avertissements.push(ctx.aplatir
      ? t('{formes} : l’EPS ne représente pas l’opacité, elle est aplatie sur du blanc (un recouvrement ne se voit plus à travers).', { formes })
      : t('{formes} : l’EPS ne représente pas l’opacité, elle est ignorée (la forme est peinte pleinement opaque).', { formes }));
  }
  if (ctx.cmjn) avertissements.push(t('CMJN naïf, sans profil ICC : une indication de saturation, pas une séparation. Pour l’imprimeur, convertissez avec son profil.'));
  const entete = [
    '%!PS-Adobe-3.0 EPSF-3.0',
    '%%Creator: svg',
    ...(options.titre ? ['%%Title: ' + texteDsc(options.titre)] : []),
    '%%BoundingBox: 0 0 ' + Math.ceil(largeur) + ' ' + Math.ceil(hauteur),
    '%%HiResBoundingBox: 0 0 ' + nb(largeur) + ' ' + nb(hauteur),
    '%%LanguageLevel: 2',
    '%%DocumentData: Clean7Bit',
    '%%Pages: 1',
    '%%EndComments',
    '%%BeginProlog', ...PROLOGUE, '%%EndProlog',
    '%%Page: 1 1'
  ];
  const eps = [...entete, ...corps, 'showpage', '%%Trailer', '%%EOF'].join('\n') + '\n';
  return { eps, avertissements, cadre: [0, 0, largeur, hauteur] };
}

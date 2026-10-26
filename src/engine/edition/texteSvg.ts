// Le texte d'un SVG lu en lettres (ADR-0020, section texte) : <text>, <tspan> et <a> en ligne, leurs x, y, dx, dy (listes) et
// rotate, text-anchor par morceau, font-family, font-size, font-weight, font-style, letter-spacing, word-spacing, la peinture et
// l'opacite heritees par la cascade. Chaque lettre devient une forme (edition/glyphes.ts), dessinee avec la fonte embarquee que
// la regle de remplacement choisit (model/polices.ts) ; un remplacement est dit. Non pris en charge, ignores et dits : <textPath>
// et l'ecriture verticale (writing-mode). Sans polices donnees a la lecture, le texte reste refuse comme avant (parcours.ts).

import type { Noeud } from '../../util/xml.js';
import { remplacerFamilles, phraseRemplacement, type IdPolice, type Remplacement } from '../../model/polices.js';
import type { Forme, Matrice } from './types.js';
import { facteur, multiplier, rotation, translation } from './geometrie.js';
import { formesDeGlyphes, PENCHE, sourceDeGlyphes, type GlypheAPoser, type Glyphes } from './glyphes.js';
import { heriter, lireEpaisseur, lireOpacites, lireTaillePolice, peinture, TAILLE_POLICE_DEFAUT } from './heritage.js';
import { COULEUR_COURANTE, lirePeintureAlpha, peintureSure } from './peinture.js';
import { lireTrait } from './trait.js';
import { proprietesDe, type Analyse } from './cascade.js';
import type { Proprietes } from './ignores.js';
import { coordonneeSaine } from './limites.js';
import { nombre, t } from '../../util/i18n.js';

/** Les fontes que la lecture peut employer pour le texte, par identifiant (dist/polices.js) ; null pour une fonte non chargee. */
export interface PolicesTexte { glyphes(id: IdPolice): Glyphes | null }

/** Ce que la lecture du texte partage avec la marche : de quoi poser les formes et dire ce qui change. */
export interface ContexteTexte {
  readonly analyse: Analyse;
  readonly polices: PolicesTexte;
  readonly formes: Forme[];
  readonly refus: Set<string>;
  /** Les remplacements, par police demandee et remplacante, avec le nombre de textes. */
  readonly remplacements: Map<string, { readonly r: Remplacement; textes: number }>;
  /** Les caracteres lus en tout : au-dela de `CARACTERES_MAX`, le SVG est refuse. */
  caracteres: number;
}

/** Les caracteres de texte lus au plus dans un SVG : un texte de livre entier ; au-dela, des dizaines de milliers de formes. */
export const CARACTERES_MAX = 100_000;

// Des cles, evaluees au chargement avant la langue (le francais) ; `t(MSG_X)` les traduit quand on les dit.
export const MSG_TEXTPATH = t('le texte qui suit un chemin (<textPath>)');
export const MSG_VERTICAL = t('le texte écrit verticalement (writing-mode)');
export const MSG_SANS_GLYPHE = t('des caractères que la fonte de remplacement n’a pas');
export const MSG_SANS_FONTE = t('du texte dont la fonte de remplacement n’est pas chargée');

/** Un caractere a poser, avec ce que ses elements lui donnent : proprietes heritees, positions et rotation. */
interface Caractere {
  c: string;
  readonly h: Proprietes;
  readonly x?: number; readonly y?: number; readonly dx: number; readonly dy: number; readonly r: number;
}

/** Une liste de longueurs (x="10 20 30") ; une longueur en pourcentage ou en unite autre que le pixel est ignoree (0). */
const longueurs = (v: string | undefined): number[] => (v ?? '').trim().split(/[\s,]+/).filter(Boolean).map(t => { const n = Number.parseFloat(t); return Number.isFinite(n) ? n : 0; });

interface Listes { readonly x: number[]; readonly y: number[]; readonly dx: number[]; readonly dy: number[]; readonly r: number[]; rang: number }
const listesDe = (n: Noeud): Listes => ({ x: longueurs(n.attributs.x), y: longueurs(n.attributs.y), dx: longueurs(n.attributs.dx), dy: longueurs(n.attributs.dy), r: longueurs(n.attributs.rotate), rang: 0 });

/** La valeur de la liste la plus proche du caractere (l'element le plus interieur qui en donne une, 10.5 de SVG 1.1). */
function valeur(pile: readonly Listes[], cle: 'x' | 'y' | 'dx' | 'dy'): number | undefined {
  for (let i = pile.length - 1; i >= 0; i--) { const l = pile[i]; const v = l?.[cle][l.rang]; if (v !== undefined) return v; }
  return undefined;
}
/** rotate : la derniere valeur se repete pour les caracteres qui suivent. */
function rotationDe(pile: readonly Listes[]): number {
  for (let i = pile.length - 1; i >= 0; i--) { const l = pile[i]; if (l && l.r.length) return l.r[Math.min(l.rang, l.r.length - 1)] ?? 0; }
  return 0;
}

/**
 * Les caracteres d'un <text>, dans l'ordre, blancs ramenes comme un navigateur (xml:space par defaut) AVANT d'attribuer les positions :
 * un blanc de tete ou en double n'est pas un caractere, il ne prend pas de x ni de y (10.4 de SVG 1.1).
 */
function caracteres(ctx: ContexteTexte, n: Noeud, h: Proprietes, pile: Listes[], sortie: Caractere[]): void {
  pile.push(listesDe(n));
  for (const m of n.suite ?? []) {
    if (typeof m !== 'string') {
      if (m.nom === 'textPath') { ctx.analyse.ignores.add(t(MSG_TEXTPATH)); continue; }
      if (m.nom !== 'tspan' && m.nom !== 'a') continue;
      const pr = proprietesDe(ctx.analyse, m);
      if ((pr.display ?? '').trim() === 'none') continue;
      caracteres(ctx, m, heriter(h, pr), pile, sortie);
      continue;
    }
    for (const c of m.replace(/[\r\n]+/g, '').replace(/\t/g, ' ')) {
      if (c === ' ' && (sortie.length === 0 || sortie[sortie.length - 1]?.c === ' ')) continue;
      if (++ctx.caracteres > CARACTERES_MAX) return;
      const x = valeur(pile, 'x'), y = valeur(pile, 'y');
      sortie.push({ c, h, ...(x !== undefined ? { x } : {}), ...(y !== undefined ? { y } : {}), dx: valeur(pile, 'dx') ?? 0, dy: valeur(pile, 'dy') ?? 0, r: rotationDe(pile) });
      for (const l of pile) l.rang++;
    }
  }
  pile.pop();
}

/** Le blanc de fin d'un texte n'est pas un caractere non plus. */
function sansBlancFinal(cs: Caractere[]): Caractere[] {
  while (cs.length && cs[cs.length - 1]?.c === ' ') cs.pop();
  return cs;
}

const gras = (h: Proprietes): boolean => { const w = (h['font-weight'] ?? '').trim().toLowerCase(); return w === 'bold' || w === 'bolder' || Number(w) >= 600; };
const italique = (h: Proprietes): boolean => /italic|oblique/i.test(h['font-style'] ?? '');
/** Le navigateur dessine en Times New Roman un texte sans famille : c'est la police demandee. */
const familles = (h: Proprietes): string => (h['font-family'] ?? '').trim() || 'Times New Roman';

/** Lit un <text> en formes : `h` ses proprietes heritees (les siennes comprises), `m` sa matrice, `opacite` celle des groupes. */
export function lireTexte(ctx: ContexteTexte, n: Noeud, h: Proprietes, m: Matrice, opacite: number): void {
  if (/^(tb|tb-rl|vertical-rl|vertical-lr|sideways)/i.test((h['writing-mode'] ?? '').trim())) { ctx.analyse.ignores.add(t(MSG_VERTICAL)); return; }
  const cs: Caractere[] = [];
  caracteres(ctx, n, h, [], cs);
  if (ctx.caracteres > CARACTERES_MAX) { ctx.refus.add(t('trop de texte (plus de {n} caractères)', { n: nombre(CARACTERES_MAX) })); return; }
  const lettres = sansBlancFinal(cs);
  // Les morceaux : un caractere a x ou y absolu en commence un nouveau ; text-anchor deplace chaque morceau entier.
  let cx = 0, cy = 0, precedent: { c: string; g: Glyphes } | null = null;
  const morceaux: Array<{ debut: number; ancre: string; poses: Array<{ k: Caractere; x: number; y: number; g: Glyphes | null; r: Remplacement; taille: number }>; fin: number }> = [];
  const utilises = new Map<string, Remplacement>();
  for (const k of lettres) {
    if (k.x !== undefined || k.y !== undefined || !morceaux.length) morceaux.push({ debut: k.x ?? cx, ancre: (k.h['text-anchor'] ?? 'start').trim(), poses: [], fin: k.x ?? cx });
    if (k.x !== undefined) { cx = k.x; precedent = null; }
    if (k.y !== undefined) { cy = k.y; precedent = null; }
    cx += k.dx; cy += k.dy;
    const r = remplacerFamilles(familles(k.h), { gras: gras(k.h), italique: italique(k.h) });
    const g = ctx.polices.glyphes(r.id) ?? ctx.polices.glyphes('inter');
    const taille = lireTaillePolice(k.h['font-size'], TAILLE_POLICE_DEFAUT), e = g ? taille / (g.unitesParEm || 1000) : 0;
    if (g && precedent && precedent.g === g) cx += g.crenage(precedent.c, k.c) * e;
    const morceau = morceaux[morceaux.length - 1];
    morceau?.poses.push({ k, x: cx, y: cy, g, r, taille });
    if (!g) { ctx.analyse.ignores.add(t(MSG_SANS_FONTE)); continue; }
    if (k.c !== ' ') utilises.set(r.demandee + '>' + r.id + (r.penchee ? '/' : ''), r);
    cx += g.avance(k.c) * e + (Number.parseFloat(k.h['letter-spacing'] ?? '') || 0) + (k.c === ' ' ? Number.parseFloat(k.h['word-spacing'] ?? '') || 0 : 0);
    if (morceau) morceau.fin = cx;
    precedent = { c: k.c, g };
  }
  for (const morceau of morceaux) {
    const largeur = morceau.fin - morceau.debut, decalage = morceau.ancre === 'middle' ? -largeur / 2 : morceau.ancre === 'end' ? -largeur : 0;
    for (const p of morceau.poses) if (p.g && p.k.c !== ' ') poserLettre(ctx, p.k, p.g, p.r, p.x + decalage, p.y, p.taille, m, opacite);
  }
  for (const [cle, r] of utilises) {
    if (r.exacte) continue;
    const deja = ctx.remplacements.get(cle);
    if (deja) deja.textes++; else ctx.remplacements.set(cle, { r, textes: 1 });
  }
}

/** Pose une lettre : sa glyphe, a sa place, tournee de son rotate, penchee pour une italique synthetique, avec sa peinture. */
function poserLettre(ctx: ContexteTexte, k: Caractere, g: Glyphes, r: Remplacement, x: number, y: number, taille: number, m: Matrice, opacite: number): void {
  const h = k.h;
  if ((h.visibility ?? '').trim() === 'hidden') return;
  const courante = h.color === undefined ? COULEUR_COURANTE : lirePeintureAlpha(h.color);
  const fond = peinture(h.fill, '#000000', courante), trait = peinture(h.stroke, null, courante);
  const { couleur: remplissage } = fond, { couleur: contour } = trait;
  if (!remplissage && !contour) return;
  if ((remplissage && remplissage.startsWith('url(')) || (contour && contour.startsWith('url('))) { ctx.refus.add(t('un dégradé ou un motif')); return; }
  if ((remplissage && !peintureSure(remplissage)) || (contour && !peintureSure(contour))) { ctx.refus.add(t('une peinture qui n’est pas une couleur lisible')); return; }
  let pose = multiplier(m, multiplier(translation(x, y), multiplier(rotation(k.r), [taille, 0, 0, taille, 0, 0])));
  if (r.penchee) pose = multiplier(pose, PENCHE);
  const epaisseur = contour ? lireEpaisseur(h['stroke-width']) * facteur(m) : 0;
  const { champs: styleTrait } = contour ? lireTrait(h, facteur(m)) : { champs: {} };
  const glyphe: GlypheAPoser = { cle: k.c, m: pose };
  const { formes, manquantes } = formesDeGlyphes([glyphe], sourceDeGlyphes(g), { remplissage, contour, epaisseur, ...styleTrait, ...lireOpacites(opacite, h, fond, trait) }, () => 'f' + (ctx.formes.length + 1));
  if (manquantes) ctx.analyse.ignores.add(t(MSG_SANS_GLYPHE));
  for (const f of formes) {
    if (!f.d.every(c => c.p.every(coordonneeSaine))) { ctx.refus.add(t('des coordonnées démesurées')); return; }
    ctx.formes.push(f);
  }
}

/** Les phrases des remplacements faits pendant la lecture, dans l'ordre ou ils sont apparus. */
export const phrasesRemplacements = (ctx: Pick<ContexteTexte, 'remplacements'>): string[] => [...ctx.remplacements.values()].map(x => phraseRemplacement(x.textes, x.r));

/** Le nom du groupe des lettres d'un texte (ADR-0012, annexe 4 A §2) : « Texte « … » », sa premiere ligne, ecourtee. */
export function nomGroupeTexte(texte: string): string {
  const ligne = (texte.split('\n').find(l => l.trim() !== '') ?? '').trim();
  const court = [...ligne].length > 40 ? [...ligne].slice(0, 39).join('').trimEnd() + '…' : ligne;
  return 'Texte « ' + court + ' »';
}

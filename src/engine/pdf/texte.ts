// Le texte d'un flux de contenu (ISO 32000-1, 9.2 a 9.4) : l'etat du texte (Tc, Tw, Tz, TL, Tf, Tr, Ts), les matrices de texte et
// de ligne (BT, Td, TD, Tm, T*), et la pose de chaque glyphe d'une chaine (Tj, TJ, ', ") : sa matrice dans le dessin et l'avance
// qui la suit, par les largeurs du fichier (celles de la police d'origine, meme quand une autre la remplace : les lettres
// restent ou elles etaient). Les formes se font ensuite dans contenu.ts, par edition/glyphes.ts.

import { formesDeGlyphes, multiplier, sourceDeGlyphes, translation, PENCHE, type Forme, type GlypheAPoser, type Glyphes, type Matrice, type SourceContours } from '../editionSvg.js';
import { noterPertes, styleDe } from './trace.js';
import type { Contexte, Etat } from './etat.js';
import { estChaine, estDict, estNombre, type Chaine, type Dict, type ObjetPdf } from './objets.js';
import { lirePolice, type PolicePdf } from './polices.js';

/** L'etat du texte, qui fait partie de l'etat graphique (q et Q le gardent). */
export interface EtatTexte {
  police: Dict | null;
  taille: number;
  /** Interlettrage (Tc), espacement des mots (Tw), echelle horizontale (Tz / 100), interligne (TL), rendu (Tr), elevation (Ts). */
  tc: number;
  tw: number;
  th: number;
  tl: number;
  tr: number;
  ts: number;
}

export const texteInitial = (): EtatTexte => ({ police: null, taille: 0, tc: 0, tw: 0, th: 1, tl: 0, tr: 0, ts: 0 });

/** La police d'un dictionnaire, lue une fois par lecture. */
export function policeDe(ctx: Contexte, d: Dict): PolicePdf | null {
  if (!ctx.polices) return null;
  let p = ctx.policesLues.get(d);
  if (!p) { p = lirePolice(ctx.doc, d, ctx.polices); ctx.policesLues.set(d, p); }
  return p;
}

/** Ce qu'une chaine pose : ses glyphes (par numero dans le programme embarque, ou par caractere pour la fonte qui remplace), ses glyphes Type 3. */
export interface Pose {
  readonly tm: Matrice;
  readonly poses: GlypheAPoser[];
  readonly type3: Array<{ readonly nom: string; readonly ctm: Matrice }>;
  /** Les codes sans glyphe ni texte connus : rien a dessiner. */
  readonly inconnus: number;
}

/**
 * Pose une suite de chaines et d'ajustements (TJ) a partir de la matrice de texte `tm` : chaque glyphe a sa matrice (de son em,
 * Y vers le bas, au repere du dessin), puis la matrice avance de sa largeur, de l'interlettrage, de l'espacement des mots (code 32
 * d'une police simple) ; un nombre de TJ recule de n millemes d'em.
 */
export function poser(ctx: Contexte, e: Etat, tm: Matrice, police: PolicePdf, remplacante: Glyphes | null, elements: readonly ObjetPdf[]): Pose {
  const t = e.texte, poses: GlypheAPoser[] = [], type3: Array<{ nom: string; ctm: Matrice }> = [];
  const echelle: Matrice = [t.taille * t.th, 0, 0, t.taille, 0, t.ts];
  const fm = police.type3?.matrice;
  // Une police remplacee qui demandait une italique se penche (italique synthetique) ; l'original, jamais.
  const em: Matrice = police.fonte || !police.remplacement.penchee ? [1, 0, 0, -1, 0, 0] : multiplier([1, 0, 0, -1, 0, 0], PENCHE);
  let m = tm, inconnus = 0;
  for (const x of elements) {
    if (estNombre(x)) { m = multiplier(m, translation((-x / 1000) * t.taille * t.th, 0)); continue; }
    if (!estChaine(x)) continue;
    for (const code of police.codes((x as Chaine).v)) {
      const base = multiplier(ctx.page, multiplier(e.ctm, multiplier(m, echelle)));
      let largeur = police.largeur(code);
      if (fm) {
        type3.push({ nom: police.nom(code), ctm: multiplier(e.ctm, multiplier(m, multiplier(echelle, fm))) });
      } else if (police.fonte) {
        const gid = police.gid(code);
        if (gid === null) inconnus++; else poses.push({ cle: gid, m: multiplier(base, em) });
        if (largeur === null && gid !== null) largeur = (police.fonte.avance(gid) * 1000) / (police.fonte.unitesParEm || 1000);
      } else {
        const texte = police.unicode(code);
        if (!texte) inconnus++;
        // Un texte de plusieurs caracteres (une ligature « fi » dite par /ToUnicode) se pose lettre a lettre dans la largeur du code.
        let decalage = 0;
        for (const c of texte) {
          poses.push({ cle: c, m: multiplier(base, multiplier(translation(decalage, 0), em)) });
          if (remplacante) decalage += remplacante.avance(c) / (remplacante.unitesParEm || 1000);
        }
        if (largeur === null && remplacante && texte) largeur = decalage * 1000;
      }
      const w0 = fm ? (largeur ?? 0) * (fm[0] ?? 0.001) : (largeur ?? 500) / 1000;
      const espace = !police.composite && code === 32 ? t.tw : 0;
      m = multiplier(m, translation((w0 * t.taille + t.tc + espace) * t.th, 0));
    }
  }
  return { tm: m, poses, type3, inconnus };
}

/** La police nommee dans les ressources (Tf), ou null. */
export function dictPolice(ctx: Contexte, ressources: Dict | null, nom: string): Dict | null {
  const p = ctx.doc.valeur(ctx.doc.dict(ressources, 'Font'), nom);
  return estDict(p) ? p : null;
}

/**
 * Les formes des lettres posees : contours du programme embarque (exacts) ou de la fonte qui remplace, au style de l'etat (le
 * trait a l'echelle de la matrice courante, comme un trace), ce que la decoupe en cache etant note.
 */
export function lettres(ctx: Contexte, e: Etat, police: PolicePdf, remplacante: Glyphes | null, poses: readonly GlypheAPoser[], fond: string | null, trait: string | null): Forme[] {
  if (!fond && !trait) return [];
  const fonte = police.fonte;
  const source: SourceContours | null = fonte ? { unitesParEm: fonte.unitesParEm, contour: cle => (typeof cle === 'number' ? fonte.contour(cle) : null) } : remplacante ? sourceDeGlyphes(remplacante) : null;
  if (!source) return [];
  const style = styleDe(e, fond, trait, ctx.pertes);
  const debut = ctx.formes.length;
  const { formes, manquantes } = formesDeGlyphes(poses, source, style, rang => 'f' + (debut + rang + 1));
  ctx.pertes.caracteresInconnus += manquantes;
  for (const f of formes) noterPertes(e, f, ctx.pertes);
  return formes;
}

// La saisie d'un texte sur la toile (ADR-0027), sa part pure : les reglages du texte a venir, le texte neuf pose au point
// d'insertion, le dessin apres une frappe, et les phrases du debut et de la fin. Le champ, le focus et les evenements sont
// dans SaisieTexte.tsx ; la composition et le curseur dans engine/texte/.

import type { AlignementTexte, DessinSvg, TexteVivant } from '../engine/editionSvg.js';
import type { ProfilProduction } from '../engine/preparation.js';
import { BAS_CURSEUR, HAUT_CURSEUR, type PointTexte } from '../engine/texte/curseur.js';
import { avecTrace, creerTexte, nouveauTexte, type PeintureTexte } from '../engine/texte/vivant.js';
import type { Police } from '../io/polices.js';
import { appliquerChangement, contoursDe, policeDuTexte, type TraceTexte } from './actionsTexte.js';

/**
 * Les reglages du prochain texte : ceux que la barre de texte et le panneau reglent avant la premiere lettre, et que la
 * saisie reprend. `police` vide : la premiere fonte chargee ; `taille` nulle : un sixieme du plan (celle de toujours).
 */
export interface ReglagesNouveauTexte {
  readonly police: string;
  readonly taille: number | null;
  readonly interlettrage: number;
  readonly interligne: number;
  readonly alignement: AlignementTexte;
  /** Les ligatures, quand la fonte en a et que l'interlettrage est nul (ADR-0022 : ouvertes par defaut). */
  readonly ligatures: boolean;
  /** Le trace des lettres : pleines, ou une ligne au milieu du trait (ADR-0027) ; une police a trait unique est toujours en ligne. */
  readonly trace: TraceTexte;
}

export const NOUVEAU_TEXTE: ReglagesNouveauTexte = { police: '', taille: null, interlettrage: 0, interligne: 1.2, alignement: 'gauche', ligatures: true, trace: 'plein' };

/** La taille du prochain texte : la reglee, sinon un sixieme du petit cote du plan, arrondi. */
export const tailleNouveauTexte = (r: ReglagesNouveauTexte, vb: DessinSvg['vb']): number => r.taille ?? Math.max(1, Math.round(Math.min(vb[2], vb[3]) / 6));

/** La police du prochain texte parmi les fontes chargees : la reglee, sinon la premiere. */
export const policeNouveauTexte = (r: ReglagesNouveauTexte, polices: readonly Police[] | null): Police | null =>
  polices?.find(p => p.id === r.police) ?? polices?.[0] ?? null;

const centieme = (v: number): number => Math.round(v * 100) / 100;

/**
 * Le texte vivant qui commence au point d'insertion : le milieu du curseur tombe sur le point (la premiere ligne de base passe
 * un peu dessous), arrondi au centieme, pour qu'un clic n'ecrive pas quinze decimales dans la matrice.
 */
export function texteNeuf(texte: string, point: PointTexte, r: ReglagesNouveauTexte, taille: number, police: Police): TexteVivant {
  const base = point[1] + ((HAUT_CURSEUR - BAS_CURSEUR) / 2) * taille;
  const ligatures = r.ligatures && police.glyphes.ligature !== undefined && r.interlettrage === 0;
  return avecTrace(nouveauTexte(texte, policeDuTexte(police), taille, [1, 0, 0, 1, centieme(point[0]), centieme(base)], { interlettrage: r.interlettrage, interligne: r.interligne, alignement: r.alignement, ligatures }), r.trace === 'median');
}

/** Vrai si ce texte dessine au moins une lettre avec cette fonte (un texte vide ou fait de blancs ne dessine rien). */
export const dessine = (t: TexteVivant, police: Police): boolean => contoursDe(t, police).some(c => c.c !== 'M' && c.c !== 'Z');

/** Ce qu'une frappe sait de la saisie : la forme du texte (null tant qu'un texte neuf n'a rien dessine), et le texte neuf a poser. */
export interface EtatFrappe { readonly id: string | null; readonly neuf: TexteVivant | null }

/**
 * Le dessin apres une frappe. Le texte d'une forme deja posee se recompose ; s'il ne dessine plus rien, la forme reste telle
 * quelle (on ne pose pas une forme invisible : la toile la cache le temps de la saisie, et la fin de la saisie la retire). Un
 * texte neuf ne devient une forme qu'a sa premiere lettre dessinee : un clic sans frappe ne laisse rien.
 */
export function frapper(d: DessinSvg, s: EtatFrappe, texte: string, police: Police, peinture: PeintureTexte, profil: ProfilProduction | null): { dessin: DessinSvg; id: string | null; dessine: boolean } {
  if (s.id) {
    const f = d.formes.find(x => x.id === s.id);
    if (!f?.texte) return { dessin: d, id: s.id, dessine: false };
    const ok = dessine({ ...f.texte, texte }, police);
    return { dessin: ok ? appliquerChangement(d, s.id, { texte }, police, profil) : d, id: s.id, dessine: ok };
  }
  if (!s.neuf) return { dessin: d, id: null, dessine: false };
  const t = { ...s.neuf, texte };
  const r = creerTexte(d, t, contoursDe(t, police), peinture);
  return { dessin: r.dessin, id: r.id, dessine: r.id !== null };
}

/** Ce que dit la region vocale en ouvrant la saisie (une fois : elle ne lit pas chaque lettre). */
export const PHRASE_DEBUT_SAISIE = 'Saisie du texte sur la toile : tapez votre texte. Entrée va à la ligne, Échap termine, Alt+F10 mène à la barre de texte.';

/** La saisie se termine avant que les fontes soient la (le premier clic les charge) : ce qui est tape ne s'est pas compose. */
export const PHRASE_POLICES_EN_CHARGEMENT = 'Les polices se chargeaient encore : le texte n’est pas ajouté. Recommencez dans un instant.';

const extrait = (v: string): string => { const u = v.replace(/\s*\n\s*/g, ' / '); return u.length > 40 ? u.slice(0, 39) + '…' : u; };

/** La phrase de la fin de la saisie : ce qui est arrive au texte, et le geste qui le rouvre. */
export function phraseFinSaisie(o: { readonly cree: boolean; readonly retire: boolean; readonly vide: boolean; readonly avant: string; readonly apres: string; readonly police: string }): string {
  if (o.vide) return o.retire ? 'Texte vide : la forme est retirée. Ctrl+Z la rend.' : 'Texte vide : rien n’est ajouté.';
  if (o.cree) return 'Texte ajouté en ' + o.police + ' : « ' + extrait(o.apres) + ' ». Il reste modifiable : double-clic ou Entrée.';
  return o.apres === o.avant ? 'Texte inchangé.' : 'Texte modifié : « ' + extrait(o.apres) + ' ».';
}

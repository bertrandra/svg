// Le jugement d'un dessin pour le stylo et pour la lame, la ou le texte et les traits ouverts changent tout (ADR-0022).
// La Cricut ecrit avec un stylo : elle NE REMPLIT PAS. Une forme pleine sera dessinee par son pourtour, une lettre a contour
// en double trait (creuse). A l'inverse, la lame ne decoupe pas un trait ouvert, et des lettres qui se chevauchent se coupent
// l'une a travers l'autre. Ces constats sont purs, comme ceux de constats.ts ; chacun propose des corrections faites par des
// outils qui existent (contour en forme, hachures, vectoriser en soudant, changer de police) et qui s'annulent.

import { sansTexte, sousChemins, type Chemin, type DessinSvg, type Forme } from '../editionSvg.js';
import { toleranceBooleen } from '../booleens.js';
import { groupesQuiSeTouchent, partiesDe, vectoriserTextes } from '../texte/vectoriser.js';
import { hachurerFormes } from '../contour/hachures.js';
import { natureDuTexte } from '../texte/vivant.js';
import { pluriel } from '../../util/texte.js';
import { t } from '../../util/i18n.js';
import type { Gravite } from './constats.js';

export type CodeConstatTexte = 'stylo-plein' | 'stylo-double-trait' | 'decoupe-trait-ouvert' | 'lettres-chevauchent';
export type CodeCorrectionTexte = 'garder-contour' | 'hachurer' | 'police-trait' | 'contour-en-forme' | 'souder' | 'ecrire';

// Des accesseurs : la langue de l'interface est posee apres le chargement du module (ADR-0042).
export const LIBELLES_CORRECTION_TEXTE: Readonly<Record<CodeCorrectionTexte, string>> = {
  get 'garder-contour'() { return t('Garder le contour'); },
  get hachurer() { return t('Hachurer'); },
  get 'police-trait'() { return t('Police à trait unique'); },
  get 'contour-en-forme'() { return t('Contour en forme'); },
  get souder() { return t('Souder'); },
  get ecrire() { return t('Écrire au stylo'); }
};

export interface ConstatTexte {
  readonly code: CodeConstatTexte;
  readonly gravite: Gravite;
  readonly message: string;
  readonly formes: readonly string[];
  /** Les corrections proposees, la premiere etant celle qu'on conseille. */
  readonly corrections: readonly CodeCorrectionTexte[];
  readonly aVerifier?: true;
}

const ids = (formes: readonly Forme[]): string[] => formes.map(f => f.id);
const visibles = (d: DessinSvg): Forme[] => d.formes.filter(f => f.visible);
/** Un texte vivant compose dans une police a contour : au stylo, chaque lettre sera son pourtour. */
const texteAContour = (f: Forme): boolean => !!f.texte && natureDuTexte(f.texte) === 'contour';

/**
 * Le procede « Dessin au stylo » : une forme pleine se dessine par son pourtour (le stylo ne remplit pas) ; un texte a contour
 * se dessine en double trait. La premiere correction de chaque constat est la plus sure ; « Police a trait unique » n'est
 * proposee que s'il y a un texte vivant a contour.
 */
export function constatsStylo(dessin: DessinSvg): ConstatTexte[] {
  const r: ConstatTexte[] = [];
  const pleines = visibles(dessin).filter(f => f.remplissage !== null);
  const textes = pleines.filter(texteAContour);
  if (pleines.length) {
    r.push({
      code: 'stylo-plein', gravite: 'a-corriger', formes: ids(pleines), aVerifier: true,
      corrections: textes.length ? ['garder-contour', 'hachurer', 'police-trait'] : ['garder-contour', 'hachurer'],
      message: (pleines.length > 1 ? t('Le stylo trace le pourtour des formes pleines : {n} formes seront dessinées creuses. Gardez le contour, ou hachurez pour remplir.', { n: pleines.length }) : t('Le stylo trace le pourtour des formes pleines : une forme sera dessinée creuse. Gardez le contour, ou hachurez pour remplir.'))
    });
  }
  if (textes.length) {
    r.push({
      code: 'stylo-double-trait', gravite: 'conseil', formes: ids(textes), corrections: ['police-trait'],
      message: (textes.length > 1 ? t('Double trait : ces {n} textes à contour seront dessinés en lettres creuses. Une police à trait unique écrit chaque lettre d’une seule ligne.', { n: textes.length }) : t('Double trait : ce texte à contour sera dessiné en lettres creuses. Une police à trait unique écrit chaque lettre d’une seule ligne.'))
    });
  }
  return r;
}

/** Vrai si la forme porte un trace ouvert sans fond : une ligne, que la lame ne sait pas decouper. */
export const traitOuvert = (f: Forme): boolean => f.remplissage === null && f.contour !== null
  && ((!!f.texte && natureDuTexte(f.texte) === 'trait') || sousChemins(f.d).some(s => !s.some(c => c.c === 'Z')));

/** Les textes vivants a contour dont des lettres (des parties) se chevauchent : la lame couperait l'une a travers l'autre. */
export function textesQuiSeChevauchent(dessin: DessinSvg, tolerance = toleranceBooleen(dessin)): Forme[] {
  return visibles(dessin).filter(f => {
    if (!texteAContour(f) || f.remplissage === null) return false;
    const parties: Chemin[] = partiesDe(f.d, false, tolerance);
    return parties.length > 1 && groupesQuiSeTouchent(parties, false, 0, tolerance).some(g => g.length > 1);
  });
}

/** Le constat d'un trait ouvert en decoupe (ou d'un texte a trait unique), ou null. */
export function constatTraitsOuverts(dessin: DessinSvg): ConstatTexte | null {
  const ouverts = visibles(dessin).filter(traitOuvert);
  if (!ouverts.length) return null;
  return {
    // Bloquant, comme le constat « trait » qu'il precise pour ces formes : l'export de decoupe ne garde que des fonds.
    // « Écrire au stylo » range ces formes parmi celles a ecrire (ADR-0028) : le reste du dessin garde la lame.
    code: 'decoupe-trait-ouvert', gravite: 'bloquant', formes: ids(ouverts), corrections: ['contour-en-forme', 'ecrire'],
    message: (ouverts.length > 1 ? t('Un trait ouvert ne se découpe pas : {formes} n’ont que des lignes. Transformez le contour en forme, ou écrivez-les au stylo.', { formes: pluriel(ouverts.length, 'forme') }) : t('Un trait ouvert ne se découpe pas : {formes} n’est qu’une ligne. Transformez le contour en forme, ou écrivez-la au stylo.', { formes: pluriel(ouverts.length, 'forme') }))
  };
}

/** Le procede « Decoupe » : un trait ouvert (ou un texte a trait unique) ne se decoupe pas ; des lettres qui se chevauchent se soudent. */
export function constatsDecoupeTexte(dessin: DessinSvg): ConstatTexte[] {
  const r: ConstatTexte[] = [];
  const ouverts = constatTraitsOuverts(dessin);
  if (ouverts) r.push(ouverts);
  const chevauchent = textesQuiSeChevauchent(dessin);
  if (chevauchent.length) {
    r.push({
      code: 'lettres-chevauchent', gravite: 'a-corriger', formes: ids(chevauchent), corrections: ['souder'],
      message: t('Les lettres se chevauchent : soudez-les pour une découpe d’un seul tenant.')
    });
  }
  return r;
}

export type ResultatCorrectionTexte = { readonly dessin: DessinSvg; readonly phrase: string } | { readonly erreur: string };

const RIEN = (): string => t('Rien à corriger : le dessin a changé depuis le constat.');

/**
 * Applique une correction qui ne demande que le dessin (« Police a trait unique » demande une fonte : l'interface la
 * compose, puis pose le texte). `largeur` est celle du stylo, en unites du plan. Pur ; le meme dessin rendu par l'erreur.
 */
export function corrigerTexte(dessin: DessinSvg, code: Exclude<CodeCorrectionTexte, 'police-trait' | 'contour-en-forme' | 'ecrire'>, formes: readonly string[], largeur: number): ResultatCorrectionTexte {
  const voulus = new Set(formes);
  if (code === 'garder-contour') {
    let n = 0;
    const d = dessin.formes.map(f => {
      if (!voulus.has(f.id) || f.remplissage === null || f.verrouille) return f;
      n++;
      // Le pourtour en trait, sans fond : un texte devient ses contours (une lettre creuse n'est plus un texte qu'on retape).
      const { opaciteRemplissage: _o, ...reste } = sansTexte(f);
      void _o;
      return { ...reste, remplissage: null, contour: f.remplissage, epaisseur: largeur };
    });
    return n ? { dessin: { ...dessin, formes: d }, phrase: (n > 1 ? t('{formes} dessinées par leur pourtour, sans fond.', { formes: pluriel(n, 'forme') }) : t('{formes} dessinée par son pourtour, sans fond.', { formes: pluriel(n, 'forme') })) } : { erreur: RIEN() };
  }
  if (code === 'hachurer') {
    const r = hachurerFormes(dessin, formes, largeur);
    return r.hachurees ? { dessin: r.dessin, phrase: (r.hachurees > 1 ? t('{formes} hachurées à la largeur du stylo : le stylo les remplit de lignes.', { formes: pluriel(r.hachurees, 'forme') }) : t('{formes} hachurée à la largeur du stylo : le stylo les remplit de lignes.', { formes: pluriel(r.hachurees, 'forme') })) } : { erreur: r.erreur ?? RIEN() };
  }
  const r = vectoriserTextes(dessin, formes, 'souder-touchantes', { lisser: true });
  return r.textes ? { dessin: r.dessin, phrase: (r.textes > 1 ? t('{textes} soudés : les lettres qui se touchent ne font qu’une forme, d’un seul tenant.', { textes: pluriel(r.textes, 'texte') }) : t('{textes} soudé : les lettres qui se touchent ne font qu’une forme, d’un seul tenant.', { textes: pluriel(r.textes, 'texte') })) } : { erreur: RIEN() };
}

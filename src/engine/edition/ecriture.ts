// L'ecriture d'un dessin en SVG : le seul endroit ou un octet sort, donc celui qui doit rester
// identique d'une version a l'autre.

import { echapperAttribut } from '../../util/xml.js';
import type { DessinSvg, Forme } from './types.js';
import { ecrireChemin, nb } from './chemins.js';
import { attributsTrait } from './trait.js';
import { opaciteDuContour, opaciteDuRemplissage } from './opacites.js';
import { attributOrigine, metadonnees } from './provenance.js';
import { attributsLien, attributsTexte } from './texteVivant.js';
import { attributOperation } from './operation.js';
import { estPlat } from './arbre.js';
import { ecrireDessinRiche, type EcrivainFeuilles } from './ecritureRiche.js';

// L'ecriture d'une forme ne depend que d'elle et de la precision, et une forme ne change jamais (chaque
// operation en rend une nouvelle) : on garde son texte, par precision. Sans cela, mesurer le poids du
// dessin a chaque modification, ou sauver le brouillon, reecrivait les cinq mille formes d'une
// vectorisation pour une seule qui avait bouge. Le texte rendu est le meme octet pour octet.
const cacheEcriture = new WeakMap<Forme, string[]>();

export function ecrireForme(f: Forme, precision = 2): string {
  if (!Number.isInteger(precision) || precision < 0 || precision > 9) return composerForme(f, precision);
  let textes = cacheEcriture.get(f);
  if (!textes) { textes = []; cacheEcriture.set(f, textes); }
  let s = textes[precision];
  if (s === undefined) { s = composerForme(f, precision); textes[precision] = s; }
  return s;
}

function composerForme(f: Forme, precision: number): string {
  let s = '<path d="' + ecrireChemin(f.d, precision) + '" fill="' + echapperAttribut(f.remplissage ?? 'none') + '"';
  if (f.regle === 'evenodd') s += ' fill-rule="evenodd"';
  // Les opacites propres ne s'ecrivent que lorsqu'elles changent quelque chose : une forme sans alpha reste
  // ecrite comme avant. Sans contour, le fond et la forme ne font qu'un : tout va dans `opacity`, qui est
  // aussi ce que la lecture en fait, donc une relecture reecrit les memes octets.
  let opacite = f.opacite;
  if (f.contour) {
    if (f.remplissage && opaciteDuRemplissage(f) < 1) s += ' fill-opacity="' + nb(opaciteDuRemplissage(f), 3) + '"';
    s += ' stroke="' + echapperAttribut(f.contour) + '" stroke-width="' + nb(f.epaisseur, 3) + '"' + attributsTrait(f).map(([k, v]) => ' ' + k + '="' + v + '"').join('');
    if (opaciteDuContour(f) < 1) s += ' stroke-opacity="' + nb(opaciteDuContour(f), 3) + '"';
  } else if (f.remplissage) opacite = Math.round(opacite * opaciteDuRemplissage(f) * 1000) / 1000;
  if (opacite < 1) s += ' opacity="' + nb(opacite, 3) + '"';
  // En dernier, et seulement pour une forme creditee ou un texte vivant : toute autre s'ecrit comme avant (provenance.ts, texteVivant.ts).
  return s + attributOrigine(f) + attributsTexte(f) + '/>';
}

/**
 * L'ecriture d'une forme, avec le lien d'un texte pose vers sa forme (ADR-0031) ajoute a la fin : il depend de la place de la forme
 * parmi les chemins ecrits, il ne se garde donc pas avec le texte de la forme. Sans texte pose, l'ecriture de toujours.
 */
function lienDesTextes(dessin: DessinSvg, visibles: readonly Forme[], precision: number): (f: Forme) => string {
  if (!visibles.some(f => f.texte?.disposition)) return f => ecrireForme(f, precision);
  const formes = new Map(dessin.formes.map(f => [f.id, f])), rangs = new Map(visibles.map((f, i) => [f.id, i + 1]));
  return f => {
    const e = ecrireForme(f, precision), l = f.texte?.disposition ? attributsLien(f, formes, rangs, precision) : '';
    return l ? e.slice(0, -2) + l + '/>' : e;
  };
}

/** Une forme ecrite, et son operation en dernier attribut quand elle en porte une (ADR-0028). */
const avecOperation = (f: Forme, ecrite: string): string => (f.operation ? ecrite.slice(0, -2) + attributOperation(f) + '/>' : ecrite);

/**
 * Le SVG du dessin. Les formes masquees ne s'ecrivent pas : masquer, a l'enregistrement, c'est retirer. Quand une forme
 * ecrite vient d'une source creditee (CC BY 3.0), un <metadata> d'attribution ouvre le SVG : sans forme creditee,
 * rien de plus n'est ecrit.
 *
 * `operations` (ADR-0028) n'est vrai que pour le document d'un contexte de production : l'operation qu'une forme porte s'y ecrit
 * (`data-ed-operation`). Partout ailleurs (exports, telechargements, Generique), elle ne s'ecrit jamais, meme presente dans le
 * modele : c'est l'appelant qui decide, apres avoir retire ce qui vaut le defaut (`operationsAEcrire`).
 */
export function ecrireDessin(dessin: DessinSvg, precision = 2, operations = false): string {
  // Le modele v2 (ADR-0012, annexe 2 §3) : un dessin qui n'est pas plat s'ecrit a part, sans une ligne commune avec ce qui suit.
  if (!estPlat(dessin)) return ecrireDessinRiche(dessin, precision, ecrivainRiche(precision, operations));
  const [x, y, l, h] = dessin.vb;
  const visibles = dessin.formes.filter(f => f.visible);
  const lien = lienDesTextes(dessin, visibles, precision);
  const corps = visibles.map(f => { const e = lien(f); return operations ? avecOperation(f, e) : e; }).join('');
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + [x, y, l, h].map(v => nb(v, 3)).join(' ') + '" width="' + nb(l, 3) + '" height="' + nb(h, 3) + '">' + metadonnees(visibles) + corps + '</svg>';
}

/** Ce que l'ecriture riche emprunte a celle-ci : une feuille ecrite comme ici (cache, lien des textes poses, operation). */
const ecrivainRiche = (precision: number, operations: boolean): EcrivainFeuilles => (dessin, ecrites) => {
  const lien = lienDesTextes(dessin, ecrites, precision);
  return f => { const e = lien(f); return operations ? avecOperation(f, e) : e; };
};

export interface Statistiques { formes: number; points: number; octets: number }

export function statistiques(dessin: DessinSvg): Statistiques {
  const visibles = dessin.formes.filter(f => f.visible);
  return { formes: visibles.length, points: visibles.reduce((n, f) => n + f.d.filter(c => c.c !== 'Z').length, 0), octets: ecrireDessin(dessin).length };
}

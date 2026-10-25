// L'ecriture du SVG est figee octet pour octet (CLAUDE.md : « un SVG reecrit aujourd'hui doit l'etre
// a l'identique demain »). Chaque cas lit un SVG de tests/fixtures/svg/<cas>.svg, lui applique une
// operation du moteur, l'ecrit comme l'application (precision 3, puis nettoyerSvg, le chemin de
// « Enregistrer ») et compare au fichier <cas>.attendu.svg. Un ecart n'est jamais une correction
// discrete : c'est un evenement de version majeure.
//
// Reecrire les references apres un changement voulu (et annonce comme tel dans CHANGELOG.md) :
//
//   ACTUALISER_REFERENCES=1 npx vitest run tests/unit/engine/ecriture-stable.test.ts
//
// Cela reecrit les <cas>.attendu.svg et bibliotheque.empreintes.txt a partir du code courant ; relire
// ensuite le diff git, fichier par fichier, avant de le committer : c'est lui, la revue de l'ecart.

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type PolicesTexte, aligner, ajusterPlan, arrondirFormes, casserForme, combiner, convertirNoeudForme, inverserSens, joindreExtremites, deplacer, ecrireDessin, fusionnerCouleursProches, lireDessin, marquerProduction, modifier, redimensionner, remplacerCouleurSur, retourner, separer, simplifier, tourner, type DessinSvg
} from '../../../src/engine/editionSvg.js';
import { marqueDeChoix, resoudreProfil, type ProfilProduction } from '../../../src/engine/preparation.js';
import { svgCricut } from '../../../src/export/cricut.js';
import { printThenCut } from '../../../src/export/printThenCut.js';
import { CHOIX_CRICUT_DEFAUT, type ChoixMachine } from '../../../src/model/contextes.js';
import { appliquerBooleen, type Booleen, type OptionsBooleen } from '../../../src/engine/booleens.js';
import { decalerFormes, etendreTraits } from '../../../src/engine/contours.js';
import { appliquerPalette, PALETTES, uneCouleur } from '../../../src/engine/palettes.js';
import { ajouterTexte, composer, type Glyphes } from '../../../src/engine/texte.js';
import { incliner, mettreALEchelle, tournerAutour } from '../../../src/engine/transformations.js';
import { svgDecoupe } from '../../../src/export/svgs.js';
import { construireBibliotheque, type IconeSource } from '../../../src/model/bibliotheque.js';
import { au } from '../../../src/util/tableaux.js';
import { nettoyerSvg } from '../../../src/util/svg.js';

const DOSSIER = resolve(__dirname, '../../fixtures/svg');
const ACTUALISER = process.env.ACTUALISER_REFERENCES === '1';
const COMMANDE = 'ACTUALISER_REFERENCES=1 npx vitest run tests/unit/engine/ecriture-stable.test.ts';

// Les fichiers se lisent en LF quoi qu'en ait fait le depot sous Windows (autocrlf) : l'ecriture, elle, est en LF.
const lireFichier = (nom: string): string => readFileSync(resolve(DOSSIER, nom), 'utf8').replace(/\r\n/g, '\n');

const lire = (svg: string): DessinSvg => {
  const r = lireDessin(svg);
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};

/** L'ecriture de « Enregistrer » (EditeurSvg.enregistrerTout) : precision 3, puis le nettoyage. */
const ecrireEnregistre = (d: DessinSvg): string => nettoyerSvg(ecrireDessin(d, 3))?.svg ?? '';

/** Le message d'un ecart : il dit ce que cet ecart signifie avant de montrer la difference. */
const ecart = (quoi: string): string =>
  'ECRITURE CHANGEE (' + quoi + ') : un SVG reecrit aujourd hui doit l etre a l identique demain. '
  + 'Tout changement d un octet ecrit est un evenement de VERSION MAJEURE, jamais une correction discrete. '
  + 'Si le changement est voulu : l annoncer comme tel dans CHANGELOG.md, puis actualiser les references (' + COMMANDE + ').';

// ---------------------------------------------------------------- les cas

// Une fonte factice : des glyphes pour toutes les lettres (carre a bord quadratique ou cubique selon la
// parite du code), avance et crenage deterministes. Aucune vraie fonte : la reference ne depend d'aucun fichier tiers.
const glyphesFactices: Glyphes = {
  unitesParEm: 1000,
  contour: (c, x, y, t) => {
    const k = t / 1000, l = 600 * k, h = 700 * k;
    if (c === '.') return [{ type: 'M', x, y }, { type: 'Z' }];
    if (c.charCodeAt(0) % 2 === 0) return [{ type: 'M', x, y }, { type: 'Q', x1: x + l / 2, y1: y - h * 1.3, x: x + l, y }, { type: 'L', x: x + l, y: y - h }, { type: 'L', x, y: y - h }, { type: 'Z' }];
    return [{ type: 'M', x, y }, { type: 'C', x1: x + l * 0.2, y1: y - h * 1.1, x2: x + l * 0.8, y2: y - h * 0.9, x: x + l, y: y - h }, { type: 'L', x, y: y - h }, { type: 'Z' }];
  },
  avance: c => 300 + (c.charCodeAt(0) % 5) * 80,
  crenage: (a, b) => (a === 'A' && b === 'V' ? -85 : a === 'E' && b === '1' ? 33 : 0)
};

// La meme fonte factice, a la maniere d'opentype.js 2.0 : aucun Z, chaque contour retombe sur son depart
// (par un segment droit pour les codes pairs, par une courbe quadratique pour les autres).
const glyphesSansZ: Glyphes = {
  ...glyphesFactices,
  contour: (c, x, y, t) => {
    const k = t / 1000, l = 600 * k, h = 700 * k;
    if (c.charCodeAt(0) % 2 === 0) return [{ type: 'M', x, y }, { type: 'L', x: x + l, y }, { type: 'L', x: x + l, y: y - h }, { type: 'L', x, y }];
    return [{ type: 'M', x, y }, { type: 'L', x: x + l, y }, { type: 'Q', x1: x + l / 2, y1: y - h, x, y }];
  }
};

// La meme fonte factice, avec une ligature « fi » : une glyphe plus large, a l'avance propre, crenee avec la lettre qui suit.
const glyphesLiees: Glyphes = {
  ...glyphesFactices,
  contour: (c, x, y, t) => {
    if (c !== 'fi') return glyphesFactices.contour(c, x, y, t);
    const k = t / 1000, l = 900 * k, h = 700 * k;
    return [{ type: 'M', x, y }, { type: 'L', x: x + l, y }, { type: 'L', x: x + l, y: y - h }, { type: 'L', x: x + l * 0.6, y: y - h * 1.3 }, { type: 'L', x, y: y - h }, { type: 'Z' }];
  },
  avance: c => (c === 'fi' ? 950 : glyphesFactices.avance(c)),
  crenage: (a, b) => (a === 'fi' && b === 'A' ? -40 : glyphesFactices.crenage(a, b)),
  ligature: (cars, i) => (cars[i] === 'f' && cars[i + 1] === 'i' ? 2 : 0)
};

// Le texte d'un SVG lu en lettres (ADR-0020) : neuf fontes factices, une par fonte embarquee, que la hauteur et l'avance de leurs
// glyphes distinguent. Un remplacement qui changerait de fonte changerait donc les octets ecrits.
const IDS_POLICES = ['inter', 'inter-gras', 'oswald', 'bebas', 'playfair', 'lobster', 'pacifico', 'caveat', 'fredoka'];
const policesFactices: PolicesTexte = {
  glyphes: id => {
    const rang = IDS_POLICES.indexOf(id);
    if (rang < 0) return null;
    return {
      ...glyphesFactices,
      contour: (c, x, y, t) => (c === ' ' ? [] : glyphesFactices.contour(c, x, y, t * (1 + rang / 10))),
      avance: c => glyphesFactices.avance(c) + rang * 20
    };
  }
};
const lireTexteSvg = (svg: string): DessinSvg => {
  const r = lireDessin(svg, { polices: policesFactices });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};

const booleen = (ids: string[], op: Booleen, options: OptionsBooleen = {}) => (d: DessinSvg): DessinSvg => {
  const r = appliquerBooleen(d, ids, op, undefined, options);
  if (r.erreur) throw new Error(r.erreur);
  return r.dessin;
};

/** Une operation de l'editeur qui peut refuser : son refus fait echouer le cas plutot que de figer un message dans une reference. */
const sansRefus = <T extends { erreur?: string }>(r: T): T => { if (r.erreur) throw new Error(r.erreur); return r; };
const noeud = (id: string, i: number, type: Parameters<typeof convertirNoeudForme>[3]) => (d: DessinSvg): DessinSvg => {
  const r = convertirNoeudForme(d, id, i, type);
  if ('erreur' in r) throw new Error(r.erreur);
  return r;
};
const casser = (id: string, i: number) => (d: DessinSvg): DessinSvg => {
  const r = casserForme(d, id, i);
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};

const palette = (id: string) => au(PALETTES.filter(p => p.id === id), 0).couleurs;

/** Le profil Cricut par defaut (Maker, tapis 12 x 12, papier cartonne), avec des choix en plus. */
const profilCricut = (choix: Partial<ChoixMachine> = {}): ProfilProduction => {
  const p = resoudreProfil({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT, ...choix });
  if (!p) throw new Error('profil Cricut introuvable');
  return p;
};
const pourCricut = (choix: Partial<ChoixMachine>) => (t: string): string => { const r = svgCricut(lire(t), profilCricut(choix)); return 'erreur' in r ? 'REFUSE : ' + r.erreur : r.svg; };
const pourPrintThenCut = (fichier: 'impression' | 'coupe') => (t: string): string => {
  const r = printThenCut(lire(t), profilCricut({ procede: 'imprimer-decouper' }));
  return 'erreur' in r ? 'REFUSE : ' + r.erreur : r[fichier];
};

const enchainer = (...ops: Array<(d: DessinSvg) => DessinSvg>) => (d: DessinSvg): DessinSvg => ops.reduce((x, op) => op(x), d);

interface Cas {
  nom: string;
  /** Le fichier d'entree, quand plusieurs cas partent du meme SVG. */
  entree?: string;
  operation?: (d: DessinSvg) => DessinSvg;
  /** Remplace tout le circuit lecture, operation, ecriture : pour une ecriture autre que « Enregistrer ». */
  produire?: (texte: string) => string;
}

const CAS: readonly Cas[] = [
  { nom: 'chemins' },
  { nom: 'arcs' },
  { nom: 'transformations' },
  { nom: 'elements' },
  { nom: 'evenodd-opacite' },
  { nom: 'peintures' },
  // Alpha des couleurs, epaisseur nulle, noms CSS : trois defauts de lecture corriges en version majeure (ils
  // deplacaient ou perdaient un octet ecrit). Ce cas montre l'ecriture juste.
  { nom: 'fidelite-lecture' },
  // Deuxieme lot de fidelite de lecture (version majeure) : la peinture de la balise racine se transmet (icones de
  // type Feather), currentColor suit la couleur courante, et le trait garde ses pointilles, bouts et jonctions.
  { nom: 'icone-feather' },
  { nom: 'racine-heritage' },
  { nom: 'trait-pointilles' },
  // L'echelle emporte l'epaisseur ET les longueurs des pointilles ; la limite de pointe, un rapport, ne bouge pas.
  {
    nom: 'trait-echelle',
    entree: 'trait-pointilles',
    operation: enchainer(d => redimensionner(d, ['f1', 'f2', 'f3'], { x: 5, y: 5, l: 40, h: 20 }), d => mettreALEchelle(d, ['f4', 'f8'], 0.5, 0.5), d => tournerAutour(d, ['f5'], 30))
  },
  { nom: 'trait-booleens', operation: booleen(['f1', 'f2'], 'union') },
  // La decoupe n'est que des contours pleins : elle laisse les pointilles de cote.
  { nom: 'trait-decoupe', entree: 'trait-pointilles', produire: t => svgDecoupe(lire(t), '#0000ff', 0.1) },
  // Troisieme lot de lecture (version majeure, ADR-0009) : les clones <use> se depliant en formes independantes (planche
  // d'icones, clones emboites et transformes, symboles a viewBox, cible introuvable) et la feuille <style> lue avec ses
  // vrais selecteurs. Des cas NEUFS : aucune reference d'avant n'en depend.
  { nom: 'lecture-use-sprite' },
  { nom: 'lecture-use-imbriques' },
  { nom: 'lecture-use-symbole' },
  { nom: 'lecture-use-introuvable' },
  { nom: 'lecture-css-selecteurs' },
  { nom: 'plan-decale' },
  { nom: 'plan-dimensions' },
  // Masquer a l'enregistrement, c'est retirer ; verrouiller ne change rien a l'ecriture.
  { nom: 'masquees-verrouillees', operation: enchainer(d => modifier(d, ['f2'], { visible: false }), d => modifier(d, ['f3'], { verrouille: true })) },
  { nom: 'booleens-union', entree: 'booleens', operation: booleen(['f1', 'f2', 'f3'], 'union') },
  { nom: 'booleens-soustraction', entree: 'booleens', operation: booleen(['f1', 'f2'], 'soustraction') },
  { nom: 'booleens-intersection', entree: 'booleens', operation: booleen(['f1', 'f2'], 'intersection') },
  { nom: 'booleens-exclusion', entree: 'booleens', operation: booleen(['f1', 'f2'], 'exclusion') },
  // Les arcs du resultat rebatis en cubiques (option `lisser`) : un nouveau cas, les quatre precedents n'en dependent pas.
  { nom: 'booleens-union-lisse', entree: 'booleens', operation: booleen(['f1', 'f2', 'f3'], 'union', { lisser: true }) },
  // La simplification des trace : les sommets alignes partent, les courbes et les formes verrouillees restent.
  { nom: 'simplification', operation: enchainer(d => modifier(d, ['f4'], { verrouille: true }), d => simplifier(d, ['f1', 'f2', 'f3', 'f4'], 0.05).dessin) },
  {
    nom: 'texte-par-lettre',
    operation: enchainer(
      d => ajouterTexte(d, composer('AVE 12\nBa.o', glyphesFactices, { taille: 36, x: 12.5, y: 40, interlettrage: 0.05, interligne: 1.1 }), { remplissage: '#15181d', contour: null, epaisseur: 1 }).dessin,
      d => ajouterTexte(d, composer('Ok', glyphesFactices, { taille: 20, x: 100, y: 90 }), { remplissage: null, contour: '#b3202c', epaisseur: 1.5 }).dessin
    )
  },
  // Les contours que opentype.js 2.0 rend sans Z (ils finissent sur leur depart) sont fermes a la conversion :
  // un trait y fait une jointure. Ajoute avec la fermeture des contours de glyphe (version majeure).
  {
    nom: 'texte-contours-ouverts',
    entree: 'texte-par-lettre',
    operation: d => ajouterTexte(d, composer('Abc', glyphesSansZ, { taille: 30, x: 10, y: 50 }), { remplissage: null, contour: '#15181d', epaisseur: 2 }).dessin
  },
  // Les ligatures (troisieme lot de lecture, version majeure) : « fi » ne fait qu'une forme, a l'avance de la glyphe de
  // ligature. Cas neuf : le moteur ne lie rien par defaut, donc « texte-par-lettre » n'a pas bouge.
  {
    nom: 'texte-ligatures',
    entree: 'texte-par-lettre',
    operation: d => ajouterTexte(d, composer('fi AfiA fifi.', glyphesLiees, { taille: 30, x: 10, y: 60, ligatures: true }), { remplissage: '#15181d', contour: null, epaisseur: 1 }).dessin
  },
  // Le texte d'un SVG lu en lettres (ADR-0020, version majeure pour un SVG AVEC texte) : <text> et <tspan>, listes de positions,
  // rotate, text-anchor, familles remplacees, gras, italique synthetique, interlettrage, blancs ramenes, <a> en ligne, <textPath>
  // ignore. Des cas NEUFS : un SVG sans texte se lit comme avant, et sans polices un <text> reste refuse.
  { nom: 'texte-svg', produire: t => ecrireEnregistre(lireTexteSvg(t)) },
  { nom: 'texte-svg-blancs', produire: t => ecrireEnregistre(lireTexteSvg(t)) },
  { nom: 'palette-evenement', entree: 'palette', operation: d => appliquerPalette(d, palette('noel')) },
  { nom: 'palette-une-couleur', entree: 'palette', operation: d => uneCouleur(d, '#7b2d8e') },
  {
    nom: 'operations-aligner',
    entree: 'operations',
    operation: enchainer(d => aligner(d, ['f1', 'f2', 'f3'], 'gauche'), d => aligner(d, ['f2', 'f4'], 'centreV'), d => aligner(d, ['f3'], 'bas'), d => aligner(d, ['f1'], 'centreH'))
  },
  {
    nom: 'operations-retourner-tourner',
    entree: 'operations',
    operation: enchainer(d => retourner(d, ['f1', 'f2'], 'h'), d => retourner(d, ['f3'], 'v'), d => tourner(d, ['f2', 'f4'], 30))
  },
  {
    nom: 'operations-redimensionner',
    entree: 'operations',
    operation: enchainer(d => redimensionner(d, ['f1', 'f2'], { x: 5, y: 5, l: 70, h: 50 }), d => deplacer(d, ['f3'], 3.14159, -2.71828))
  },
  {
    nom: 'operations-transformations-numeriques',
    entree: 'operations',
    operation: enchainer(d => tournerAutour(d, ['f1', 'f4'], 17), d => incliner(d, ['f2'], 20, 5), d => mettreALEchelle(d, ['f3'], 1.5, 0.75))
  },
  {
    nom: 'combiner-separer',
    entree: 'operations',
    operation: d => {
      const c = combiner(d, ['f1', 'f4']);
      return c.id ? separer(c.dessin, c.id).dessin : c.dessin;
    }
  },
  // La provenance (CC BY 3.0 des formes de game-icons.net, version majeure pour un dessin qui en porte) : une forme creditee
  // s'ecrit avec `data-origine`, et le SVG s'ouvre sur un <metadata> d'attribution. Des cas NEUFS : sans origine, aucun octet
  // ne change (les 26 references d'avant et les empreintes de la bibliotheque le prouvent). L'entree melange formes creditees,
  // une origine en double et une origine inconnue (ecartee), et une forme sans origine.
  { nom: 'provenance-ecriture', entree: 'provenance' },
  { nom: 'provenance-combiner', entree: 'provenance', operation: d => combiner(d, ['f1', 'f3']).dessin },
  { nom: 'provenance-union', entree: 'provenance', operation: booleen(['f1', 'f2'], 'union') },
  { nom: 'provenance-masquee', entree: 'provenance', operation: enchainer(d => modifier(d, ['f1', 'f2', 'f4'], { visible: false })) },
  { nom: 'provenance-decoupe', entree: 'provenance', produire: t => svgDecoupe(lire(t), '#0000ff', 0.1) },
  // Les calques par couleur : recolorer sur le fond ou le trait, fusionner les nuances (une forme verrouillee garde sa couleur).
  { nom: 'couleurs-recolorer-fond', entree: 'couleurs-calques', operation: d => remplacerCouleurSur(d, '#c81e28', '#7b2d8e', 'remplissage') },
  { nom: 'couleurs-recolorer-trait', entree: 'couleurs-calques', operation: d => remplacerCouleurSur(d, '#c81e28', '#7b2d8e', 'contour') },
  { nom: 'couleurs-fusion-proches', entree: 'couleurs-calques', operation: enchainer(d => modifier(d, ['f4'], { verrouille: true }), d => fusionnerCouleursProches(d, 0.03).dessin) },
  { nom: 'ajuster-plan', entree: 'plan-decale', operation: d => ajusterPlan(d) },
  // Le plan ajuste compte la pointe d'une jonction aigue et les coins d'un bout carre, pas seulement la demi-epaisseur.
  { nom: 'ajuster-plan-traits', operation: d => ajusterPlan(d) },
  { nom: 'export-decoupe', entree: 'elements', produire: t => svgDecoupe(lire(t), '#0000ff', 0.1) },
  // Les outils de trace (contour en forme, decalage, angles arrondis, nœuds, jonctions) : des cas NEUFS, aucune reference
  // d'avant n'en depend. Un changement ici est un changement de geometrie ecrite : version majeure.
  { nom: 'contour-etendre', operation: d => sansRefus(etendreTraits(d, ['f1', 'f2', 'f3', 'f5'], { lisser: true })).dessin },
  { nom: 'contour-etendre-droit', entree: 'contour-etendre', operation: d => sansRefus(etendreTraits(d, ['f2'])).dessin },
  { nom: 'contour-etendre-tirets', entree: 'contour-etendre', operation: d => sansRefus(etendreTraits(d, ['f4'], { separer: true })).dessin },
  { nom: 'decaler-exterieur', entree: 'decaler', operation: d => sansRefus(decalerFormes(d, ['f1', 'f2', 'f3'], 5, 'round', { lisser: true })).dessin },
  { nom: 'decaler-pointe', entree: 'decaler', operation: d => sansRefus(decalerFormes(d, ['f1', 'f3'], 4, 'miter')).dessin },
  { nom: 'decaler-interieur', entree: 'decaler', operation: d => sansRefus(decalerFormes(d, ['f1', 'f2', 'f3'], -4, 'miter', { lisser: true })).dessin },
  { nom: 'decaler-ouvert', entree: 'decaler', operation: d => sansRefus(decalerFormes(d, ['f4'], 6, 'round', { lisser: true })).dessin },
  { nom: 'arrondir-angles', entree: 'arrondi', operation: d => arrondirFormes(d, ['f1', 'f2', 'f3', 'f4'], 6).dessin },
  { nom: 'arrondir-angles-reduits', entree: 'arrondi', operation: d => arrondirFormes(d, ['f1', 'f4'], 60).dessin },
  { nom: 'noeuds-convertir', entree: 'noeuds', operation: enchainer(noeud('f1', 1, 'symetrique'), noeud('f2', 1, 'lisse'), noeud('f3', 1, 'lisse')) },
  { nom: 'noeuds-angle', entree: 'noeuds', operation: noeud('f1', 1, 'angle') },
  { nom: 'jonctions-casser', entree: 'jonctions', operation: casser('f1', 2) },
  { nom: 'jonctions-joindre', entree: 'jonctions', operation: d => sansRefus(joindreExtremites(d, ['f1', 'f2'])).dessin },
  { nom: 'jonctions-fermer', entree: 'jonctions', operation: d => sansRefus(joindreExtremites(d, ['f4'])).dessin },
  { nom: 'jonctions-inverser', entree: 'jonctions', operation: d => inverserSens(d, ['f1', 'f3', 'f4']) },
  { nom: 'nettoyage-import', produire: t => nettoyerSvg(t)?.svg ?? 'REFUSE' },
  // Le contexte de production Cricut (ADR-0013) : des cas NEUFS. Sans contexte, rien ne change (toutes les references
  // ci-dessus, et les empreintes de la bibliotheque, le prouvent) ; avec, le document enregistre porte sa marque `data-ed-*`
  // sur la racine, et les exports pour la machine ont une taille physique, des fonds pleins et des octets figes.
  { nom: 'cricut-marque', entree: 'cricut', produire: t => nettoyerSvg(marquerProduction(ecrireDessin(lire(t), 3), marqueDeChoix({ contexte: 'cricut', ...CHOIX_CRICUT_DEFAUT })))?.svg ?? 'REFUSE' },
  { nom: 'cricut-export', entree: 'cricut', produire: pourCricut({}) },
  { nom: 'cricut-export-mm', entree: 'cricut', produire: pourCricut({ unite: 'mm', machine: 'explore', tapis: '12x24' }) },
  { nom: 'print-then-cut-impression', entree: 'print-then-cut', produire: pourPrintThenCut('impression') },
  { nom: 'print-then-cut-coupe', entree: 'print-then-cut', produire: pourPrintThenCut('coupe') }
];

const produire = (cas: Cas): string => {
  const texte = lireFichier((cas.entree ?? cas.nom) + '.svg');
  if (cas.produire) return cas.produire(texte);
  return ecrireEnregistre((cas.operation ?? ((d: DessinSvg) => d))(lire(texte)));
};

describe('l ecriture du SVG est figee octet pour octet', () => {
  for (const cas of CAS) {
    it('ecrit « ' + cas.nom + ' » comme sa reference', () => {
      const obtenu = produire(cas);
      const chemin = resolve(DOSSIER, cas.nom + '.attendu.svg');
      if (ACTUALISER) { writeFileSync(chemin, obtenu); return; }
      expect(existsSync(chemin), 'reference absente : ' + cas.nom + '.attendu.svg (' + COMMANDE + ')').toBe(true);
      expect(obtenu, ecart(cas.nom)).toBe(lireFichier(cas.nom + '.attendu.svg'));
    });

    if (cas.produire) continue;
    it('relu puis reecrit, « ' + cas.nom + ' » ne bouge plus d un octet', () => {
      const premier = produire(cas);
      expect(ecrireEnregistre(lire(premier)), ecart(cas.nom + ', relecture de sa propre ecriture')).toBe(premier);
    });
  }

  it('range chaque SVG d entree dans un cas, et chaque cas dans un SVG d entree', () => {
    const entrees = readdirSync(DOSSIER).filter(n => n.endsWith('.svg') && !n.endsWith('.attendu.svg')).map(n => n.slice(0, -4)).sort();
    const utilisees = [...new Set(CAS.map(c => c.entree ?? c.nom))].sort();
    expect(utilisees).toEqual(entrees);
    const noms = CAS.map(c => c.nom);
    expect(new Set(noms).size).toBe(noms.length);
    const attendus = readdirSync(DOSSIER).filter(n => n.endsWith('.attendu.svg')).map(n => n.slice(0, -'.attendu.svg'.length)).sort();
    expect(attendus).toEqual([...noms].sort());
  });
});

// ---------------------------------------------------------------- toute la bibliotheque

describe('la bibliotheque entiere s ecrit de facon stable', () => {
  const jeu = JSON.parse(readFileSync(resolve(__dirname, '../../../node_modules/@iconify-json/game-icons/icons.json'), 'utf8')) as { width: number; icons: Record<string, IconeSource> };
  const entrees = construireBibliotheque(jeu.icons, jeu.width);
  // Calcule au premier test qui en a besoin, pas a la collecte : ecrire quatre mille formes prend un moment.
  let memo: Array<{ id: string; premier: string }> | null = null;
  const ecritsDe = () => (memo ??= entrees.map(e => ({ id: e.id, premier: ecrireEnregistre(lire(e.svg)) })));
  const empreinte = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 12);
  const CHEMIN_EMPREINTES = resolve(DOSSIER, 'bibliotheque.empreintes.txt');

  it('relue puis reecrite, chaque forme redonne exactement la meme ecriture', () => {
    const bougent = ecritsDe().filter(x => ecrireEnregistre(lire(x.premier)) !== x.premier).map(x => x.id);
    expect(bougent, ecart('idempotence de la bibliotheque')).toEqual([]);
  });

  it('s ecrit comme la reference, forme par forme (empreintes sha-256)', () => {
    const ecrits = ecritsDe();
    const courant = ecrits.map(x => x.id + '\t' + empreinte(x.premier)).join('\n') + '\n';
    if (ACTUALISER) { writeFileSync(CHEMIN_EMPREINTES, courant); return; }
    expect(existsSync(CHEMIN_EMPREINTES), 'reference absente : bibliotheque.empreintes.txt (' + COMMANDE + ')').toBe(true);
    const attendu = new Map(readFileSync(CHEMIN_EMPREINTES, 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split('\t') as [string, string]));
    const differentes = ecrits.filter(x => attendu.get(x.id) !== empreinte(x.premier)).map(x => x.id);
    expect(differentes.slice(0, 20), ecart(differentes.length + ' formes de la bibliotheque, dont les 20 premieres ci-dessous')).toEqual([]);
    expect(ecrits.length, ecart('nombre de formes de la bibliotheque ; si le jeu game-icons a ete mis a jour, c est ce jeu qui a bouge')).toBe(attendu.size);
  });
});

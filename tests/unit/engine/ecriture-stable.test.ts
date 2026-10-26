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
  type PolicesTexte, type Matrice, type TexteVivant, type Chemin, type DispositionTexte, type FormeDeBase, type ParametresFormes, ajouterForme, ellipse, formeDeBase, FORMES_DE_BASE, FICHES_FORMES, PARAMETRES_FORMES_DEFAUT, regleDeForme, dupliquer, aligner, ajusterPlan, arrondirFormes, casserForme, combiner, convertirNoeudForme, inverserSens, joindreExtremites, deplacer, ecrireDessin, fusionnerCouleursProches, lireDessin, marquerProduction, modifier, redimensionner, remplacerCouleurSur, retourner, separer, simplifier, tourner, type DessinSvg, polygone,
} from '../../../src/engine/editionSvg.js';
import { marqueDeChoix, operationsAEcrire, poserOperation, resoudreProfil, type ProfilProduction } from '../../../src/engine/preparation.js';
import { exportParOperation } from '../../../src/export/operations.js';
import { svgCricut } from '../../../src/export/cricut.js';
import { printThenCut } from '../../../src/export/printThenCut.js';
import { CHOIX_CRICUT_DEFAUT, type ChoixMachine } from '../../../src/model/contextes.js';
import { appliquerBooleen, type Booleen, type OptionsBooleen } from '../../../src/engine/booleens.js';
import { decalerFormes, etendreTraits } from '../../../src/engine/contours.js';
import { appliquerPalette, PALETTES, uneCouleur } from '../../../src/engine/palettes.js';
import { ajouterTexte, composer, type Glyphes } from '../../../src/engine/texte.js';
import { cheminDuTexte, lettresDuTexte } from '../../../src/engine/texte/bloc.js';
import { creerTexte, nouveauTexte, peintureDuTexte } from '../../../src/engine/texte/vivant.js';
import { vectoriserTextes, type ModeVectorisation } from '../../../src/engine/texte/vectoriser.js';
import { composerDispose } from '../../../src/engine/texte/disposition.js';
import { incliner, mettreALEchelle, tournerAutour } from '../../../src/engine/transformations.js';
import { svgDecoupe } from '../../../src/export/svgs.js';
import { svgStylo } from '../../../src/export/stylo.js';
import { hachurerFormes } from '../../../src/engine/contour/hachures.js';
import { construireBibliotheque, type IconeSource } from '../../../src/model/bibliotheque.js';
import { au } from '../../../src/util/tableaux.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { ajouterRepere, dupliquerEnGrille, marquerReperes, repetitionRadiale, symetrie } from '../../../src/engine/editionSvg.js';
import { largeurVariable } from '../../../src/engine/contours.js';

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

// Le texte vivant (ADR-0022) : une forme par texte, ses contours composes et ses attributs `data-ed-*`. La fonte factice
// courbe ci-dessus ; une fonte a trait factice, des traces ouverts en zigzag (la course d'une plume).
const glyphesTraitFactices: Glyphes = {
  ...glyphesFactices,
  contour: (c, x, y, t) => {
    const k = t / 1000;
    return c.charCodeAt(0) % 2 === 0
      ? [{ type: 'M', x, y }, { type: 'L', x: x + 250 * k, y: y - 700 * k }, { type: 'L', x: x + 500 * k, y }]
      : [{ type: 'M', x, y: y - 700 * k }, { type: 'L', x, y }, { type: 'M', x, y: y - 350 * k }, { type: 'Q', x1: x + 500 * k, y1: y - 700 * k, x: x + 450 * k, y }];
  }
};
const POLICE_FACTICE = { id: 'inter', version: '0123456789abcd' };
const texteFactice = (texte: string, m: Matrice, reglages: Partial<TexteVivant> = {}): TexteVivant => ({ ...nouveauTexte(texte, POLICE_FACTICE, 18, m), ...reglages });
const vivant = (t: TexteVivant, peinture: Parameters<typeof creerTexte>[3], g: Glyphes = glyphesFactices) => (d: DessinSvg): DessinSvg => creerTexte(d, t, cheminDuTexte(t, g), peinture).dessin;
const FOND = peintureDuTexte('contour', { remplissage: '#15181d', contour: null, epaisseur: 1 }, 1);
const TROIS_TEXTES = enchainerTot(
  vivant(texteFactice('Joyeux Noël\nà tous', [1, 0, 0, 1, 100, 30], { alignement: 'centre', interligne: 1.4 }), FOND),
  vivant(texteFactice('url(x) javascript: @import <b>&"\'', [1, 0, 0, 1, 8, 92], { interlettrage: 0.02, taille: 9 }), peintureDuTexte('contour', { remplissage: null, contour: '#b3202c', epaisseur: 0.8 }, 1)),
  vivant(texteFactice('AVfi', [0.866025, 0.5, -0.5, 0.866025, 150, 60], { ligatures: true, alignement: 'droite' }), FOND, glyphesLiees)
);
/** Un mot aux lettres serrees (interlettrage negatif) : elles se chevauchent, de quoi souder ; le « c » de la seconde ligne reste seul. */
const MOT_SERRE = texteFactice('Abba\nc', [1, 0, 0, 1, 20, 60], { interlettrage: -0.25, taille: 30 });
const vectoriser = (mode: ModeVectorisation, avecLettres: boolean) => (d: DessinSvg): DessinSvg => {
  const avec = vivant(MOT_SERRE, FOND)(d);
  const id = au(avec.formes, avec.formes.length - 1).id;
  return vectoriserTextes(avec, [id], mode, { lisser: true, ...(avecLettres ? { lettres: new Map([[id, lettresDuTexte(MOT_SERRE, glyphesFactices).map(l => l.d)]]) } : {}) }).dessin;
};

// Le texte pose sur ou dans une forme (ADR-0031) : une forme, puis des textes poses sur elle (composes sur elle avec la fonte
// factice), la forme masquee au besoin (le texte porte alors son trace encode).
type DispositionSansForme = DispositionTexte extends infer D ? D extends DispositionTexte ? Omit<D, 'forme'> : never : never;
const posesSur = (d: Chemin, textes: ReadonlyArray<readonly [TexteVivant, DispositionSansForme]>, masquer = false, peinture: Parameters<typeof creerTexte>[3] = FOND) => (dessin: DessinSvg): DessinSvg => {
  const b = ajouterForme(dessin, d, { remplissage: '#e0b84a', contour: null, epaisseur: 1 });
  const base = b.id ? b.dessin.formes.find(f => f.id === b.id) : undefined;
  if (!base) throw new Error('forme de base');
  let r = b.dessin;
  for (const [t, p] of textes) {
    const c = composerDispose({ ...t, disposition: { ...p, forme: base.id } as DispositionTexte }, base, glyphesFactices);
    r = creerTexte(r, c.texte, c.d, peinture).dessin;
  }
  return masquer ? modifier(r, [base.id], { visible: false }) : r;
};
const COEUR: Chemin = [
  { c: 'M', p: [150, 35] }, { c: 'C', p: [150, 15, 120, 5, 110, 25] }, { c: 'C', p: [100, 45, 130, 70, 150, 90] },
  { c: 'C', p: [170, 70, 200, 45, 190, 25] }, { c: 'C', p: [180, 5, 150, 15, 150, 35] }, { c: 'Z', p: [] }
];
const SUR_FORME = enchainerTot(
  posesSur(ellipse(10, 10, 80, 80), [
    [texteFactice('Joyeux anniversaire', [1, 0, 0, 1, 0, 0], { taille: 9, alignement: 'centre' }), { mode: 'sur', depart: 0, cote: 'dessus', repartir: false }],
    [texteFactice('Lucie 2026', [1, 0, 0, 1, 0, 0], { taille: 8, alignement: 'centre', interlettrage: 0.05 }), { mode: 'sur', depart: 0, cote: 'dessous', repartir: false }]
  ]),
  posesSur([{ c: 'M', p: [110, 80] }, { c: 'Q', p: [150, 40, 195, 80] }], [
    [texteFactice('vague', [1, 0, 0, 1, 0, 0], { taille: 10, alignement: 'gauche' }), { mode: 'sur', depart: 0.125, cote: 'dessous', repartir: true }]
  ])
);
const DANS_FORME = enchainerTot(
  posesSur(COEUR, [[texteFactice('Avec tout mon amour pour toi', [1, 0, 0, 1, 0, 0], { taille: 7, alignement: 'gauche' }), { mode: 'dans', marge: 0.25, ajuster: false, justifier: true }]]),
  posesSur(ellipse(10, 10, 80, 60), [[texteFactice('Bonne\nannée', [1, 0, 0, 1, 0, 0], { alignement: 'centre' }), { mode: 'dans', marge: 0.5, ajuster: true, justifier: false }]], true)
);

// Le texte deforme dans une forme (ADR-0032) : un cas NEUF. Un cœur portant deux lignes deformees a la marge par defaut, une ellipse
// masquee portant un texte en trace median a une marge plus grande (sa forme voyage encodee), une etoile portant un mot.
const ENVELOPPE = enchainerTot(
  posesSur(COEUR, [[texteFactice('Avec tout\nmon amour', [1, 0, 0, 1, 0, 0], { taille: 7, alignement: 'centre' }), { mode: 'enveloppe', marge: 0.1 }]]),
  posesSur(ellipse(10, 5, 80, 40), [[texteFactice('Bonne année', [1, 0, 0, 1, 0, 0], { alignement: 'centre', trace: 'median' }), { mode: 'enveloppe', marge: 0.2 }]], true,
    peintureDuTexte('trait', { remplissage: '#1f4e8c', contour: null, epaisseur: 1 }, 0.8)),
  posesSur(polygone([[50, 49], [55.9, 65.9], [73.8, 66.3], [59.5, 77.1], [64.7, 94.2], [50, 84], [35.3, 94.2], [40.5, 77.1], [26.2, 66.3], [44.1, 65.9]], true),
    [[texteFactice('ÉTOILE', [1, 0, 0, 1, 0, 0], { alignement: 'centre' }), { mode: 'enveloppe', marge: 0.1 }]])
);

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

/**
 * Le profil Cricut par defaut (Maker, tapis 12 x 12, papier cartonne), en pouces, avec des choix en plus. Les references ont ete
 * ecrites en pouces avant que le millimetre devienne l'unite par defaut de l'interface : elles le restent (cricut-export-mm couvre
 * le millimetre), pour qu'un defaut d'interface ne reecrive aucune reference.
 */
const CRICUT_POUCES: ChoixMachine = { ...CHOIX_CRICUT_DEFAUT, unite: 'in' };
const profilCricut = (choix: Partial<ChoixMachine> = {}): ProfilProduction => {
  const p = resoudreProfil({ contexte: 'cricut', ...CRICUT_POUCES, ...choix });
  if (!p) throw new Error('profil Cricut introuvable');
  return p;
};
const pourCricut = (choix: Partial<ChoixMachine>) => (t: string): string => { const r = svgCricut(lire(t), profilCricut(choix)); return 'erreur' in r ? 'REFUSE : ' + r.erreur : r.svg; };
const pourPrintThenCut = (fichier: 'impression' | 'coupe') => (t: string): string => {
  const r = printThenCut(lire(t), profilCricut({ procede: 'imprimer-decouper' }));
  return 'erreur' in r ? 'REFUSE : ' + r.erreur : r[fichier];
};

/** Le cercle a contour (f4) et le carre plein (f1) passes a l'ecriture : un dessin qui mele les deux operations. */
const aEcrire = (d: DessinSvg): DessinSvg => poserOperation(d, ['f1', 'f4'], 'ecriture', 'decoupe').dessin;
/** Le document d'un contexte Cricut en decoupe, tel que l'editeur l'enregistre (zones/actionsProduction.ts, svgDocument). */
const documentCricut = (d: DessinSvg): string => marquerProduction(ecrireDessin(operationsAEcrire(d, 'decoupe'), 3, true), marqueDeChoix({ contexte: 'cricut', ...CRICUT_POUCES }));
const couperEcrire = (t: string, fichier: 'a-couper' | 'a-ecrire' | 'combine'): string => {
  const r = exportParOperation(aEcrire(lire(t)), profilCricut());
  if ('erreur' in r) return 'REFUSE : ' + r.erreur;
  if (r.genre !== 'mixte') return 'UNE SEULE OPERATION';
  return fichier === 'a-couper' ? r.aCouper : fichier === 'a-ecrire' ? r.aEcrire : r.combine;
};

const enchainer = (...ops: Array<(d: DessinSvg) => DessinSvg>) => (d: DessinSvg): DessinSvg => ops.reduce((x, op) => op(x), d);

// Les formes de base (ADR-0033) : une de chaque sorte aux reglages par defaut, puis quelques reglages, en grille de cases de
// 100 x 80, comme l'outil les pose (un trait au style d'une ligne, l'anneau en evenodd). Un cas NEUF : les rectangle, ellipse,
// etoile et ligne d'avant y passent par formeDeBase, qui rend les memes commandes que leurs fonctions (formesDeBase.test.ts).
const VARIANTES_FORMES: ReadonlyArray<readonly [FormeDeBase, Partial<ParametresFormes>]> = [
  ...FORMES_DE_BASE.map(f => [f, {}] as const),
  ['rectangle-arrondi', { rayonCoins: 40 }], ['triangle', { triangle: 'rectangle' }], ['polygone', { cotes: 8 }], ['etoile', { branches: 8, creux: 0.6 }],
  ['fleche', { pointe: 'double', sens: 'haut' }], ['croix', { bras: 0.2 }], ['anneau', { epaisseurAnneau: 0.6 }], ['demi-cercle', { portion: 'quart' }],
  ['badge', { festons: 16 }], ['spirale', { tours: 5 }]
];
const formesDeBase = (d: DessinSvg): DessinSvg => VARIANTES_FORMES.reduce((x, [forme, reglages], i) => {
  const cx = 10 + (i % 6) * 100, cy = 10 + Math.floor(i / 6) * 80;
  const style = FICHES_FORMES[forme].trait ? { remplissage: null, contour: '#15181d', epaisseur: 2 } : { remplissage: ['#c81e28', '#1428a0', '#2e7d32', '#f2a900'][i % 4] ?? null, contour: null, epaisseur: 1 };
  return ajouterForme(x, formeDeBase(forme, cx, cy, 80, 60, { ...PARAMETRES_FORMES_DEFAUT, ...reglages }), style, regleDeForme(forme)).dessin;
}, d);
function enchainerTot(...ops: Array<(d: DessinSvg) => DessinSvg>): (d: DessinSvg) => DessinSvg { return d => ops.reduce((x, op) => op(x), d); }

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
  // Sans fichier d'entree a lui (un SVG de depart de plus changerait le corpus du fuzzing, tests/unit/securite) : un plan vide de
  // 600 x 480, puis les formes.
  { nom: 'formes-de-base', entree: 'plan-dimensions', operation: d => formesDeBase({ ...d, vb: [0, 0, 600, 480], formes: [] }) },
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
  // Les sources libres de la bibliotheque (MIT, ISC, Apache 2.0) : des cas NEUFS. Leur forme garde son `data-origine`, sans
  // <metadata> (leur licence ne demande pas de mention dans le fichier) ; melangee a une forme de game-icons, la mention ne
  // nomme que game-icons, et la liste des origines les nomme toutes. La decoupe n'ecrit aucun commentaire pour elles.
  { nom: 'provenance-sources', entree: 'provenance-sources' },
  { nom: 'provenance-sources-decoupe', entree: 'provenance-sources', produire: t => svgDecoupe(lire(t), '#0000ff', 0.1) },
  { nom: 'provenance-mixte', entree: 'provenance-mixte' },
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
  { nom: 'cricut-marque', entree: 'cricut', produire: t => nettoyerSvg(marquerProduction(ecrireDessin(lire(t), 3), marqueDeChoix({ contexte: 'cricut', ...CRICUT_POUCES })))?.svg ?? 'REFUSE' },
  { nom: 'cricut-export', entree: 'cricut', produire: pourCricut({}) },
  { nom: 'cricut-export-mm', entree: 'cricut', produire: pourCricut({ unite: 'mm', machine: 'explore', tapis: '12x24' }) },
  { nom: 'print-then-cut-impression', entree: 'print-then-cut', produire: pourPrintThenCut('impression') },
  { nom: 'print-then-cut-coupe', entree: 'print-then-cut', produire: pourPrintThenCut('coupe') },
  // Le texte vivant et sa vectorisation (ADR-0022) : des cas NEUFS. Un dessin sans texte vivant n'ecrit aucun attribut de plus
  // (toutes les references ci-dessus et les empreintes de la bibliotheque le prouvent) ; un texte vivant s'ecrit en contours
  // exacts, plus ses `data-ed-*` encodes, et se relit tel quel.
  { nom: 'texte-vivant', operation: TROIS_TEXTES },
  {
    nom: 'texte-vivant-transforme',
    entree: 'texte-vivant',
    operation: enchainer(TROIS_TEXTES, d => tourner(d, ['f2'], 25), d => deplacer(d, ['f3'], -4, 6), d => redimensionner(d, ['f4'], { x: 120, y: 10, l: 60, h: 40 }), d => dupliquer(d, ['f2'], 0, 12).dessin)
  },
  { nom: 'texte-vivant-lecture' },
  { nom: 'texte-vivant-trait', entree: 'texte-vivant', operation: vivant(texteFactice('Lune et soleil', [1, 0, 0, 1, 15, 55], { taille: 24 }), peintureDuTexte('trait', { remplissage: '#1f4e8c', contour: null, epaisseur: 1 }, 0.6), glyphesTraitFactices) },
  // Le trace « Median » (ADR-0027) : un cas NEUF. Une police a contour (la fonte factice courbe) se dessine en lignes au milieu
  // du trait, sans fond, et porte `data-ed-trace="median"` ; aucun texte sans ce trace n'ecrit un octet de plus.
  { nom: 'texte-vivant-median', entree: 'texte-vivant', operation: vivant(texteFactice('Bonjour', [1, 0, 0, 1, 15, 55], { taille: 30, trace: 'median' }), peintureDuTexte('trait', { remplissage: '#1f4e8c', contour: null, epaisseur: 1 }, 1.5)) },
  // Le texte pose sur ou dans une forme (ADR-0031) : des cas NEUFS, un par mode. Un texte libre n'ecrit aucun attribut de plus (toutes
  // les references ci-dessus le prouvent) ; un texte pose s'ecrit en contours, ses lettres posees, plus sa disposition et le lien a
  // sa forme (son rang parmi les chemins ecrits, ou son trace encode quand elle est masquee), et se relit tel quel.
  { nom: 'texte-sur-forme', entree: 'texte-vivant', operation: SUR_FORME },
  { nom: 'texte-dans-forme', entree: 'texte-vivant', operation: DANS_FORME },
  // Le texte deforme dans une forme (ADR-0032) : un cas NEUF ; « dans » (en lignes) ne change pas d'un octet (la reference ci-dessus).
  { nom: 'texte-enveloppe', entree: 'texte-vivant', operation: ENVELOPPE },
  { nom: 'vectoriser-lettres', entree: 'texte-vivant', operation: vectoriser('lettres', true) },
  { nom: 'vectoriser-souder', entree: 'texte-vivant', operation: vectoriser('souder-touchantes', true) },
  { nom: 'vectoriser-tout', entree: 'texte-vivant', operation: vectoriser('tout', true) },
  { nom: 'vectoriser-parties', entree: 'texte-vivant', operation: vectoriser('lettres', false) },
  // Le stylo (ADR-0022) : des hachures a la largeur d'un stylo de 0,4 mm (1,512 unite a 96 ppp), a 45 et a 0 degre, trous
  // respectes ; et l'export du procede « Dessin au stylo » : des traits, aucun fond, une taille physique. Des cas NEUFS.
  { nom: 'hachures', entree: 'stylo', operation: enchainer(d => hachurerFormes(d, ['f1', 'f4'], 1.512).dessin, d => hachurerFormes(d, ['f2'], 1.512, 0).dessin) },
  { nom: 'stylo-export', entree: 'stylo', produire: t => svgStylo(lire(t), 'mm', 1.512).svg },
  // Couper ou ecrire (ADR-0028) : des cas NEUFS. Sans choix de la personne, aucun attribut de plus (toutes les references ci-dessus
  // le prouvent) ; en contexte Cricut, le document porte `data-ed-operation` sur une forme dont le choix differe de la regle ; et
  // l'export d'un dessin mele livre trois fichiers aux octets figes.
  { nom: 'cricut-operations', entree: 'stylo', produire: t => nettoyerSvg(documentCricut(aEcrire(lire(t))))?.svg ?? 'REFUSE' },
  ...(['a-couper', 'a-ecrire', 'combine'] as const).map((fichier): Cas => ({ nom: 'couper-ecrire-' + fichier, entree: 'stylo', produire: t => couperEcrire(t, fichier) })),
  // Les outils de l'ADR-0038 : des cas NEUFS, aucune reference reecrite. Repeter la selection (grille, radiale, symetrie) pose des
  // formes ordinaires ; arrondir un seul coin ; la largeur variable d'un trait ; et les reperes, ecrits en `data-ed-reperes` sur la
  // racine du document seulement quand il y en a (toutes les references ci-dessus, sans repere, le prouvent).
  { nom: 'repetition-grille', entree: 'arrondi', operation: d => dupliquerEnGrille(d, ['f1', 'f4'], { lignes: 2, colonnes: 3, pasX: 12.5, pasY: 15 }).dessin },
  {
    nom: 'repetition-radiale', entree: 'arrondi',
    operation: enchainer(d => repetitionRadiale(d, ['f4'], { exemplaires: 6, angle: 360, centre: [100, 60], orienter: true }).dessin, d => repetitionRadiale(d, ['f1'], { exemplaires: 3, angle: 90, centre: [50, 60], orienter: false }).dessin)
  },
  { nom: 'repetition-symetrie', entree: 'arrondi', operation: enchainer(d => symetrie(d, ['f2'], { sens: 'h', axe: 100, garder: true }).dessin, d => symetrie(d, ['f3'], { sens: 'v', axe: 60, garder: false }).dessin) },
  { nom: 'arrondir-coin', entree: 'arrondi', operation: d => arrondirFormes(d, ['f1'], 8, new Set([2])).dessin },
  { nom: 'largeur-variable', entree: 'arrondi', operation: d => largeurVariable(d, ['f2'], { debut: 1, milieu: 8, fin: 2 }).dessin },
  { nom: 'reperes-document', entree: 'arrondi', produire: t => { const d = ajouterRepere(ajouterRepere(ajouterRepere(lire(t), 'h', 60), 'h', 12.3456), 'v', 100); return nettoyerSvg(marquerReperes(ecrireDessin(d, 3), d.reperes))?.svg ?? 'REFUSE'; } }
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

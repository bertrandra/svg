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
  aligner, ajusterPlan, combiner, deplacer, ecrireDessin, fusionnerCouleursProches, lireDessin, modifier, redimensionner, remplacerCouleurSur, retourner, separer, simplifier, tourner, type DessinSvg
} from '../../../src/engine/editionSvg.js';
import { appliquerBooleen, type Booleen, type OptionsBooleen } from '../../../src/engine/booleens.js';
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

const booleen = (ids: string[], op: Booleen, options: OptionsBooleen = {}) => (d: DessinSvg): DessinSvg => {
  const r = appliquerBooleen(d, ids, op, undefined, options);
  if (r.erreur) throw new Error(r.erreur);
  return r.dessin;
};

const palette = (id: string) => au(PALETTES.filter(p => p.id === id), 0).couleurs;

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
  // Des defauts connus, ecrits tels quels : les corriger deplace un octet ecrit, donc se fait en version majeure.
  { nom: 'limites-connues' },
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
  // Les calques par couleur : recolorer sur le fond ou le trait, fusionner les nuances (une forme verrouillee garde sa couleur).
  { nom: 'couleurs-recolorer-fond', entree: 'couleurs-calques', operation: d => remplacerCouleurSur(d, '#c81e28', '#7b2d8e', 'remplissage') },
  { nom: 'couleurs-recolorer-trait', entree: 'couleurs-calques', operation: d => remplacerCouleurSur(d, '#c81e28', '#7b2d8e', 'contour') },
  { nom: 'couleurs-fusion-proches', entree: 'couleurs-calques', operation: enchainer(d => modifier(d, ['f4'], { verrouille: true }), d => fusionnerCouleursProches(d, 0.03).dessin) },
  { nom: 'ajuster-plan', entree: 'plan-decale', operation: d => ajusterPlan(d) },
  { nom: 'export-decoupe', entree: 'elements', produire: t => svgDecoupe(lire(t), '#0000ff', 0.1) },
  { nom: 'nettoyage-import', produire: t => nettoyerSvg(t)?.svg ?? 'REFUSE' }
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

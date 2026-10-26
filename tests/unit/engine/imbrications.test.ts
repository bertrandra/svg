// Les imbrications du modele v2 (ADR-0012, etape 13c) : un <svg> imbrique lu en groupe (cadre, viewBox, preserveAspectRatio, fenetre en
// decoupe), un <text> lu en groupe de lettres ou se posent sa decoupe, son masque, son filtre. Le mode plat ne change pas : un <svg>
// imbrique y reste refuse, un <text> s'y lit a plat. Les octets ecrits sont figes par les cas `v2/cas-imbrications.ts`.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  decoupes, ecrireDessin, groupes, lireDessin, masques, MSG_IMBRICATIONS, REFUS_IMBRICATIONS, verifierDessin, type DessinSvg, type Forme, type Groupe
} from '../../../src/engine/editionSvg.js';
import { lireDessinAvec } from '../../../src/engine/edition/lecture.js';
import { aplatirPour, CAPACITES_PLAT } from '../../../src/engine/aplatir.js';
import { boiteChemin } from '../../../src/engine/edition/geometrie.js';
import { etatDuProjet, projetDe, texteDuProjet, type EtatProjet } from '../../../src/engine/projet.js';
import { VERSION_PROJET, lireProjet } from '../../../src/model/projet.js';
import { nomGroupeTexte } from '../../../src/engine/texte/vectoriser.js';
import { policesFactices } from './v2/polices.js';
import { violationsEcriture, violationsNettoyage } from '../securite/invariants.js';

const SVG = (corps: string, vb = '0 0 200 100') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + corps + '</svg>';
const riche = (svg: string, polices = false): DessinSvg => {
  const r = lireDessin(svg, { modele: 'riche', ...(polices ? { polices: policesFactices } : {}) });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const ignores = (svg: string, polices = false): readonly string[] => {
  const r = lireDessin(svg, { modele: 'riche', ...(polices ? { polices: policesFactices } : {}) });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.ignores;
};
const erreur = (r: ReturnType<typeof lireDessin>): string => ('erreur' in r ? r.erreur : '');
const groupesDe = (d: DessinSvg): Groupe[] => Object.values(d.groupes ?? {});
const fichier = (nom: string): string => readFileSync(resolve(__dirname, '../../fixtures/svg/v2', nom + '.svg'), 'utf8');
const boite = (f: Forme | undefined) => (f ? boiteChemin(f.d) : null);

/** Une ecriture propre, stable au nettoyage, et qui se relit en point fixe. */
function ecritureSaine(d: DessinSvg): string {
  expect(verifierDessin(d)).toEqual([]);
  const e = ecrireDessin(d, 3);
  expect(violationsEcriture(e)).toEqual([]);
  expect(violationsNettoyage(e)).toEqual([]);
  expect(ecrireDessin(riche(e), 3)).toBe(e);
  return e;
}

describe('le mode plat ne change pas', () => {
  it('un <svg> imbrique y reste refuse avec la phrase d aujourd hui', () => {
    const svg = fichier('imbrications-svg-viewbox');
    expect(erreur(lireDessin(svg))).toBe('Ce SVG contient un SVG imbriqué : il ne s’édite pas ici. Vectorisez l’image, ou simplifiez-le dans votre logiciel.');
  });

  it('un <text> lu avec des polices y reste des lettres a plat, l opacite multipliee', () => {
    const r = lireDessin(SVG('<text x="10" y="50" font-size="20" opacity="0.5">Ab</text>'), { polices: policesFactices });
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.dessin.groupes).toBeUndefined();
    expect(r.dessin.formes.map(f => [f.parent, f.opacite])).toEqual([[undefined, 0.5], [undefined, 0.5]]);
  });

  it('sans polices, un <text> se refuse en riche avec la phrase du plat', () => {
    const svg = SVG('<text x="10" y="50">Ab</text>');
    expect(erreur(lireDessin(svg, { modele: 'riche' }))).toBe(erreur(lireDessin(svg)));
    expect(erreur(lireDessin(svg, { modele: 'riche' }))).toContain(REFUS_IMBRICATIONS.texte);
  });

  it('sans la fonctionnalite des imbrications, une prise sur un texte reste refusee en disant ou (le chemin d avant)', () => {
    const svg = SVG('<defs><clipPath id="c"><rect width="50" height="50"/></clipPath></defs><text x="10" y="50" clip-path="url(#c)">Ab</text>');
    const r = lireDessinAvec(svg, { modele: 'riche', polices: policesFactices }, [groupes, decoupes, masques]);
    expect(erreur(r)).toContain('un masque ou une découpe (posé sur un texte)');
  });
});

describe('un <svg> imbrique en mode riche', () => {
  it('devient un groupe, sa matrice cuite dans ses feuilles, sa fenetre en decoupe', () => {
    const d = riche(fichier('imbrications-svg-viewbox'));
    const [g] = groupesDe(d);
    expect(g?.decoupe?.contenu.formes).toHaveLength(1);
    expect(boite(g?.decoupe?.contenu.formes[0])).toEqual({ x: 20, y: 20, l: 100, h: 80 });
    // viewBox 0 0 50 50 dans un cadre de 100 x 80 : echelle 1,6, centre (xMidYMid meet) : le cercle de rayon 20 en (25, 25) va en (70, 60).
    expect(boite(d.formes.find(f => f.parent === g?.id))).toEqual({ x: 38, y: 28, l: 64, h: 64 });
    ecritureSaine(d);
  });

  it('les pourcentages se mesurent sur la fenetre qui l entoure (le viewBox du parent, sinon le plan)', () => {
    const d = riche(SVG('<svg x="10%" y="10%" width="50%" height="50%" viewBox="0 0 10 10" preserveAspectRatio="none"><svg x="50%" width="50%" height="50%"><rect width="5" height="5"/></svg></svg>'));
    const [ext, int] = groupesDe(d);
    expect(boite(ext?.decoupe?.contenu.formes[0])).toEqual({ x: 20, y: 10, l: 100, h: 50 });
    // Dedans, 50 % vaut 5 (le viewBox du parent), mis a l'echelle 10 en x et 5 en y.
    expect(boite(int?.decoupe?.contenu.formes[0])).toEqual({ x: 70, y: 10, l: 50, h: 25 });
    expect(int?.parent).toBe(ext?.id);
    ecritureSaine(d);
  });

  it('overflow visible ou auto : pas de fenetre ; hidden, scroll ou rien : une fenetre', () => {
    const d = riche(SVG(['visible', 'auto', 'hidden', 'scroll', ''].map(o => '<svg width="20" height="20"' + (o ? ' style="overflow:' + o + '"' : '') + '><rect width="30" height="30"/></svg>').join('')));
    expect(groupesDe(d).map(g => g.decoupe !== undefined)).toEqual([false, false, true, true, true]);
    ecritureSaine(d);
  });

  it('un cadre nul, un viewBox vide ou un <svg> cache ne dessinent rien', () => {
    const d = riche(SVG('<rect width="5" height="5"/><svg width="0" height="10"><rect width="9" height="9"/></svg><svg width="10" height="10" viewBox="0 0 10 0"><rect width="9" height="9"/></svg><svg width="10" height="10" display="none"><rect width="9" height="9"/></svg>'));
    expect(d.formes).toHaveLength(1);
    expect(d.groupes).toBeUndefined();
  });

  it('une decoupe ou un filtre poses sur lui gardent leur groupe, la fenetre passe dedans, et c est dit', () => {
    const svg = fichier('imbrications-svg-prises');
    const d = riche(svg);
    const [rond, fenetre1, flou, fenetre2] = groupesDe(d);
    expect(rond?.decoupe && !rond.parent).toBeTruthy();
    expect(fenetre1?.parent).toBe(rond?.id);
    expect(boite(fenetre1?.decoupe?.contenu.formes[0])).toEqual({ x: 20, y: 20, l: 100, h: 80 });
    expect(flou?.effets?.flou).toBeDefined();
    expect(fenetre2?.parent).toBe(flou?.id);
    expect(ignores(svg)).toContain(MSG_IMBRICATIONS.prises);
    ecritureSaine(d);
  });

  it('un <use> vers un <svg> lui donne sa largeur et sa hauteur', () => {
    const d = riche(fichier('imbrications-svg-use'));
    const fenetres = groupesDe(d).map(g => boite(g.decoupe?.contenu.formes[0]));
    expect(fenetres).toEqual([{ x: 10, y: 10, l: 40, h: 40 }, { x: 70, y: 10, l: 100, h: 60 }, { x: 10, y: 75, l: 40, h: 40 }]);
  });

  it('un identifiant par feuille et par groupe, fenetres comprises (I1)', () => {
    for (const nom of ['imbrications-svg-aspect', 'imbrications-svg-emboites', 'imbrications-svg-prises', 'imbrications-svg-use']) {
      const d = riche(fichier(nom));
      const ids = [...d.formes.map(f => f.id), ...groupesDe(d).flatMap(g => [g.id, ...(g.decoupe?.contenu.formes.map(f => f.id) ?? [])])];
      expect(new Set(ids).size, nom).toBe(ids.length);
      expect(verifierDessin(d), nom).toEqual([]);
    }
  });

  it('une longueur en unite physique est refusee en le nommant', () => {
    expect(erreur(lireDessin(SVG('<svg width="10mm" height="10"><rect width="5" height="5"/></svg>'), { modele: 'riche' }))).toContain(REFUS_IMBRICATIONS.longueur);
  });

  it('le projet JSON fait l aller-retour exact et reecrit le meme SVG', () => {
    for (const nom of ['imbrications-svg-prises', 'imbrications-svg-emboites']) allerRetour(riche(fichier(nom)));
  });

  it('descendu a plat, la fenetre rogne les remplissages', () => {
    const d = riche(fichier('imbrications-svg-viewbox'));
    const plat = aplatirPour(d, CAPACITES_PLAT).dessin;
    expect(plat.groupes).toBeUndefined();
    for (const f of plat.formes.filter(x => x.remplissage === '#c81e28')) expect(boite(f)?.x).toBeGreaterThanOrEqual(20 - 1e-9);
  });
});

describe('un <text> lu en lettres, en mode riche', () => {
  it('devient un groupe nomme comme la vectorisation, l opacite au groupe ; une lettre seule reste une feuille', () => {
    const d = riche(SVG('<text x="10" y="40" font-size="20" opacity="0.5">Ab c</text><text x="10" y="80">Z</text>'), true);
    const [g] = groupesDe(d);
    expect(g).toEqual({ id: 'g1', nom: nomGroupeTexte('Ab c'), visible: true, verrouille: false, opacite: 0.5 });
    expect(d.formes.map(f => [f.parent, f.opacite])).toEqual([['g1', 1], ['g1', 1], ['g1', 1], [undefined, 1]]);
    ecritureSaine(d);
  });

  it('une lettre seule a demi opaque prend un groupe (son opacite y compose)', () => {
    const d = riche(SVG('<text x="10" y="40" opacity="0.5">Z</text>'), true);
    expect(groupesDe(d)).toHaveLength(1);
    expect(d.formes[0]?.parent).toBe('g1');
  });

  it('sa decoupe, son masque, son filtre se posent sur le groupe (refuses avant l etape 13c)', () => {
    const d = riche(fichier('imbrications-texte-prises'), true);
    const gs = groupesDe(d);
    expect(gs.map(g => [g.decoupe !== undefined, g.masque !== undefined, g.effets !== undefined])).toEqual([[true, false, false], [true, false, false], [false, true, false], [false, false, true]]);
    // La moitie en unites de boite : la moitie gauche de la boite des lettres.
    const lettres = d.formes.filter(f => f.parent === gs[1]?.id).map(boite);
    const gauche = Math.min(...lettres.map(b => b?.x ?? 0)), droite = Math.max(...lettres.map(b => (b?.x ?? 0) + (b?.l ?? 0)));
    const moitie = boite(gs[1]?.decoupe?.contenu.formes[0]);
    expect(moitie?.x).toBeCloseTo(gauche, 9);
    expect(moitie?.l).toBeCloseTo((droite - gauche) / 2, 9);
    expect(ignores(fichier('imbrications-texte-prises'), true)).toContain(MSG_IMBRICATIONS.boiteTexte);
    ecritureSaine(d);
  });

  it('dans un <clipPath>, un texte sans prise se lit en lettres comme avant', () => {
    const d = riche(fichier('imbrications-texte-dans-decoupe'), true);
    const [g] = groupesDe(d);
    expect(g?.decoupe?.contenu.formes).toHaveLength(4);
    expect(g?.decoupe?.contenu.groupes).toBeUndefined();
  });

  it('lu en riche puis descendu, il redonne les lettres de la lecture plate', () => {
    for (const svg of [fichier('imbrications-texte'), SVG('<g opacity="0.5"><text x="5" y="30" font-size="12" fill="#c81e28" stroke="#000" stroke-width="0.3">Bonjour à tous</text></g>')]) {
      const plat = lireDessin(svg, { polices: policesFactices }), r = lireDessin(svg, { modele: 'riche', polices: policesFactices });
      if ('erreur' in plat || 'erreur' in r) throw new Error('lecture');
      expect(r.ignores).toEqual(plat.ignores);
      expect(aplatirPour(r.dessin, CAPACITES_PLAT).dessin.formes).toEqual(plat.dessin.formes);
    }
  });

  it('le projet JSON fait l aller-retour exact et reecrit le meme SVG', () => {
    allerRetour(riche(fichier('imbrications-texte-prises'), true));
    allerRetour(riche(fichier('imbrications-texte'), true));
  });
});

const etat = (dessin: DessinSvg): EtatProjet => ({ nom: 'essai', dessin, production: { contexte: 'generique' }, nuancier: [], polices: [], images: [] });

function allerRetour(d: DessinSvg): void {
  const relu = lireProjet(JSON.parse(texteDuProjet(projetDe(etat(d)))));
  if ('erreur' in relu) throw new Error(relu.erreur);
  expect(relu.projet.version).toBe(VERSION_PROJET);
  const rouvert = etatDuProjet(relu.projet);
  if ('erreur' in rouvert) throw new Error(rouvert.erreur);
  expect(rouvert.dessin).toEqual(d);
  expect(ecrireDessin(rouvert.dessin, 3)).toBe(ecrireDessin(d, 3));
}

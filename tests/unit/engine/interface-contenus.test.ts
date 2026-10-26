// L'interface des decoupes, des masques, des effets et des images, cote moteur (ADR-0012, etape 8) : `poserEffets` (pur, le meme objet
// quand rien ne change, bornes de la lecture, feuilles et groupes, verrous), `flousApproches` (la phrase d'une rotation sur un flou
// inegal), `insererImage` (taille naturelle bornee au plan, centre ramene dans le plan, groupe du contexte, refus nommes, 16 Mo par
// dessin) et le contenu d'un masque ecrit en contours (le texte vivant reste vivant dans le modele).

import { describe, expect, it } from 'vitest';
import {
  creerMasque, decalageMax, ecartMax, ecrireDessin, effetsDe, estPlat, flouParDefaut, flousApproches, grouper, IMAGES_OCTETS_MAX, insererImage, libererMasque,
  ombreParDefaut, poserEffets, rotation, transformer, translation, verifierDessin, type DessinSvg, type Forme
} from '../../../src/engine/editionSvg.js';
import { etatDuProjet, projetDe, texteDuProjet } from '../../../src/engine/projet.js';
import { lireProjet } from '../../../src/model/projet.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { au } from '../../../src/util/tableaux.js';
import { violationsEcriture, violationsNettoyage } from '../securite/invariants.js';
import { CAS, lire, pngDe, PNG_4_3 } from './v2/cas-interface-contenus.js';

const carre = (x: number, y: number, c: number) => [{ c: 'M' as const, p: [x, y] }, { c: 'L' as const, p: [x + c, y] }, { c: 'L' as const, p: [x + c, y + c] }, { c: 'L' as const, p: [x, y + c] }, { c: 'Z' as const, p: [] }];
const forme = (id: string, champs: Partial<Forme> = {}): Forme => ({ id, d: carre(10, 10, 30), remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...champs });
const plat = (...formes: Forme[]): DessinSvg => ({ vb: [0, 0, 200, 100], formes });
const ecrit = (d: DessinSvg): string => nettoyerSvg(ecrireDessin(d, 3))?.svg ?? '';

describe('poserEffets', () => {
  it('pose un flou par defaut sur un dessin plat, qui devient riche ; le meme objet quand rien ne change', () => {
    const d = plat(forme('f1'), forme('f2'));
    const r = poserEffets(d, ['f1'], { flou: {} });
    expect(estPlat(r)).toBe(false);
    expect(au(r.formes, 0).effets).toEqual({ flou: flouParDefaut(d.vb) });
    expect(flouParDefaut(d.vb)).toEqual({ ecart: 2 });
    expect(au(r.formes, 1)).toBe(au(d.formes, 1));
    expect(poserEffets(r, ['f1'], { flou: {} })).toBe(r);
    expect(poserEffets(r, ['f1'], { flou: { ecart: 2 } })).toBe(r);
    expect(poserEffets(d, [], { flou: {} })).toBe(d);
    expect(poserEffets(d, ['f1'], {})).toBe(d);
  });

  it('borne les valeurs comme la lecture, au millieme, et range la couleur en minuscules', () => {
    const d = plat(forme('f1'));
    const r = poserEffets(d, ['f1'], { flou: { ecart: 1e6 }, ombre: { dx: -1e6, dy: 12.34567, ecart: -3, couleur: '#1F5FB0', opacite: 2 } });
    expect(au(r.formes, 0).effets).toEqual({ flou: { ecart: ecartMax(d.vb) }, ombre: { dx: -decalageMax(d.vb), dy: 12.346, ecart: 0, couleur: '#1f5fb0', opacite: 1 } });
    // Un flou garde un ecart positif ; une couleur illisible ne change rien ; un nombre illisible non plus
    const s = poserEffets(r, ['f1'], { flou: { ecart: 0 }, ombre: { couleur: 'rouge', dx: Number.NaN } });
    expect(au(s.formes, 0).effets?.flou).toEqual({ ecart: 0.001 });
    expect(au(s.formes, 0).effets?.ombre).toEqual(au(r.formes, 0).effets?.ombre);
  });

  it('complete l ombre qui existe, la pose par defaut sinon ; un flou inegal se rend uniforme par ecartY: null', () => {
    const d = plat(forme('f1', { effets: { flou: { ecart: 3, ecartY: 6 }, ombre: { dx: 1, dy: 2, ecart: 3, couleur: '#000000', opacite: 0.5 } } }), forme('f2'));
    const r = poserEffets(d, ['f1', 'f2'], { ombre: { opacite: 0.25 } });
    expect(au(r.formes, 0).effets?.ombre).toEqual({ dx: 1, dy: 2, ecart: 3, couleur: '#000000', opacite: 0.25 });
    expect(au(r.formes, 0).effets?.flou).toBe(au(d.formes, 0).effets?.flou);
    expect(au(r.formes, 1).effets).toEqual({ ombre: { ...ombreParDefaut(d.vb), opacite: 0.25 } });
    expect(au(poserEffets(d, ['f1'], { flou: { ecart: 4, ecartY: null } }).formes, 0).effets?.flou).toEqual({ ecart: 4 });
    expect(au(poserEffets(d, ['f1'], { flou: { ecartY: 3 } }).formes, 0).effets?.flou).toEqual({ ecart: 3 });
  });

  it('retirer le dernier effet retire le champ : le dessin redevient plat et s ecrit comme avant', () => {
    const d = plat(forme('f1'));
    const r = poserEffets(poserEffets(d, ['f1'], { flou: {}, ombre: {} }), ['f1'], { flou: null, ombre: null });
    expect('effets' in au(r.formes, 0)).toBe(false);
    expect(estPlat(r)).toBe(true);
    expect(ecrit(r)).toBe(ecrit(d));
  });

  it('pose sur un groupe, pas sur ses feuilles ; un element verrouille ne change pas', () => {
    const g = grouper(plat(forme('f1'), forme('f2'), forme('f3', { verrouille: true })), ['f1', 'f2']);
    const id = g.id ?? '';
    const r = poserEffets(g.dessin, [id, 'f1', 'f3'], { ombre: {} });
    expect(r.groupes?.[id]?.effets?.ombre).toEqual(ombreParDefaut(r.vb));
    expect(r.formes.every(f => f.effets === undefined)).toBe(true);
    expect(effetsDe(r, id)).toBe(r.groupes?.[id]?.effets);
    expect(verifierDessin(r)).toEqual([]);
  });

  it('l ecriture du reglage passe la specification de l ecriture et le projet JSON le relit tel quel', () => {
    const d = poserEffets(plat(forme('f1'), forme('f2')), ['f1', 'f2'], { flou: { ecart: 0.5 }, ombre: { couleur: '#2E8B57' } });
    expect(violationsEcriture(ecrit(d))).toEqual([]);
    expect(violationsNettoyage(ecrit(d))).toEqual([]);
    const relu = lireProjet(JSON.parse(texteDuProjet(projetDe({ nom: 'essai', dessin: d, production: { contexte: 'generique' }, nuancier: [], polices: [], images: [] }))));
    if ('erreur' in relu) throw new Error(relu.erreur);
    const rouvert = etatDuProjet(relu.projet);
    if ('erreur' in rouvert) throw new Error(rouvert.erreur);
    expect(rouvert.dessin.formes.map(f => f.effets)).toEqual(d.formes.map(f => f.effets));
  });
});

describe('flousApproches', () => {
  const d = plat(forme('f1', { effets: { flou: { ecart: 1, ecartY: 4 } } }), forme('f2', { effets: { flou: { ecart: 2 } } }));
  it('une rotation rend un flou inegal uniforme : compte ; une translation, un quart de tour, un flou deja uniforme : non', () => {
    expect(flousApproches(d, transformer(d, ['f1', 'f2'], rotation(30, 25, 25)))).toBe(1);
    expect(flousApproches(d, transformer(d, ['f1', 'f2'], translation(5, 5)))).toBe(0);
    expect(flousApproches(d, transformer(d, ['f1'], rotation(90, 25, 25)))).toBe(0);
    expect(flousApproches(d, d)).toBe(0);
  });
});

describe('insererImage', () => {
  it('pose l image a sa taille au centre donne, ses octets verifies ; le dessin devient riche', () => {
    const d = plat(forme('f1'));
    const r = insererImage(d, PNG_4_3, { x: 100, y: 50 });
    if ('refus' in r) throw new Error(r.refus);
    const f = r.dessin.formes.find(x => x.id === r.id);
    expect(f?.image).toEqual({ donnees: PNG_4_3, x: 98, y: 48.5, l: 4, h: 3 });
    expect(f?.remplissage).toBeNull();
    expect(r.verifiee).toMatchObject({ nature: 'png', l: 4, h: 3 });
    expect(estPlat(r.dessin)).toBe(false);
    expect(verifierDessin(r.dessin)).toEqual([]);
  });

  it('une image plus grande que le plan est reduite ; un centre hors du plan y est ramene', () => {
    const r = insererImage(plat(), pngDe(1000, 1000), { x: 5000, y: -5000 });
    if ('refus' in r) throw new Error(r.refus);
    expect(r.dessin.formes[0]?.image).toMatchObject({ x: 100, y: 0, l: 100, h: 100 });
  });

  it('se pose au premier plan du groupe du contexte', () => {
    const g = grouper(plat(forme('f1'), forme('f2'), forme('f3')), ['f1', 'f2']);
    const id = g.id ?? '';
    const r = insererImage(g.dessin, PNG_4_3, { x: 10, y: 10 }, id);
    if ('refus' in r) throw new Error(r.refus);
    const i = r.dessin.formes.findIndex(f => f.id === r.id);
    expect(r.dessin.formes[i]?.parent).toBe(id);
    expect(r.dessin.formes[i + 1]?.id).toBe('f3');
    expect(verifierDessin(r.dessin)).toEqual([]);
  });

  it('refuse en le nommant : une image SVG, un contenu qui n est pas une image, un type inconnu, plus de 16 Mo par dessin', () => {
    const refus = (donnees: string, d: DessinSvg = plat()) => { const r = insererImage(d, donnees, { x: 0, y: 0 }); return 'refus' in r ? r.refus : null; };
    expect(refus('data:image/svg+xml;base64,' + Buffer.from('<svg/>').toString('base64'))).toMatch(/image SVG/);
    expect(refus('data:image/png;base64,' + Buffer.from('bonjour tout le monde').toString('base64'))).toMatch(/ni un PNG/);
    expect(refus('data:application/octet-stream;base64,AAAA')).toMatch(/type que l’éditeur ne garde pas/);
    const lourd = 'data:image/png;base64,' + 'A'.repeat(Math.ceil(IMAGES_OCTETS_MAX / 3) * 4);
    expect(refus(PNG_4_3, plat(forme('f1', { image: { donnees: lourd, x: 0, y: 0, l: 1, h: 1 } })))).toMatch(/plus de 16 Mo/);
  });
});

describe('le contenu d un masque s ecrit en contours', () => {
  it('un texte vivant dessus : vivant dans le modele, en contours dans le fichier, rendu vivant par libererMasque', () => {
    const d = lire('texte-vivant-lecture', 'riche');
    const texte = [...d.formes].reverse().find(f => f.texte && f.parent === undefined);
    const fond = au(d.formes, 0);
    const r = creerMasque(d, [fond.id, texte?.id ?? '']);
    if (r.id === null) throw new Error(r.erreur);
    const mq = r.dessin.groupes?.[r.id]?.masque;
    expect(mq?.contenu.formes.some(f => f.texte)).toBe(true);
    const svg = ecrit(r.dessin);
    const dansMasque = /<mask[^>]*>(.*?)<\/mask>/s.exec(svg)?.[1] ?? '';
    expect(dansMasque).not.toMatch(/data-ed-/);
    expect(violationsEcriture(svg)).toEqual([]);
    const libere = libererMasque(r.dessin, r.id);
    expect(libere.dessin.formes.find(f => f.id === texte?.id)?.texte).toEqual(texte?.texte);
  });

  it('chaque cas d ecriture de l etape passe la specification de l ecriture et le nettoyage', () => {
    for (const c of CAS) {
      const svg = ecrit(c.operation && c.dessin ? c.operation(c.dessin()) : plat());
      expect(violationsEcriture(svg), c.nom).toEqual([]);
      expect(violationsNettoyage(svg), c.nom).toEqual([]);
    }
  });
});

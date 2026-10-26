// Les idiomes de filtres des editeurs (ADR-0012, etape 13b ; annexe 4 B §3, annexe 7 §7) : le corpus d'acceptation (Figma, Sketch,
// Illustrator) se lit par le chemin de la page en un flou, une ombre portee ou rien, et dit exactement ce qu'il perd ; ce qui
// n'equivaut pas a ce que `Effets` represente est refuse en nommant l'idiome ; l'evaluation (edition/filtres.ts) se verifie seule :
// matrices de couleurs, fusions, piles, durcissement de l'alpha, RVB lineaire. Les references d'ecriture du corpus sont jouees par
// `v2/cas-idiomes.ts` (ecriture-stable-v2.test.ts).

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { avecIdiome, lireDessin, MSG_EFFETS, REFUS_EFFETS, REFUS_IDIOMES, refusFusion, refusPrimitive, type Effets } from '../../../src/engine/editionSvg.js';
import {
  ALPHA, SOURCE, VIDE, aplat, appliquerMatrice, arithmetique, dans, flou, fusion, matriceCouleurs, pile, reconnaitre, type Image
} from '../../../src/engine/edition/filtres.js';
import { nettoyerSvg } from '../../../src/util/svg.js';

const CORPUS = resolve(__dirname, '../../fixtures/svg/corpus');
const SVG = (corps: string, vb = '0 0 200 200') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + corps + '</svg>';
const lirePage = (svg: string) => {
  const r = lireDessin(nettoyerSvg(svg)?.svg ?? '', { modele: 'riche' });
  if ('erreur' in r) throw new Error(r.erreur);
  return r;
};
const riche = (svg: string) => { const r = lireDessin(svg, { modele: 'riche' }); if ('erreur' in r) throw new Error(r.erreur); return r; };
const erreur = (svg: string) => { const r = lireDessin(svg, { modele: 'riche' }); return 'erreur' in r ? r.erreur : ''; };
const corpus = (nom: string) => readFileSync(resolve(CORPUS, nom + '.svg'), 'utf8');
/** Les effets de chaque groupe, dans l'ordre de la table, puis de chaque feuille. */
const effets = (svg: string): { groupes: (Effets | null)[]; formes: (Effets | null)[] } => {
  const d = riche(svg).dessin;
  return { groupes: Object.values(d.groupes ?? {}).map(g => g.effets ?? null), formes: d.formes.map(f => f.effets ?? null) };
};

// Les chaines de Figma, telles qu'il les ecrit (sur des formes originales).
const FIGMA_DEBUT = '<feFlood flood-opacity="0" result="BackgroundImageFix"/>';
const figmaOmbre = (dx: number, dy: number, s: number, teinte: string, n = 1, mode = 'normal', avant = 'BackgroundImageFix') =>
  '<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>'
  + '<feOffset dx="' + dx + '" dy="' + dy + '"/><feGaussianBlur stdDeviation="' + s + '"/><feComposite in2="hardAlpha" operator="out"/>'
  + '<feColorMatrix type="matrix" values="' + teinte + '"/><feBlend mode="' + mode + '" in2="' + avant + '" result="effect' + n + '_dropShadow"/>';
const NOIR_25 = '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0';
const figmaFin = (n: number, mode = 'normal') => '<feBlend mode="' + mode + '" in="SourceGraphic" in2="effect' + n + '_dropShadow" result="shape"/>';
const filtreFigma = (corps: string) => '<filter id="f" x="0" y="0" width="200" height="200" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">' + corps + '</filter>';
const CARRE = '<rect x="40" y="40" width="80" height="80" fill="#2D6CDF"/>';
const surGroupe = (filtre: string, contenu = CARRE) => SVG('<g filter="url(#f)">' + contenu + '</g><defs>' + filtre + '</defs>');

describe('le corpus des idiomes, par le chemin de la page', () => {
  it('Figma : une ombre portee sur une forme et sur un groupe, la region a deux ecarts dite (elle rognait la queue du flou)', () => {
    const r = lirePage(corpus('figma-ombre'));
    expect(r.ignores).toEqual([MSG_EFFETS.region]);
    expect(Object.values(r.dessin.groupes ?? {}).map(g => g.effets)).toEqual([
      { ombre: { dx: 0, dy: 4, ecart: 4, couleur: '#000000', opacite: 0.25 } },
      { ombre: { dx: 2, dy: 6, ecart: 3, couleur: '#142a51', opacite: 0.4 } }
    ]);
    expect(r.dessin.formes.every(f => f.effets === undefined)).toBe(true);
  });

  it('Figma : un flou de calque', () => {
    const r = lirePage(corpus('figma-flou-calque'));
    expect(r.ignores).toEqual([MSG_EFFETS.region]);
    expect(Object.values(r.dessin.groupes ?? {}).map(g => g.effets)).toEqual([{ flou: { ecart: 5 } }]);
  });

  it('Sketch : une ombre noire sur une forme, une ombre teinte en RVB lineaire sur un groupe transforme, sans perte dite', () => {
    const r = lirePage(corpus('sketch-ombre'));
    expect(r.ignores).toEqual([]);
    expect(r.dessin.formes[0]?.effets).toEqual({ ombre: { dx: 0, dy: 2, ecart: 2, couleur: '#000000', opacite: 0.5 } });
    // 0,290196, 0,564706, 0,886275 sont des composantes LINEAIRES (le filtre ne fixe pas color-interpolation-filters) : #93c6f2 en sRVB.
    expect(Object.values(r.dessin.groupes ?? {}).map(g => g.effets ?? null)).toEqual([null, null, { ombre: { dx: 3, dy: 3, ecart: 3, couleur: '#93c6f2', opacite: 0.5 } }]);
  });

  it('Illustrator : AI_Shadow_1, une ombre noire pleine (l alpha flou et decale, sans aplat)', () => {
    const r = lirePage(corpus('illustrator-ombre'));
    expect(r.ignores).toEqual([]);
    expect(Object.values(r.dessin.groupes ?? {}).map(g => g.effets)).toEqual([{ ombre: { dx: 4, dy: 4, ecart: 4, couleur: '#000000', opacite: 1 } }]);
  });

  it('Illustrator : Adobe_OpacityMaskFilter est neutre dans le contenu du masque, rien n est dit ni garde', () => {
    const r = lirePage(corpus('illustrator-masque-opacite'));
    expect(r.ignores).toEqual([]);
    const masque = Object.values(r.dessin.groupes ?? {})[0]?.masque;
    expect(masque?.type).toBe('luminance');
    expect(Object.values(masque?.contenu.groupes ?? {}).map(g => g.effets ?? null)).toEqual([null]);
    expect(masque?.contenu.formes[0]?.peintureRemplissage?.genre).toBe('lineaire');
  });

  it('chaque fichier se refuse en mode plat comme avant (un filtre, un masque)', () => {
    for (const n of ['figma-ombre', 'figma-flou-calque', 'sketch-ombre', 'illustrator-ombre', 'illustrator-masque-opacite']) {
      const r = lireDessin(nettoyerSvg(corpus(n))?.svg ?? '');
      expect('erreur' in r ? r.erreur : 'ouvert', n).toMatch(/un filtre|un masque/);
    }
  });
});

describe('ce qui n equivaut pas a un flou et une ombre est refuse en nommant l idiome', () => {
  it('Figma : ombre interieure, plusieurs ombres, flou de calque sur une ombre, fusion finale autre que normale, etalement', () => {
    const interieure = FIGMA_DEBUT + '<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>'
      + '<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>'
      + '<feOffset dy="4"/><feGaussianBlur stdDeviation="2"/><feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1"/>'
      + '<feColorMatrix type="matrix" values="' + NOIR_25 + '"/><feBlend mode="normal" in2="shape" result="effect1_innerShadow"/>';
    expect(erreur(surGroupe(filtreFigma(interieure)))).toContain(REFUS_IDIOMES.interieure + ' (Figma)');
    const deux = FIGMA_DEBUT + figmaOmbre(0, 4, 2, NOIR_25) + figmaOmbre(2, 2, 1, NOIR_25, 2, 'normal', 'effect1_dropShadow') + figmaFin(2);
    expect(erreur(surGroupe(filtreFigma(deux)))).toContain(REFUS_IDIOMES.plusieurs + ' (Figma)');
    const flouCalque = FIGMA_DEBUT + figmaOmbre(0, 4, 2, NOIR_25) + figmaFin(1) + '<feGaussianBlur stdDeviation="3" result="effect2_foregroundBlur"/>';
    expect(erreur(surGroupe(filtreFigma(flouCalque)))).toContain(REFUS_IDIOMES.flouCalque + ' (Figma)');
    expect(erreur(surGroupe(filtreFigma(FIGMA_DEBUT + figmaOmbre(0, 4, 2, NOIR_25) + figmaFin(1, 'multiply'))))).toContain(avecIdiome(refusFusion('multiply'), 'Figma'));
    expect(avecIdiome(refusFusion('multiply'), 'Figma')).toBe('un mode de fusion autre que normal (multiply, Figma)');
    const etalement = FIGMA_DEBUT + '<feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>'
      + '<feMorphology radius="2" operator="dilate" in="SourceAlpha" result="effect1_dropShadow"/><feOffset dy="4"/><feGaussianBlur stdDeviation="2"/>'
      + '<feColorMatrix type="matrix" values="' + NOIR_25 + '"/><feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow"/>' + figmaFin(1);
    expect(erreur(surGroupe(filtreFigma(etalement)))).toContain(avecIdiome(refusPrimitive('feMorphology'), 'Figma'));
  });

  it('Figma : le mode de fusion de l ombre elle-meme ne compte pas (elle se fond dans un aplat transparent) : lue comme en mode normal', () => {
    const normal = effets(surGroupe(filtreFigma(FIGMA_DEBUT + figmaOmbre(0, 4, 2, NOIR_25) + figmaFin(1))));
    const multiply = effets(surGroupe(filtreFigma(FIGMA_DEBUT + figmaOmbre(0, 4, 2, NOIR_25, 1, 'multiply') + figmaFin(1))));
    expect(multiply).toEqual(normal);
    expect(normal.groupes).toEqual([{ ombre: { dx: 0, dy: 4, ecart: 2, couleur: '#000000', opacite: 0.25 } }]);
  });

  it('Figma : une ombre calculee sur la forme pleine n equivaut a celle du modele que sous des formes opaques', () => {
    const f = filtreFigma(FIGMA_DEBUT + figmaOmbre(0, 4, 2, NOIR_25) + figmaFin(1));
    const refus = REFUS_IDIOMES.transparente + ' (Figma)';
    // Sur la forme elle-meme, ou dans un groupe : opacite, fond ou trait translucides, degrade a arret transparent, groupe estompe entre les deux.
    expect(erreur(SVG('<rect x="40" y="40" width="80" height="80" fill="#2D6CDF" fill-opacity="0.5" filter="url(#f)"/>' + f))).toContain(refus);
    expect(erreur(surGroupe(f, '<rect x="40" y="40" width="80" height="80" fill="#2D6CDF" opacity="0.5"/>'))).toContain(refus);
    expect(erreur(surGroupe(f, '<rect x="40" y="40" width="80" height="80" fill="#2D6CDF" stroke="#000" stroke-opacity="0.4"/>'))).toContain(refus);
    expect(erreur(surGroupe(f, '<g opacity="0.5">' + CARRE + '</g>'))).toContain(refus);
    const degrade = '<linearGradient id="d"><stop stop-color="#000"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>';
    expect(erreur(surGroupe(f, degrade + '<rect x="40" y="40" width="80" height="80" fill="url(#d)"/>'))).toContain(refus);
    // L'opacite du groupe a filtre lui-meme s'applique apres le filtre : elle ne compte pas ; une forme opaque non plus.
    expect(effets(SVG('<g filter="url(#f)" opacity="0.5">' + CARRE + '</g>' + f)).groupes[0]?.ombre?.opacite).toBe(0.25);
    expect(effets(SVG('<rect x="40" y="40" width="80" height="80" fill="#2D6CDF" filter="url(#f)"/>' + f)).formes[0]?.ombre?.dy).toBe(4);
    // L'ombre ordinaire (alpha non durci, rien de retire) se lit sous une forme translucide, comme avant.
    const sketch = '<filter id="f"><feOffset dy="2" in="SourceAlpha"/><feGaussianBlur stdDeviation="2"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    expect(effets(SVG('<rect x="40" y="40" width="80" height="80" fill="#2D6CDF" fill-opacity="0.5" filter="url(#f)"/>' + sketch)).formes[0]?.ombre?.opacite).toBe(0.5);
  });

  it('Sketch : une ombre interieure', () => {
    const f = '<filter x="-50%" y="-50%" width="200%" height="200%" filterUnits="objectBoundingBox" id="f">'
      + '<feGaussianBlur stdDeviation="1.5" in="SourceAlpha" result="shadowBlurInner1"/><feOffset dx="0" dy="1" in="shadowBlurInner1" result="shadowOffsetInner1"/>'
      + '<feComposite in="shadowOffsetInner1" in2="SourceAlpha" operator="arithmetic" k2="-1" k3="1" result="shadowInnerInner1"/>'
      + '<feColorMatrix values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0  0 0 0 0.5 0" type="matrix" in="shadowInnerInner1"/></filter>';
    expect(erreur(SVG(f + '<rect x="40" y="40" width="80" height="80" fill="#4A90E2" filter="url(#f)"/>'))).toContain(REFUS_IDIOMES.interieure + ' (Sketch)');
  });

  it('Illustrator : un masque inverse, un fond blanc pose par le filtre', () => {
    const masque = (filtre: string) => SVG('<defs><filter id="Adobe_OpacityMaskFilter" filterUnits="userSpaceOnUse" x="0" y="0" width="200" height="200">' + filtre
      + '</filter></defs><mask maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="200" id="m"><g filter="url(#Adobe_OpacityMaskFilter)"><circle cx="100" cy="100" r="50" fill="#fff"/></g></mask>'
      + '<rect width="200" height="200" fill="#1F7A8C" mask="url(#m)"/>');
    expect(erreur(masque('<feColorMatrix type="matrix" values="-1 0 0 0 1  0 -1 0 0 1  0 0 -1 0 1  0 0 0 1 0" color-interpolation-filters="sRGB"/>')))
      .toContain(REFUS_IDIOMES.inverse + ' (Illustrator)');
    expect(erreur(masque('<feFlood style="flood-color:white;flood-opacity:1" result="back"/><feBlend in="SourceGraphic" in2="back" mode="normal"/>')))
      .toContain(REFUS_IDIOMES.fond + ' (Illustrator)');
    // L'identite, avec ou sans color-interpolation-filters : neutre.
    expect(riche(masque('<feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" color-interpolation-filters="sRGB" result="source"/>')).ignores).toEqual([]);
  });

  it('un filtre neutre dont la region rognait la forme le dit (la forme s ecrit entiere)', () => {
    const f = '<filter id="f" filterUnits="userSpaceOnUse" x="0" y="0" width="50" height="50"><feColorMatrix type="saturate" values="1"/></filter>';
    expect(riche(SVG(f + '<rect x="40" y="40" width="80" height="80" filter="url(#f)"/>')).ignores).toEqual([MSG_EFFETS.regionNeutre]);
    expect(riche(SVG(f + '<g filter="url(#f)"><rect x="40" y="40" width="80" height="80"/></g>')).ignores).toEqual([MSG_EFFETS.regionNeutre]);
    expect(riche(SVG(f + '<rect x="10" y="10" width="20" height="20" filter="url(#f)"/>')).ignores).toEqual([]);
    expect(erreur(SVG('<filter id="f" width="0"><feColorMatrix/></filter><rect width="10" height="10" filter="url(#f)"/>'))).toContain(REFUS_EFFETS.regionVide);
  });

  it('sans idiome reconnu, la phrase reste nue ; les couleurs du graphique et une fusion visible sont refusees', () => {
    const avec = (filtre: string) => erreur(SVG('<filter id="f">' + filtre + '</filter><rect width="10" height="10" filter="url(#f)"/>'));
    expect(avec('<feColorMatrix type="saturate" values="0"/>')).toContain(REFUS_IDIOMES.couleurs);
    expect(avec('<feColorMatrix type="saturate" values="0"/>')).not.toContain('(Sketch)');
    expect(avec('<feColorMatrix type="hueRotate" values="90"/>')).toContain(REFUS_IDIOMES.couleurs);
    expect(avec('<feColorMatrix type="luminanceToAlpha"/>')).toContain(REFUS_IDIOMES.couleurs);
    expect(avec('<feColorMatrix values="1 0 0"/>')).toContain(REFUS_IDIOMES.matrice);
    expect(avec('<feColorMatrix type="inconnu"/>')).toContain(REFUS_IDIOMES.matrice);
    expect(avec('<feOffset dx="3" result="o"/><feBlend in="SourceGraphic" in2="o" mode="screen"/>')).toContain(refusFusion('screen'));
    expect(avec('<feFlood flood-color="#fff"/><feComposite in2="SourceGraphic" operator="out"/>')).toContain(REFUS_EFFETS.forme);
    expect(avec('<feFlood flood-opacity="0"/>')).toContain(REFUS_IDIOMES.efface);
    // Neutres : saturate 1, hueRotate 0, une fusion d'un mode inconnu (la valeur de repli, normal).
    expect(effets(SVG('<filter id="f"><feColorMatrix type="saturate" values="1"/><feColorMatrix type="hueRotate"/></filter><rect width="10" height="10" filter="url(#f)"/>')).formes).toEqual([null]);
    expect(effets(SVG('<filter id="f"><feFlood flood-opacity="0" result="t"/><feBlend in="SourceGraphic" in2="t" mode="bizarre"/></filter><rect width="10" height="10" filter="url(#f)"/>')).formes).toEqual([null]);
  });

  it('l ombre portee d Inkscape 1 (l aplat compose dans le graphique, puis flou et decale) se lit aussi', () => {
    const f = '<filter style="color-interpolation-filters:sRGB" id="f" x="-0.5" y="-0.5" width="2" height="2">'
      + '<feFlood flood-opacity="0.498039" flood-color="rgb(0,0,0)" result="flood"/><feComposite in="flood" in2="SourceGraphic" operator="in" result="composite1"/>'
      + '<feGaussianBlur in="composite1" stdDeviation="3" result="blur"/><feOffset dx="6" dy="6" result="offset"/>'
      + '<feComposite in="SourceGraphic" in2="offset" operator="over" result="composite2"/></filter>';
    expect(effets(SVG(f + '<rect x="40" y="40" width="80" height="80" fill="#81b29a" filter="url(#f)"/>')).formes)
      .toEqual([{ ombre: { dx: 6, dy: 6, ecart: 3, couleur: '#000000', opacite: 0.498 } }]);
  });
});

describe('l evaluation d un filtre (edition/filtres.ts)', () => {
  it('lit les matrices de couleurs de Filter Effects ; une matrice illisible est null', () => {
    expect(matriceCouleurs(undefined, undefined)).toEqual([1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]);
    expect(matriceCouleurs('matrix', '')).toHaveLength(20);
    expect(matriceCouleurs('matrix', '1 2 3')).toBeNull();
    expect(matriceCouleurs('matrix', 'NaN 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0')).toBeNull();
    expect(matriceCouleurs('saturate', '1 2')).toBeNull();
    expect(matriceCouleurs('luminanceToAlpha', undefined)?.slice(15)).toEqual([0.2125, 0.7154, 0.0721, 0, 0]);
    const h = matriceCouleurs('hueRotate', '0');
    expect(h?.every((v, i) => Math.abs(v - (i % 6 === 0 ? 1 : 0)) < 1e-9)).toBe(true);
  });

  it('une matrice de teinte teint une silhouette, en RVB lineaire ou non ; un facteur au-dela de 1 la durcit', () => {
    const teinte = matriceCouleurs('matrix', '0 0 0 0 0.2  0 0 0 0 0.4  0 0 0 0 0.6  0 0 0 0.5 0') ?? [];
    expect(appliquerMatrice(ALPHA, teinte, false)).toEqual({ k: 'dans', a: { k: 'aplat', couleur: '#336699', opacite: 0.5 }, b: ALPHA });
    expect(appliquerMatrice(ALPHA, teinte, true)).toEqual({ k: 'dans', a: { k: 'aplat', couleur: '#7caacb', opacite: 0.5 }, b: ALPHA });
    const dur = matriceCouleurs('matrix', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0') ?? [];
    expect(appliquerMatrice(ALPHA, dur, true)).toEqual({ k: 'dans', a: { k: 'aplat', couleur: '#000000', opacite: 1 }, b: { k: 'dur', de: ALPHA, f: 127 } });
    // Une image de couleur uniforme se recolore (une teinte de teinte) ; le graphique ne se recolore pas.
    const rouge = dans(aplat('#ff0000', 1), ALPHA);
    const permute = matriceCouleurs('matrix', '0 1 0 0 0  1 0 0 0 0  0 0 1 0 0  0 0 0 1 0') ?? [];
    expect(appliquerMatrice(rouge, permute, false)).toEqual({ k: 'dans', a: { k: 'aplat', couleur: '#00ff00', opacite: 1 }, b: rouge });
    expect(appliquerMatrice(SOURCE, permute, false)).toEqual({ refus: REFUS_IDIOMES.couleurs });
  });

  it('une fusion avec une image transparente rend l autre, quel que soit le mode ; les piles s aplatissent sans couche vide', () => {
    const o = flou(ALPHA, 2, 2, false);
    expect(fusion(o, VIDE, 'multiply')).toBe(o);
    expect(fusion(VIDE, o, 'screen')).toBe(o);
    expect(fusion(SOURCE, o, 'darken')).toEqual({ refus: refusFusion('darken') });
    expect(fusion(SOURCE, o, undefined)).toEqual({ k: 'pile', couches: [o, SOURCE] });
    expect(pile([pile([o, VIDE]), VIDE, SOURCE])).toEqual({ k: 'pile', couches: [o, SOURCE] });
    expect(pile([VIDE])).toBe(VIDE);
    expect(arithmetique(o, SOURCE, 0, 1, 0, 0)).toBe(o);
    expect(arithmetique(o, SOURCE, 0, 0, 1, 0)).toBe(SOURCE);
  });

  it('reconnait le graphique, son flou, une ombre dessous ; nomme le reste', () => {
    const ombre: Image = dans(aplat('#000000', 0.5), flou(ALPHA, 2, 2, false));
    expect(reconnaitre(SOURCE)).toEqual({});
    expect(reconnaitre(pile([ombre, SOURCE]))).toEqual({ ombre: { sx: 2, sy: 2, dx: 0, dy: 0, couleur: '#000000', opacite: 0.5 } });
    expect(reconnaitre(pile([ombre, ombre, SOURCE]))).toEqual({ refus: REFUS_IDIOMES.plusieurs });
    expect(reconnaitre(pile([SOURCE, ombre]))).toEqual({ refus: 'un filtre qui n’est ni un flou ni une ombre portée' });
    expect(reconnaitre(VIDE)).toEqual({ refus: REFUS_IDIOMES.efface });
    expect(reconnaitre(pile([aplat('#ffffff', 1), SOURCE]))).toEqual({ refus: REFUS_IDIOMES.fond });
  });
});

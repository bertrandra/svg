// Les effets du modele v2 (ADR-0012, etape 7 ; annexe 4 B, annexe 8 §5.7, paquet 7-A) : la lecture riche du sous-ensemble (flou, ombre
// portee, les deux), les refus nommes, ce qui se dit, la lecture plate qui refuse avec la phrase d'aujourd'hui, la transformation
// (le flou suit la matrice, l'ombre garde sa direction dans le plan), la boite visuelle, l'ecriture exacte et le point fixe sur des
// effets tires au hasard, le nuancier, et la mesure d'un dessin de 200 formes a effets (methode de l'ADR-0008).

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ajusterPlan, boiteVisuelle, definitionFiltre, ecartsSous, ecrireDessin, effetsEcrits, grouper, lireDessin, margeEffets, MSG_EFFETS, REFUS_EFFETS,
  refusPrimitive, regionEcrite, rotation, echelle, transformer, transformerEffets, translation, verifierDessin, type DessinSvg, type Effets, type Forme,
  type Matrice
} from '../../../src/engine/editionSvg.js';
import { apportsDe } from '../../../src/engine/nuancier.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { violationsEcriture, violationsNettoyage } from '../securite/invariants.js';

const DOSSIER = resolve(__dirname, '../../fixtures/svg/v2');
const SVG = (corps: string, vb = '0 0 100 100') => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + vb + '">' + corps + '</svg>';
const riche = (svg: string) => { const r = lireDessin(svg, { modele: 'riche' }); if ('erreur' in r) throw new Error(r.erreur); return r; };
const erreur = (svg: string) => { const r = lireDessin(svg, { modele: 'riche' }); return 'erreur' in r ? r.erreur : ''; };
const fichier = (nom: string) => readFileSync(resolve(DOSSIER, nom + '.svg'), 'utf8');
const effetsDe = (svg: string): readonly (Effets | undefined)[] => riche(svg).dessin.formes.map(f => f.effets);
const carre = (p: Partial<Forme> = {}): Forme => ({
  id: 'f1', d: [{ c: 'M', p: [10, 10] }, { c: 'L', p: [40, 10] }, { c: 'L', p: [40, 30] }, { c: 'L', p: [10, 30] }, { c: 'Z', p: [] }],
  remplissage: '#c81e28', contour: null, epaisseur: 0, opacite: 1, regle: 'nonzero', visible: true, verrouille: false, ...p
});
const FLOU = '<filter id="f" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="2"/></filter>';

describe('la lecture riche des effets', () => {
  const entrees = readdirSync(DOSSIER).filter(n => /^effets-[a-z-]+\.svg$/.test(n) && !n.endsWith('.attendu.svg')).map(n => n.slice(0, -4));

  it('chaque entree v2 des effets se lit en riche, bien formee, et la lecture plate la refuse avec la phrase d aujourd hui', () => {
    expect(entrees.length).toBeGreaterThanOrEqual(6);
    for (const nom of entrees) {
      const texte = fichier(nom);
      const r = riche(texte);
      expect(verifierDessin(r.dessin), nom).toEqual([]);
      expect(r.dessin.formes.some(f => f.effets) || Object.values(r.dessin.groupes ?? {}).some(g => g.effets), nom).toBe(true);
      const plat = lireDessin(texte);
      expect('erreur' in plat ? plat.erreur : '', nom).toContain('un filtre');
    }
  });

  it('lit le flou isotrope, anisotrope, par style et par classe, en unites du plan', () => {
    expect(effetsDe(fichier('effets-flou'))).toEqual([
      { flou: { ecart: 3 } }, { flou: { ecart: 4, ecartY: 1.5 } }, { flou: { ecart: 1.25 } }, { flou: { ecart: 1.25 } }, { flou: { ecart: 1.25 } }
    ]);
  });

  it('lit l ombre decomposee, feDropShadow et ses valeurs par defaut, une couleur nommee, un aplat par style', () => {
    expect(effetsDe(fichier('effets-ombre'))).toEqual([
      { ombre: { dx: 4, dy: 5, ecart: 3, couleur: '#1d3557', opacite: 0.45 } },
      { ombre: { dx: -3, dy: 2, ecart: 1.5, couleur: '#663399', opacite: 0.8 } },
      { ombre: { dx: 2, dy: 2, ecart: 2, couleur: '#000000', opacite: 1 } },
      { ombre: { dx: 2, dy: 2, ecart: 2, couleur: '#e63946', opacite: 0.5 } }
    ]);
  });

  it('lit l ombre et le flou fusionnes, et les effets d un groupe sur le groupe, pas sur ses feuilles', () => {
    const r = riche(fichier('effets-flou-ombre'));
    expect(r.dessin.formes[0]?.effets).toEqual({ flou: { ecart: 1.5 }, ombre: { dx: 3, dy: 3, ecart: 2.5, couleur: '#000000', opacite: 0.35 } });
    expect(r.dessin.groupes?.g1?.effets).toEqual({ ombre: { dx: 2, dy: 4, ecart: 2, couleur: '#264653', opacite: 0.6 } });
    expect(r.dessin.groupes?.g1?.opacite).toBe(0.9);
    expect(r.dessin.formes.slice(1).map(f => f.effets)).toEqual([undefined, undefined, { flou: { ecart: 0.8 } }]);
  });

  it('sous une transformation : l ecart a l echelle, l ombre tournee a la lecture, l ecart moyen quand l ellipse tourne (dit)', () => {
    const rot = riche(fichier('effets-rotation'));
    expect(rot.dessin.formes[0]?.effets).toEqual({ flou: { ecart: 2 } });
    expect(rot.dessin.formes[1]?.effets?.flou?.ecart).toBeCloseTo(2, 12);
    expect(rot.dessin.formes[1]?.effets?.flou?.ecartY).toBeUndefined();
    const ombre = rot.dessin.groupes?.g2?.effets?.ombre;
    expect([ombre?.dx, ombre?.dy]).toEqual([expect.closeTo(0, 12), expect.closeTo(5, 12)]);
    expect(rot.dessin.formes[3]?.effets).toEqual({ flou: { ecart: 1, ecartY: 4 } });
    expect(rot.ignores).toContain(MSG_EFFETS.anisotrope);
    const ech = riche(fichier('effets-echelle'));
    expect(ech.dessin.formes[0]?.effets).toEqual({ flou: { ecart: 4, ecartY: 2 } });
    expect(ech.dessin.formes[1]?.effets?.ombre).toEqual({ dx: 6, dy: 3, ecart: Math.sqrt(8), couleur: '#023047', opacite: 0.4 });
    expect(ech.dessin.formes[2]?.effets).toEqual({ flou: { ecart: 2.5, ecartY: 4 } });
    expect(ech.dessin.formes[3]?.effets?.flou?.ecart).toBeCloseTo(Math.sqrt(8), 12);
    expect(ech.ignores).toEqual(expect.arrayContaining([MSG_EFFETS.ombreAnisotrope, MSG_EFFETS.anisotrope]));
  });

  it('dit le RVB lineaire d un flou du graphique, et la region qui rognait l effet (feuille, sous-region, groupe en unites du plan)', () => {
    expect(riche(SVG('<filter id="f"><feGaussianBlur stdDeviation="2"/></filter><rect width="10" height="10" filter="url(#f)"/>')).ignores).toContain(MSG_EFFETS.lineaire);
    expect(riche(SVG('<filter id="f"><feDropShadow/></filter><rect width="10" height="10" filter="url(#f)"/>')).ignores).not.toContain(MSG_EFFETS.lineaire);
    const etroit = '<filter id="f" color-interpolation-filters="sRGB" x="0" y="0" width="1" height="1"><feGaussianBlur stdDeviation="2"/></filter>';
    expect(riche(SVG(etroit + '<rect x="20" y="20" width="10" height="10" filter="url(#f)"/>')).ignores).toEqual([MSG_EFFETS.region]);
    expect(riche(SVG(FLOU + '<rect x="20" y="20" width="10" height="10" filter="url(#f)"/>')).ignores).toEqual([MSG_EFFETS.region]);
    const large = '<filter id="f" color-interpolation-filters="sRGB" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="2"/></filter>';
    expect(riche(SVG(large + '<rect x="20" y="20" width="10" height="10" filter="url(#f)"/>')).ignores).toEqual([]);
    const sousRegion = '<filter id="f" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="2" x="0" width="5"/></filter>';
    expect(riche(SVG(sousRegion + '<rect x="20" y="20" width="10" height="10" filter="url(#f)"/>')).ignores).toEqual([MSG_EFFETS.region]);
    const figma = '<filter id="f" filterUnits="userSpaceOnUse" x="10" y="10" width="30" height="30" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="2"/></filter>';
    expect(riche(SVG(figma + '<g filter="url(#f)"><rect x="16" y="16" width="10" height="10"/><rect x="30" y="30" width="5" height="5"/></g>')).ignores).toEqual([MSG_EFFETS.region]);
    expect(riche(SVG(figma + '<g filter="url(#f)"><rect x="16" y="16" width="10" height="10"/></g>')).ignores).toEqual([]);
  });

  it('refuse en nommant toute primitive ou combinaison hors du sous-ensemble', () => {
    const avec = (filtre: string, ou = '<rect width="10" height="10" filter="url(#f)"/>') => erreur(SVG('<filter id="f">' + filtre + '</filter>' + ou));
    expect(avec('<feTurbulence baseFrequency="0.1"/>')).toContain(refusPrimitive('feTurbulence'));
    expect(avec('<feFlood flood-opacity="0"/><feColorMatrix type="matrix" values="0 0 0 0 0"/>')).toContain(refusPrimitive('feColorMatrix'));
    expect(avec('<feOffset dx="3"/>')).toContain(REFUS_EFFETS.forme);
    expect(avec('<feGaussianBlur in="SourceAlpha" stdDeviation="2"/>')).toContain(REFUS_EFFETS.forme);
    expect(avec('<feFlood/><feComposite in2="SourceAlpha" operator="xor"/>')).toContain(REFUS_EFFETS.forme);
    expect(avec('<feDropShadow/><feGaussianBlur in="SourceGraphic" stdDeviation="1" result="e"/><feMerge><feMergeNode/><feMergeNode in="e"/></feMerge>')).toContain(REFUS_EFFETS.forme);
    expect(avec('<feGaussianBlur in="BackgroundImage" stdDeviation="2"/>')).toContain('BackgroundImage');
    expect(avec('')).toContain(REFUS_EFFETS.vide);
    expect(avec('<feGaussianBlur stdDeviation="2"/>', '<g filter="url(#f)"><rect width="10" height="10"/></g>').length).toBe(0);
    expect(erreur(SVG('<rect width="10" height="10" style="filter: blur(2px)"/>'))).toContain(REFUS_EFFETS.css);
    expect(erreur(SVG(FLOU + '<rect width="10" height="10" style="filter: url(#f) blur(2px)"/>'))).toContain(REFUS_EFFETS.chaine);
    expect(erreur(SVG('<rect width="10" height="10" filter="url(autre.svg#f)"/>'))).toContain(REFUS_EFFETS.externe);
    expect(erreur(SVG('<filter id="g" primitiveUnits="objectBoundingBox"><feGaussianBlur stdDeviation="0.1"/></filter><g filter="url(#g)"><rect width="10" height="10"/></g>'))).toContain(REFUS_EFFETS.boite);
    expect(erreur(SVG('<filter id="f" width="0"><feGaussianBlur stdDeviation="1"/></filter><rect width="10" height="10" filter="url(#f)"/>'))).toContain(REFUS_EFFETS.regionVide);
  });

  it('un filtre que rien ne porterait (clone, texte, symbole, racine) reste refuse, en disant ou il est pose', () => {
    expect(erreur(SVG(FLOU + '<rect id="r" width="10" height="10"/><use href="#r" x="20" filter="url(#f)"/>'))).toContain('un filtre (posé sur un clone <use>)');
    expect(erreur(SVG(FLOU + '<symbol id="s" style="filter:url(#f)"><rect width="10" height="10"/></symbol><use href="#s"/>'))).toContain('un filtre (posé sur un symbole)');
    expect(erreur('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" filter="url(#f)">' + FLOU + '<rect width="10" height="10"/></svg>')).toContain('un filtre (posé sur tout le dessin)');
    // Le mode plat garde sa phrase.
    const plat = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" filter="url(#f)">' + FLOU + '<rect width="10" height="10"/></svg>');
    expect('erreur' in plat ? plat.erreur : '').toContain('un filtre :');
    // Un clone dont la cible porte elle-meme son filtre se lit : chaque clone garde l'effet de sa feuille.
    expect(effetsDe(SVG(FLOU + '<rect id="r" width="10" height="10" filter="url(#f)"/><use href="#r" x="20"/>'))).toEqual([{ flou: { ecart: 2 } }, { flou: { ecart: 2 } }]);
  });

  it('une reference vers rien dessine la forme sans effet (et le dit), un filtre sans effet ne laisse rien', () => {
    const r = riche(SVG('<rect width="10" height="10" filter="url(#absent)"/><rect x="20" width="10" height="10" filter="url(#m)"/><filter id="m"><feMerge><feMergeNode in="SourceGraphic"/></feMerge></filter>'));
    expect(r.dessin.formes.map(f => f.effets)).toEqual([undefined, undefined]);
    expect(r.ignores).toContain(MSG_EFFETS.reference);
  });
});

describe('les effets se transforment avec leur forme', () => {
  const e: Effets = { flou: { ecart: 2, ecartY: 1 }, ombre: { dx: 3, dy: 4, ecart: 1.5, couleur: '#000000', opacite: 0.5 } };

  it('une translation rend le meme objet ; une echelle uniforme met tout a l echelle ; l ombre ne tourne pas', () => {
    expect(transformerEffets(e, translation(5, 7))).toBe(e);
    expect(transformerEffets(e, echelle(2, 2))).toEqual({ flou: { ecart: 4, ecartY: 2 }, ombre: { dx: 6, dy: 8, ecart: 3, couleur: '#000000', opacite: 0.5 } });
    const t = transformerEffets(e, rotation(90));
    expect(t.flou?.ecart).toBeCloseTo(1, 12);
    expect(t.flou?.ecartY).toBeCloseTo(2, 12);
    expect(t.ombre).toBe(e.ombre);
  });

  it('une echelle non uniforme : le flou par axe, l ombre par le facteur ; une rotation d un flou anisotrope : l ecart moyen', () => {
    expect(transformerEffets({ flou: { ecart: 2 } }, echelle(3, 1))).toEqual({ flou: { ecart: 6, ecartY: 2 } });
    expect(transformerEffets({ ombre: { dx: 1, dy: 1, ecart: 1, couleur: '#000000', opacite: 1 } }, echelle(4, 1)).ombre).toEqual({ dx: 2, dy: 2, ecart: 2, couleur: '#000000', opacite: 1 });
    const m = ecartsSous(4, 1, rotation(30));
    expect(m.approche).toBe(true);
    expect(m.ex).toBeCloseTo(2, 12);
    expect(ecartsSous(2, 2, rotation(37)).approche).toBe(false);
  });

  it('transformer un dessin lu emmene les effets des feuilles et des groupes de la fermeture', () => {
    const d = riche(fichier('effets-flou-ombre')).dessin;
    const t = transformer(d, d.formes.map(f => f.id), echelle(2, 2));
    expect(t.groupes?.g1?.effets?.ombre).toEqual({ dx: 4, dy: 8, ecart: 4, couleur: '#264653', opacite: 0.6 });
    expect(t.formes[3]?.effets).toEqual({ flou: { ecart: 1.6 } });
    // Une seule feuille d'un groupe a effets : le groupe ne suit pas.
    expect(transformer(d, ['f2'], echelle(2, 2)).groupes?.g1?.effets).toEqual(d.groupes?.g1?.effets);
  });
});

describe('la boite visuelle et la region ecrite', () => {
  it('les effets elargissent la boite visuelle de trois ecarts et du decalage ; ajusterPlan la suit', () => {
    const f = carre({ effets: { ombre: { dx: 4, dy: -1, ecart: 2, couleur: '#000000', opacite: 0.5 } } });
    expect(margeEffets(f.effets ?? {})).toBe(10);
    const d: DessinSvg = { vb: [0, 0, 100, 100], formes: [f] };
    expect(boiteVisuelle(d, 'f1')).toEqual({ x: 0, y: 0, l: 50, h: 40 });
    expect(ajusterPlan(d, 0).vb).toEqual([0, 0, 50, 40]);
    const g = grouper({ vb: [0, 0, 100, 100], formes: [carre()] }, ['f1']).dessin;
    const avecEffets: DessinSvg = { ...g, groupes: { g1: { ...(g.groupes?.g1 ?? { id: 'g1', visible: true, verrouille: false }), effets: { flou: { ecart: 1 } } } } };
    expect(boiteVisuelle(avecEffets, 'g1')).toEqual({ x: 7, y: 7, l: 36, h: 26 });
  });

  it('la region est la boite elargie, arrondie vers l exterieur, et contient toujours ce qui se voit', () => {
    expect(regionEcrite({ x: 1.0004, y: -2.0006, l: 3.0001, h: 1 }, 3)).toEqual({ x: 1, y: -2.001, l: 3.001, h: 1.001 });
    const e = effetsEcrits({ flou: { ecart: 0.0004 } }, 3);
    expect(e).toBeNull();
    expect(effetsEcrits({ flou: { ecart: 0.0004 }, ombre: { dx: 1.23456, dy: 0, ecart: 0, couleur: '#000000', opacite: 0.12345 } }, 2)).toEqual({ ombre: { dx: 1.23, dy: 0, ecart: 0, couleur: '#000000', opacite: 0.123 } });
    expect(definitionFiltre({ flou: { ecart: 1 }, ombre: { dx: 0, dy: 0, ecart: 1, couleur: 'red', opacite: 1 } }, { x: 0, y: 0, l: 1, h: 1 }, 3)).toBeNull();
  });
});

describe('l ecriture des effets', () => {
  it('chaque entree s ecrit propre (specification, nettoyage), avec des filtres d empreinte et une region qui couvre l effet', () => {
    for (const nom of readdirSync(DOSSIER).filter(n => /^effets-.*\.svg$/.test(n))) {
      const r = lireDessin(readFileSync(resolve(DOSSIER, nom), 'utf8'), { modele: 'riche' });
      if ('erreur' in r) throw new Error(nom + ' : ' + r.erreur);
      const e = ecrireDessin(r.dessin, 3);
      expect(violationsEcriture(e), nom).toEqual([]);
      expect(violationsNettoyage(e), nom).toEqual([]);
      expect(nettoyerSvg(e)?.svg, nom).toBe(e);
      expect(e).not.toMatch(/feDropShadow|filterUnits="objectBoundingBox"/);
      for (const m of e.matchAll(/ filter="url\(#([^)]+)\)"/g)) expect(e, nom).toContain('<filter id="' + (m[1] ?? '') + '" filterUnits="userSpaceOnUse"');
    }
  });

  it('une feuille a effets s ecrit avec le filtre apres ses attributs d aujourd hui ; un groupe au rang filtre, avant son nom', () => {
    const e = ecrireDessin({ vb: [0, 0, 100, 100], formes: [carre({ opacite: 0.5, effets: { flou: { ecart: 2 } } })] }, 3);
    expect(e).toContain('<path d="M10 10L40 10L40 30L10 30Z" fill="#c81e28" opacity="0.5" filter="url(#ed-f-');
    expect(e).toContain('<filter id="ed-f-');
    expect(e).toContain('filterUnits="userSpaceOnUse" x="4" y="4" width="42" height="32" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="2"/></filter>');
    const g = grouper({ vb: [0, 0, 100, 100], formes: [carre()] }, ['f1'], 'Nuage').dessin;
    const d: DessinSvg = { ...g, groupes: { g1: { ...(g.groupes?.g1 ?? { id: 'g1', visible: true, verrouille: false }), opacite: 0.5, effets: { flou: { ecart: 1 } } } } };
    expect(ecrireDessin(d, 3)).toMatch(/<g opacity="0.5" filter="url\(#ed-f-[0-9a-f]{14}\)" data-ed-nom="Nuage">/);
  });

  it('mille formes au meme effet et au meme cadre n ecrivent qu une definition', () => {
    const formes = Array.from({ length: 1000 }, (_, i) => carre({ id: 'f' + (i + 1), effets: { flou: { ecart: 1 } } }));
    expect(ecrireDessin({ vb: [0, 0, 100, 100], formes }, 3).match(/<filter /g)).toHaveLength(1);
  });

  it('le point fixe sur des effets tires au hasard (flous, ombres, groupes, matrices, deux precisions)', () => {
    const graine = 20261027;
    let x = graine;
    const hasard = () => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return x / 2 ** 32; };
    const n = (a: number, b: number) => a + (b - a) * hasard();
    const effet = (): Effets => {
      const flou = hasard() < 0.6 ? (hasard() < 0.5 ? { ecart: n(0.01, 9) } : { ecart: n(0.01, 9), ecartY: n(0.01, 9) }) : undefined;
      const ombre = !flou || hasard() < 0.5 ? { dx: n(-20, 20), dy: n(-20, 20), ecart: n(0, 6), couleur: '#' + Math.floor(hasard() * 0xffffff).toString(16).padStart(6, '0'), opacite: Math.round(hasard() * 1000) / 1000 } : undefined;
      return { ...(flou ? { flou } : {}), ...(ombre ? { ombre } : {}) };
    };
    for (let k = 0; k < 300; k++) {
      const m: Matrice = [n(-2, 2), n(-2, 2), n(-2, 2), n(-2, 2), n(-50, 150), n(-50, 150)];
      const f1 = carre({ effets: effet(), contour: hasard() < 0.5 ? '#000000' : null, epaisseur: n(0, 4) });
      const f2 = carre({ id: 'f2', d: [{ c: 'M', p: [n(0, 90), n(0, 90)] }, { c: 'C', p: [n(0, 90), n(0, 90), n(0, 90), n(0, 90), n(0, 90), n(0, 90)] }, { c: 'Z', p: [] }], ...(hasard() < 0.5 ? { effets: effet() } : {}) });
      let d: DessinSvg = { vb: [0, 0, 100, 100], formes: [f1, f2] };
      if (hasard() < 0.5) { const g = grouper(d, ['f2']).dessin; d = { ...g, groupes: { g1: { ...(g.groupes?.g1 ?? { id: 'g1', visible: true, verrouille: false }), effets: effet() } } }; }
      if (hasard() < 0.5) d = transformer(d, d.formes.map(f => f.id), m);
      for (const precision of [2, 3]) {
        const e = ecrireDessin(d, precision);
        const relu = riche(e);
        expect(ecrireDessin(relu.dessin, precision), 'graine ' + graine + ', tirage ' + k + ' : ' + e).toBe(e);
        expect(relu.ignores.filter(i => !i.startsWith('un flou ou une ombre dont l’écart')), 'graine ' + graine + ', tirage ' + k).toEqual([]);
      }
    }
  });
});

describe('le nuancier lit la couleur d une ombre', () => {
  it('une ombre apporte sa couleur, sur la silhouette de la forme, a l opacite de la forme par la sienne ; un flou rien', () => {
    const f = carre({ opacite: 0.8, effets: { ombre: { dx: 2, dy: 2, ecart: 1, couleur: '#1d3557', opacite: 0.5 } } });
    expect(apportsDe(f)).toEqual([{ hex: '#c81e28', opacite: 0.8, surface: 600 }, { hex: '#1d3557', opacite: 0.4, surface: 600 }]);
    expect(apportsDe(carre({ effets: { flou: { ecart: 3 } } }))).toEqual(apportsDe(carre()));
    expect(apportsDe(carre({ effets: { ombre: { dx: 2, dy: 2, ecart: 1, couleur: '#1d3557', opacite: 0 } } }))).toEqual(apportsDe(carre()));
  });
});

describe('le cout des effets (methode de l ADR-0008)', () => {
  it('lit et ecrit un dessin de 200 formes a effets sous le budget, et consigne la mesure', () => {
    const filtres = '<filter id="f" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="1.5"/></filter>'
      + '<filter id="o" color-interpolation-filters="sRGB"><feDropShadow dx="2" dy="3" stdDeviation="2" flood-color="#1d3557" flood-opacity="0.5"/></filter>';
    const formes = Array.from({ length: 200 }, (_, i) => {
      const x = (i % 20) * 10, y = Math.floor(i / 20) * 10;
      return '<path d="M' + x + ' ' + y + 'C' + (x + 4) + ' ' + (y - 2) + ' ' + (x + 8) + ' ' + (y + 2) + ' ' + (x + 8) + ' ' + (y + 6) + 'L' + x + ' ' + (y + 8) + 'Z" fill="#c81e28" filter="url(#' + (i % 2 ? 'o' : 'f') + ')"/>';
    }).join('');
    const svg = SVG(filtres + formes, '0 0 200 100');
    // Cinq tours d'echauffement (le compilateur a la volee), puis la mediane de 31.
    const mesurer = (f: () => void): number => { for (let k = 0; k < 5; k++) f(); const t: number[] = []; for (let k = 0; k < 31; k++) { const t0 = performance.now(); f(); t.push(performance.now() - t0); } return t.sort((a, b) => a - b)[15] ?? 0; };
    let d: DessinSvg = riche(svg).dessin;
    const lecture = mesurer(() => { d = riche(svg).dessin; });
    // L'ecriture d'un dessin neuf a chaque fois (la memoire par forme ne sert qu'aux reecritures) : une translation.
    const ecriture = mesurer(() => { ecrireDessin(transformer(d, d.formes.map(f => f.id), translation(0.5, 0)), 3); });
    const plat = SVG(formes.replace(/ filter="url\(#[fo]\)"/g, ''), '0 0 200 100');
    const lecturePlate = mesurer(() => { riche(plat); });
    console.log('[mesure effets] 200 formes : lecture ' + lecture.toFixed(2) + ' ms (sans effets ' + lecturePlate.toFixed(2) + ' ms), ecriture ' + ecriture.toFixed(2) + ' ms (mediane de 31)');
    expect(d.formes.filter(f => f.effets)).toHaveLength(200);
    expect(lecture).toBeLessThan(200);
    expect(ecriture).toBeLessThan(200);
  });
});

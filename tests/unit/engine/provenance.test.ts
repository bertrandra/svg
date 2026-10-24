import { describe, it, expect } from 'vitest';
import {
  coller, combiner, dupliquer, ecrireDessin, inserer, lireDessin, marquerOrigine, modifier, originesDe, regrouper, separer, statistiques, type DessinSvg
} from '../../../src/engine/editionSvg.js';
import { appliquerBooleen } from '../../../src/engine/booleens.js';
import { mentionOrigines } from '../../../src/model/credits.js';
import { nettoyerSvg } from '../../../src/util/svg.js';

// La provenance des formes (CC BY 3.0 de game-icons.net) : elle se pose a l'insertion d'une forme de la bibliotheque, traverse
// toutes les operations qui copient ou fusionnent des formes, et s'ecrit (data-origine + <metadata>) ; absente, elle ne change aucun octet.

const A = 'game-icons:abacus', B = 'game-icons:3d-glasses';
const SANS = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10h30v30h-30z" fill="#c81e28"/><path d="M50 50h30v30h-30z" fill="#1428a0"/></svg>';

const lire = (svg: string): DessinSvg => { const r = lireDessin(svg); if ('erreur' in r) throw new Error(r.erreur); return r.dessin; };
/** Un dessin dont f1 vient de A et f2 de B. */
const credite = (): DessinSvg => { const d = lire(SANS); return { ...d, formes: d.formes.map((f, i) => ({ ...f, origine: [i === 0 ? A : B] })) }; };
const origines = (d: DessinSvg) => d.formes.map(f => f.origine ?? null);

describe('sans origine, rien ne change', () => {
  it('un dessin sans forme creditee s ecrit sans <metadata> ni data-origine', () => {
    const svg = ecrireDessin(lire(SANS), 3);
    expect(svg).not.toContain('<metadata');
    expect(svg).not.toContain('data-origine');
    expect(svg).toBe('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><path d="M10 10L40 10L40 40L10 40Z" fill="#c81e28"/><path d="M50 50L80 50L80 80L50 80Z" fill="#1428a0"/></svg>');
  });

  it('les operations qui copient ou fusionnent n ajoutent pas de champ origine a des formes qui n en ont pas', () => {
    const d = lire(SANS);
    const toutes = [
      dupliquer(d, ['f1'], 5, 5).dessin, combiner(d, ['f1', 'f2']).dessin, coller(d, d.formes, 3, 3).dessin,
      inserer(d, d, { x: 0, y: 0, l: 50, h: 50 }).dessin, appliquerBooleen(d, ['f1', 'f2'], 'union').dessin, regrouper(d).dessin
    ];
    for (const r of toutes) for (const f of r.formes) expect('origine' in f, JSON.stringify(f).slice(0, 60)).toBe(false);
  });
});

describe('l ecriture et la relecture', () => {
  it('ecrit data-origine sur chaque forme creditee et un <metadata> en tete, avec la mention et la liste des origines', () => {
    const svg = ecrireDessin(credite(), 3);
    expect(svg).toContain('<metadata>' + mentionOrigines([A]) + ' Origines : ' + B + ', ' + A + '.</metadata>');
    expect(svg).toContain('fill="#c81e28" data-origine="' + A + '"/>');
    expect(svg).toContain('fill="#1428a0" data-origine="' + B + '"/>');
    expect(svg.indexOf('<metadata>')).toBeLessThan(svg.indexOf('<path'));
  });

  it('se relit a l identique : les origines reviennent sur les bonnes formes et la reecriture est la meme, octet pour octet', () => {
    const premier = ecrireDessin(credite(), 3);
    const relu = lire(premier);
    expect(origines(relu)).toEqual([[A], [B]]);
    expect(ecrireDessin(relu, 3)).toBe(premier);
  });

  it('le nettoyage du SVG garde le <metadata> et les data-origine (il ne retire que ce qui s execute ou va chercher ailleurs)', () => {
    const svg = ecrireDessin(credite(), 3);
    expect(nettoyerSvg(svg)?.svg).toBe(svg);
    expect(origines(lire(nettoyerSvg(svg)?.svg ?? ''))).toEqual([[A], [B]]);
  });

  it('ne met dans le <metadata> que les formes ecrites : une forme masquee ne credite plus rien', () => {
    const d = modifier(credite(), ['f1', 'f2'], { visible: false });
    expect(ecrireDessin(d, 3)).not.toContain('<metadata');
    const seule = modifier(credite(), ['f1'], { visible: false });
    expect(ecrireDessin(seule, 3)).toContain('Origines : ' + B + '.</metadata>');
    expect(originesDe(seule.formes.filter(f => f.visible))).toEqual([B]);
  });

  it('ecarte une origine inconnue ou mal formee, lue d un SVG qui n est pas le notre (rien d arbitraire dans la mention)', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h5v5z" fill="#000000" data-origine="inconnu:x game-icons:a&quot;b &lt;script&gt;"/><path d="M1 1h5v5z" fill="#000000" data-origine="game-icons:ok ok"/></svg>';
    expect(origines(lire(svg))).toEqual([null, ['game-icons:ok']]);
  });

  it('compte la mention dans le poids du dessin', () => {
    expect(statistiques(credite()).octets).toBe(ecrireDessin(credite()).length);
    expect(statistiques(credite()).octets).toBeGreaterThan(statistiques(lire(SANS)).octets + 200);
  });
});

describe('les operations gardent la provenance', () => {
  it('marquerOrigine credite toutes les formes, ajoute aux origines existantes, et ignore une origine invalide', () => {
    const d = marquerOrigine(lire(SANS), A);
    expect(origines(d)).toEqual([[A], [A]]);
    expect(origines(marquerOrigine(credite(), A))).toEqual([[A], [B, A]]);
    expect(marquerOrigine(lire(SANS), 'n importe quoi')).toEqual(lire(SANS));
  });

  it('dupliquer et coller gardent l origine de la copie', () => {
    const d = credite();
    const dup = dupliquer(d, ['f1'], 5, 5).dessin;
    expect(origines(dup)).toEqual([[A], [A], [B]]);
    expect(origines(coller(d, d.formes.slice(1), 2, 2).dessin)).toEqual([[A], [B], [B]]);
  });

  it('inserer garde l origine des formes inserees, et separer celle de chaque morceau', () => {
    const d = lire(SANS);
    const r = inserer(d, credite(), { x: 0, y: 0, l: 40, h: 40 });
    expect(origines(r.dessin)).toEqual([null, null, [A], [B]]);
    const deux = { ...credite(), formes: [{ ...au0(credite()), d: [...au0(credite()).d, { c: 'M' as const, p: [60, 60] }, { c: 'L' as const, p: [70, 60] }, { c: 'L' as const, p: [70, 70] }, { c: 'Z' as const, p: [] }] }] };
    expect(origines(separer(deux, 'f1').dessin)).toEqual([[A], [A]]);
  });

  it('combiner garde l union des origines de toutes les formes reunies, meme celles de formes sans origine', () => {
    const d = credite();
    const r = combiner(d, ['f1', 'f2']);
    expect(r.dessin.formes).toHaveLength(1);
    expect(r.dessin.formes[0]?.origine).toEqual([B, A].sort());
    const mixte = { ...d, formes: [...d.formes, { ...au0(lire(SANS)), id: 'f3' }] };
    expect(combiner(mixte, ['f1', 'f3']).dessin.formes.find(f => f.id === 'f3')?.origine).toEqual([A]);
  });

  it('les booleens gardent l union des origines des formes de l operation, la soustraite comprise', () => {
    const d = credite();
    const chevauche: DessinSvg = { ...d, formes: [au0(d), { ...au(d, 1), d: [{ c: 'M', p: [20, 20] }, { c: 'L', p: [60, 20] }, { c: 'L', p: [60, 60] }, { c: 'L', p: [20, 60] }, { c: 'Z', p: [] }] }] };
    for (const op of ['union', 'soustraction', 'intersection', 'exclusion'] as const) {
      const r = appliquerBooleen(chevauche, ['f1', 'f2'], op);
      expect(r.erreur, op).toBeUndefined();
      expect(r.dessin.formes.find(f => f.id === r.id)?.origine, op).toEqual([B, A].sort());
    }
  });

  it('regrouper garde les origines des formes voisines qu il reunit', () => {
    const d = lire('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0h5v5z" fill="#000000"/><path d="M50 50h5v5z" fill="#000000"/></svg>');
    const c: DessinSvg = { ...d, formes: [{ ...au(d, 0), origine: [A] }, { ...au(d, 1), origine: [B] }] };
    const r = regrouper(c);
    expect(r.reunies).toBe(1);
    expect(r.dessin.formes).toHaveLength(1);
    expect(r.dessin.formes[0]?.origine).toEqual([B, A].sort());
  });
});

function au(d: DessinSvg, i: number) { const f = d.formes[i]; if (!f) throw new Error('forme absente'); return f; }
function au0(d: DessinSvg) { return au(d, 0); }

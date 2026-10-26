// Les cas hostiles des effets (ADR-0012, etape 7 ; annexe 7 §5, annexe 8 §5.7) lus en mode RICHE. Le corpus commun (corpus.test.ts)
// les fait passer par le chemin de la page en mode plat, qui les refuse comme avant (« un filtre ») ; ici, la lecture qui les accepte :
// elle ne leve jamais, termine vite, refuse en nommant ce qu'elle doit refuser, borne et dit ce qui deborde, et ce qu'elle ouvre
// s'ecrit propre (la specification de l'ecriture et ses extensions, le nettoyage qui n'y change rien) et se relit en point fixe. Chaque
// cas passe par les deux chemins : le texte tel qu'un hote le donne, puis le texte nettoye comme la page le lit.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ecrireDessin, lireDessin, MSG_EFFETS, NOEUDS_A_EFFET_MAX, REFUS_EFFETS, REFUS_IDIOMES, msgDecalageBorne, msgEcartBorne, refusPrimitive, type DessinSvg
} from '../../../src/engine/editionSvg.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { violationsEcriture, violationsNettoyage } from './invariants.js';
import { BUDGET_MS } from './passage.js';

const DOSSIER = resolve(__dirname, '../../fixtures/hostile');

interface Cas {
  readonly fichier: string;
  /** Le texte brut, lu en riche : il s'ouvre (et ce que la lecture doit dire), ou il est refuse (un morceau de la phrase). */
  readonly brut: { readonly ouvre: true; readonly ignores?: readonly string[]; readonly verifier?: (d: DessinSvg) => void } | { readonly refus: string };
}

const CAS: readonly Cas[] = [
  {
    fichier: 'v2-effets-ecart-1e308.svg',
    brut: {
      ouvre: true, ignores: [msgEcartBorne(25), MSG_EFFETS.ombreAnisotrope],
      verifier: d => expect(d.formes.map(f => [f.effets?.flou?.ecart, f.effets?.ombre?.ecart])).toEqual([[25, undefined], [undefined, 25], [25, undefined]])
    }
  },
  {
    fichier: 'v2-effets-nan.svg',
    brut: {
      ouvre: true, ignores: [MSG_EFFETS.illisible],
      verifier: d => expect(d.formes.map(f => f.effets)).toEqual([undefined, { ombre: { dx: 2, dy: 2, ecart: 0, couleur: '#000000', opacite: 1 } }, undefined, undefined])
    }
  },
  {
    fichier: 'v2-effets-region-infinie.svg',
    brut: { ouvre: true, verifier: d => expect(d.formes.every(f => f.effets?.flou !== undefined)).toBe(true) }
  },
  {
    fichier: 'v2-effets-decalage-enorme.svg',
    brut: { ouvre: true, ignores: [msgDecalageBorne(100)], verifier: d => expect([d.formes[0]?.effets?.ombre?.dx, d.formes[0]?.effets?.ombre?.dy]).toEqual([100, -100]) }
  },
  { fichier: 'v2-effets-primitive-interdite.svg', brut: { refus: refusPrimitive('feImage') + ', ' + refusPrimitive('feTurbulence') } },
  { fichier: 'v2-effets-filtre-externe.svg', brut: { refus: REFUS_EFFETS.externe } },
  { fichier: 'v2-effets-href-cycle.svg', brut: { refus: REFUS_EFFETS.heritage } },
  { fichier: 'v2-effets-chaine-demesuree.svg', brut: { refus: REFUS_EFFETS.long } },
  { fichier: 'v2-effets-fusion-demesuree.svg', brut: { refus: REFUS_EFFETS.long } },
  { fichier: 'v2-effets-matrice-couleurs.svg', brut: { refus: REFUS_IDIOMES.matrice } }
];

/** Une lecture riche mesuree : jamais d'exception, sous le budget. */
function lireMesure(svg: string): ReturnType<typeof lireDessin> {
  const t0 = performance.now();
  const r = lireDessin(svg, { modele: 'riche' });
  expect(performance.now() - t0, 'temps de lecture').toBeLessThan(BUDGET_MS * 2);
  return r;
}

/** Ce qu'une lecture reussie ecrit : propre, stable au nettoyage, en point fixe. */
function verifierEcriture(d: DessinSvg): void {
  const e = ecrireDessin(d, 3);
  expect(violationsEcriture(e)).toEqual([]);
  expect(violationsNettoyage(e)).toEqual([]);
  expect(nettoyerSvg(e)?.svg).toBe(e);
  expect(e).not.toMatch(/Infinity|NaN|e\+|e-\d/);
  const relu = lireDessin(e, { modele: 'riche' });
  if ('erreur' in relu) throw new Error('l ecriture ne se relit pas : ' + relu.erreur);
  expect(ecrireDessin(relu.dessin, 3), 'point fixe').toBe(e);
}

describe('les effets hostiles, en lecture riche', () => {
  it('chaque fichier v2-effets-* du corpus hostile a son cas, et inversement', () => {
    const index = JSON.parse(readFileSync(resolve(DOSSIER, 'index.json'), 'utf8')) as { fichiers: Array<{ fichier: string }> };
    const fichiers = index.fichiers.map(l => l.fichier).filter(n => n.startsWith('v2-effets-')).sort();
    expect(CAS.map(c => c.fichier).sort()).toEqual(fichiers);
  });

  for (const c of CAS) {
    it(c.fichier, () => {
      const texte = readFileSync(resolve(DOSSIER, c.fichier), 'utf8');
      // Le mode plat refuse tout filtre avec la phrase d'aujourd'hui (sauf ce que rien ne cite plus).
      const plat = lireDessin(texte);
      if (!c.fichier.includes('externe')) expect('erreur' in plat ? plat.erreur : 'ouvert').toContain('un filtre');
      const brut = lireMesure(texte);
      if ('refus' in c.brut) {
        expect('erreur' in brut ? brut.erreur : 'ouvert').toContain(c.brut.refus);
      } else {
        if ('erreur' in brut) throw new Error(brut.erreur);
        for (const m of c.brut.ignores ?? []) expect(brut.ignores).toContain(m);
        c.brut.verifier?.(brut.dessin);
        verifierEcriture(brut.dessin);
      }
      // Le chemin de la page : le nettoyage d'abord ; ce qui s'ouvre s'ecrit propre, ce qui se refuse se refuse en nommant.
      const net = nettoyerSvg(texte);
      if (net) {
        const page = lireMesure(net.svg);
        if (!('erreur' in page)) verifierEcriture(page.dessin);
        else expect(page.erreur).toMatch(/^Ce SVG /);
      }
    });
  }

  it('cent mille primitives : refusees a la borne, sans rien evaluer, et vite', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><filter id="f">' + '<feOffset dx="1"/>'.repeat(100_000) + '</filter><rect width="10" height="10" filter="url(#f)"/></svg>';
    const t0 = performance.now();
    const r = lireDessin(svg, { modele: 'riche' });
    expect(performance.now() - t0).toBeLessThan(20_000);
    expect('erreur' in r ? r.erreur : '').toContain(REFUS_EFFETS.long);
  }, 60_000);

  it('des resultats partages (seize fusions de seize couches, seize compositions emboitees) : evalues sans exploser, et vite', () => {
    const chaine = (n: number, corps: string) => Array.from({ length: n }, () => corps).join('');
    const cas = [
      '<filter id="f"><feOffset dx="1" in="SourceAlpha" result="r"/>' + chaine(15, '<feMerge result="r">' + '<feMergeNode in="r"/>'.repeat(16) + '</feMerge>') + '</filter>',
      '<filter id="f"><feOffset dx="1" in="SourceAlpha" result="r"/>' + chaine(15, '<feComposite in="r" in2="r" operator="out" result="r"/>') + '</filter>',
      '<filter id="f"><feOffset dx="1" in="SourceAlpha" result="r"/>' + chaine(15, '<feComposite in="r" in2="r" operator="arithmetic" k2="1" k3="1" result="r"/>') + '</filter>'
    ];
    for (const filtre of cas) {
      const t0 = performance.now();
      const r = lireDessin('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">' + filtre + '<rect width="10" height="10" filter="url(#f)"/></svg>', { modele: 'riche' });
      expect(performance.now() - t0).toBeLessThan(BUDGET_MS);
      expect('erreur' in r ? r.erreur : 'ouvert').toMatch(/^Ce SVG /);
    }
  });

  it('au-dela de deux mille noeuds a effet, les suivants perdent leurs effets, et c est dit', () => {
    const n = NOEUDS_A_EFFET_MAX + 3;
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><filter id="f" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="0.5"/></filter>'
      + Array.from({ length: n }, (_, i) => '<rect x="' + (i % 90) + '" y="' + Math.floor(i / 90) + '" width="1" height="1" filter="url(#f)"/>').join('') + '</svg>';
    const r = lireDessin(svg, { modele: 'riche' });
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.dessin.formes.filter(f => f.effets).length).toBe(NOEUDS_A_EFFET_MAX);
    expect(r.ignores).toContain(MSG_EFFETS.nombreux);
  });
});

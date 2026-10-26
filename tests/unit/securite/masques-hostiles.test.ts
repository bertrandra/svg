// Les cas hostiles des masques d'opacite (ADR-0012, etape 6 ; annexe 7 §5) lus en mode RICHE. Le corpus commun (corpus.test.ts) les
// fait passer par le chemin de la page en mode plat, qui les refuse comme avant (ou les ouvre sans ce que le nettoyage a neutralise) ;
// ici, la lecture qui les accepte : elle ne leve jamais, termine vite, refuse en nommant ce qu'elle doit refuser, et ce qu'elle ouvre
// s'ecrit propre et se relit en point fixe. Chaque cas passe par les deux chemins : le texte tel qu'un hote le donne, puis le texte
// nettoye comme la page le lit.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireDessin, lireDessin, verifierDessin, REFUS_MASQUES, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { violationsEcriture, violationsNettoyage } from './invariants.js';
import { BUDGET_MS } from './passage.js';

const DOSSIER = resolve(__dirname, '../../fixtures/hostile');

interface Cas {
  readonly fichier: string;
  /** Le texte brut, lu en riche : il s'ouvre (et ce que la lecture doit dire), ou il est refuse (un morceau de la phrase). */
  readonly brut: { readonly ouvre: true; readonly verifier?: (d: DessinSvg) => void } | { readonly refus: string };
}

const CAS: readonly Cas[] = [
  { fichier: 'v2-masques-cycle-soi.svg', brut: { refus: REFUS_MASQUES.cycle } },
  { fichier: 'v2-masques-cycle-croise.svg', brut: { refus: REFUS_MASQUES.cycle } },
  { fichier: 'v2-masques-use-vers-soi.svg', brut: { refus: REFUS_MASQUES.cycle } },
  { fichier: 'v2-masques-bombe-imbrication.svg', brut: { refus: REFUS_MASQUES.profondeur } },
  { fichier: 'v2-masques-bombe-references.svg', brut: { refus: REFUS_MASQUES.trop } },
  { fichier: 'v2-masques-renvoi-externe.svg', brut: { refus: REFUS_MASQUES.externe } },
  { fichier: 'v2-masques-css-image.svg', brut: { refus: REFUS_MASQUES.css } },
  { fichier: 'v2-masques-css-degrade.svg', brut: { refus: REFUS_MASQUES.css } },
  { fichier: 'v2-masques-porteur-use.svg', brut: { refus: 'un masque ou une découpe (posé sur un clone <use>)' } },
  { fichier: 'v2-masques-region-demesuree.svg', brut: { refus: 'des coordonnées démesurées' } }
];

/** Une lecture riche mesuree : jamais d'exception, sous le budget. */
function lireMesure(svg: string): ReturnType<typeof lireDessin> {
  const t0 = performance.now();
  const r = lireDessin(svg, { modele: 'riche' });
  expect(performance.now() - t0, 'temps de lecture').toBeLessThan(BUDGET_MS * 2);
  return r;
}

/** Ce qu'une lecture reussie ecrit : un arbre bien forme, propre, stable au nettoyage, en point fixe. */
function verifierEcriture(d: DessinSvg): void {
  expect(verifierDessin(d)).toEqual([]);
  const e = ecrireDessin(d, 3);
  expect(violationsEcriture(e)).toEqual([]);
  expect(violationsNettoyage(e)).toEqual([]);
  expect(nettoyerSvg(e)?.svg).toBe(e);
  const relu = lireDessin(e, { modele: 'riche' });
  if ('erreur' in relu) throw new Error('l ecriture ne se relit pas : ' + relu.erreur);
  expect(ecrireDessin(relu.dessin, 3), 'point fixe').toBe(e);
}

describe('les masques hostiles, en lecture riche', () => {
  it('chaque fichier v2-masques-* du corpus hostile a son cas, et inversement', () => {
    const index = JSON.parse(readFileSync(resolve(DOSSIER, 'index.json'), 'utf8')) as { fichiers: Array<{ fichier: string }> };
    const fichiers = index.fichiers.map(l => l.fichier).filter(n => n.startsWith('v2-masques-')).sort();
    expect(CAS.map(c => c.fichier).sort()).toEqual(fichiers);
  });

  for (const c of CAS) {
    it(c.fichier, () => {
      const texte = readFileSync(resolve(DOSSIER, c.fichier), 'utf8');
      const brut = lireMesure(texte);
      if ('refus' in c.brut) {
        expect('erreur' in brut ? brut.erreur : 'ouvert').toContain(c.brut.refus);
      } else {
        if ('erreur' in brut) throw new Error(brut.erreur);
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
      // Le mode plat refuse toujours, avec la phrase d'aujourd'hui, ce que le nettoyage n'a pas neutralise.
      const plat = lireDessin(texte);
      expect('erreur' in plat ? plat.erreur : 'ouvert').toMatch(/un masque ou une découpe|ouvert/);
    });
  }

  it('un <mask> de 100 000 formes est refuse a la borne des definitions, sans rien construire de plus, et vite', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><mask id="m">' + '<rect width="1" height="1" fill="#fff"/>'.repeat(100_000)
      + '</mask></defs><g mask="url(#m)"><rect width="100" height="100"/></g></svg>';
    const r = lireMesure(svg);
    expect('erreur' in r ? r.erreur : 'ouvert').toContain(REFUS_MASQUES.trop);
  });

  it('une bombe de references juste sous la borne se lit, et termine vite', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><mask id="m">' + '<rect width="1" height="1" fill="#fff"/>'.repeat(40)
      + '</mask></defs>' + '<g mask="url(#m)"><rect width="100" height="100"/></g>'.repeat(490) + '</svg>';
    const r = lireMesure(svg);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(Object.keys(r.dessin.groupes ?? {})).toHaveLength(490);
    expect(verifierDessin(r.dessin)).toEqual([]);
  });
});

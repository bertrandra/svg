// Les cas hostiles des degrades (ADR-0012, etape 3 ; annexe 7 §5, annexe 8 §5.2) lus en mode RICHE. Le corpus commun
// (corpus.test.ts) les fait passer par le chemin de la page en mode plat, qui les refuse comme avant ; ici, la lecture qui les
// accepte : elle ne leve jamais, termine vite, refuse en nommant ce qu'elle doit refuser, et ce qu'elle ouvre s'ecrit propre (la
// specification de l'ecriture et ses extensions, le nettoyage qui n'y change rien) et se relit en point fixe. Chaque cas passe par
// les deux chemins : le texte tel qu'un hote le donne, puis le texte nettoye comme la page le lit.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireDessin, lireDessin, MSG_DEGRADES, REFUS_DEGRADES, type DessinSvg } from '../../../src/engine/editionSvg.js';
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
  { fichier: 'v2-degrades-cycle-href.svg', brut: { refus: REFUS_DEGRADES.cycle } },
  {
    fichier: 'v2-degrades-arrets-massifs.svg',
    brut: { ouvre: true, ignores: [MSG_DEGRADES.arrets], verifier: d => expect(d.formes[0]?.peintureRemplissage && 'arrets' in d.formes[0].peintureRemplissage ? d.formes[0].peintureRemplissage.arrets.length : 0).toBe(64) }
  },
  {
    fichier: 'v2-degrades-matrice-nulle.svg',
    brut: { ouvre: true, ignores: [MSG_DEGRADES.degenere], verifier: d => expect(d.formes.map(f => [f.remplissage, f.contour, f.peintureRemplissage, f.peintureContour])).toEqual([[null, null, undefined, undefined], [null, null, undefined, undefined]]) }
  },
  { fichier: 'v2-degrades-stop-color-url.svg', brut: { ouvre: true, verifier: d => expect(d.formes[0]?.remplissage).toBe('#000000') } },
  { fichier: 'v2-degrades-href-externe.svg', brut: { refus: REFUS_DEGRADES.externe } },
  { fichier: 'v2-degrades-fill-url-externe.svg', brut: { refus: REFUS_DEGRADES.externe } },
  { fichier: 'v2-degrades-chaine-longue.svg', brut: { refus: REFUS_DEGRADES.chaine } },
  { fichier: 'v2-degrades-reference-absente.svg', brut: { ouvre: true, ignores: [MSG_DEGRADES.reference], verifier: d => expect(d.formes.map(f => f.remplissage)).toEqual([null, '#ff0000']) } },
  { fichier: 'v2-degrades-autre-genre.svg', brut: { ouvre: true, ignores: [MSG_DEGRADES.reference], verifier: d => expect(d.formes.map(f => [f.remplissage, f.contour])).toEqual([[null, null], ['#c81e28', null]]) } },
  { fichier: 'v2-degrades-coordonnees-demesurees.svg', brut: { refus: 'un dégradé aux coordonnées démesurées' } },
  {
    fichier: 'v2-degrades-id-double.svg',
    brut: { ouvre: true, verifier: d => expect(d.formes[0]?.peintureRemplissage?.genre).toBe('lineaire') }
  },
  { fichier: 'v2-degrades-style-url.svg', brut: { refus: REFUS_DEGRADES.externe } },
  { fichier: 'v2-degrades-entites-javascript.svg', brut: { refus: REFUS_DEGRADES.transformation } },
  { fichier: 'v2-degrades-unite-inconnue.svg', brut: { refus: REFUS_DEGRADES.unite } }
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
  const relu = lireDessin(e, { modele: 'riche' });
  if ('erreur' in relu) throw new Error('l ecriture ne se relit pas : ' + relu.erreur);
  expect(ecrireDessin(relu.dessin, 3), 'point fixe').toBe(e);
}

describe('les degrades hostiles, en lecture riche', () => {
  it('chaque fichier v2-degrades-* du corpus hostile a son cas, et inversement', () => {
    const index = JSON.parse(readFileSync(resolve(DOSSIER, 'index.json'), 'utf8')) as { fichiers: Array<{ fichier: string }> };
    const fichiers = index.fichiers.map(l => l.fichier).filter(n => n.startsWith('v2-degrades-')).sort();
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

  it('un million d arrets : refuse par la borne des elements ; juste en dessous, la lecture n en garde que 64, le dit, et termine', () => {
    const svg = (n: number) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><linearGradient id="g">' + '<stop offset="0" stop-color="#c81e28"/>'.repeat(n) + '</linearGradient><rect width="10" height="10" fill="url(#g)"/></svg>';
    const million = lireDessin(svg(1_000_000), { modele: 'riche' });
    expect('erreur' in million ? million.erreur : '').toContain('éléments');
    const t0 = performance.now();
    const r = lireDessin(svg(999_000), { modele: 'riche' });
    // La borne est l'analyse du texte (40 Mo), pas la lecture des arrets : le temps accorde est celui des cas volumineux.
    expect(performance.now() - t0).toBeLessThan(20_000);
    if ('erreur' in r) throw new Error(r.erreur);
    expect(r.ignores).toContain(MSG_DEGRADES.arrets);
    const p = r.dessin.formes[0]?.peintureRemplissage;
    expect(p && 'arrets' in p ? p.arrets.length : 0).toBe(64);
  }, 60_000);
});

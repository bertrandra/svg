// Les cas hostiles des motifs (ADR-0012, etape 9 ; annexe 7 §5) lus en mode RICHE. Le corpus commun (corpus.test.ts) les fait passer
// par le chemin de la page en mode plat, qui les refuse comme avant ; ici, la lecture qui les accepte : elle ne leve jamais, termine
// vite, refuse en nommant ce qu'elle doit refuser, et ce qu'elle ouvre s'ecrit propre et se relit en point fixe. Chaque cas passe par
// les deux chemins : le texte tel qu'un hote le donne, puis le texte nettoye comme la page le lit.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireDessin, lireDessin, verifierDessin, REFUS_MOTIFS, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { violationsEcriture, violationsNettoyage } from './invariants.js';
import { BUDGET_MS } from './passage.js';

const DOSSIER = resolve(__dirname, '../../fixtures/hostile');

const CAS: ReadonlyArray<{ readonly fichier: string; readonly refus: string }> = [
  { fichier: 'v2-motifs-cycle-soi.svg', refus: REFUS_MOTIFS.cycle },
  { fichier: 'v2-motifs-cycle-croise.svg', refus: REFUS_MOTIFS.cycle },
  { fichier: 'v2-motifs-cycle-href.svg', refus: REFUS_MOTIFS.cycle },
  { fichier: 'v2-motifs-recursif.svg', refus: REFUS_MOTIFS.profondeur },
  { fichier: 'v2-motifs-bombe-references.svg', refus: REFUS_MOTIFS.trop },
  { fichier: 'v2-motifs-tuile-minuscule.svg', refus: REFUS_MOTIFS.vide },
  { fichier: 'v2-motifs-tuile-nulle.svg', refus: REFUS_MOTIFS.vide },
  { fichier: 'v2-motifs-tuile-vide.svg', refus: REFUS_MOTIFS.vide },
  { fichier: 'v2-motifs-renvoi-externe.svg', refus: REFUS_MOTIFS.externe },
  { fichier: 'v2-motifs-demesure.svg', refus: REFUS_MOTIFS.demesure },
  { fichier: 'v2-motifs-image.svg', refus: REFUS_MOTIFS.image }
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

describe('les motifs hostiles, en lecture riche', () => {
  it('chaque fichier v2-motifs-* du corpus hostile a son cas, et inversement', () => {
    const index = JSON.parse(readFileSync(resolve(DOSSIER, 'index.json'), 'utf8')) as { fichiers: Array<{ fichier: string }> };
    const fichiers = index.fichiers.map(l => l.fichier).filter(n => n.startsWith('v2-motifs-')).sort();
    expect(CAS.map(c => c.fichier).sort()).toEqual(fichiers);
  });

  for (const c of CAS) {
    it(c.fichier, () => {
      const texte = readFileSync(resolve(DOSSIER, c.fichier), 'utf8');
      const brut = lireMesure(texte);
      expect('erreur' in brut ? brut.erreur : 'ouvert').toContain(c.refus);
      // Le chemin de la page : le nettoyage d'abord ; ce qui s'ouvre s'ecrit propre, ce qui se refuse se refuse en nommant.
      const net = nettoyerSvg(texte);
      if (net) {
        const page = lireMesure(net.svg);
        if (!('erreur' in page)) verifierEcriture(page.dessin);
        else expect(page.erreur).toMatch(/^Ce SVG /);
      }
      // Le mode plat refuse toujours, avec la phrase d'aujourd'hui.
      const plat = lireDessin(texte);
      expect('erreur' in plat ? plat.erreur : 'ouvert').toMatch(/un dégradé ou un motif|une image/);
    });
  }

  it('une tuile de 30 000 formes est refusee a la borne des definitions, sans rien construire de plus, et vite', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="p" patternUnits="userSpaceOnUse" width="10" height="10">'
      + '<rect width="1" height="1"/>'.repeat(30_000) + '</pattern></defs><rect width="100" height="100" fill="url(#p)"/></svg>';
    const r = lireMesure(svg);
    expect('erreur' in r ? r.erreur : 'ouvert').toContain(REFUS_MOTIFS.trop);
  });

  it('mille formes au meme motif ne lisent sa tuile qu une fois, partagent la peinture, et s ecrivent en une definition', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="p" patternUnits="userSpaceOnUse" width="10" height="10">'
      + '<rect width="1" height="1"/>'.repeat(5000) + '</pattern></defs>' + '<rect width="100" height="100" fill="url(#p)"/>'.repeat(1000) + '</svg>';
    const r = lireMesure(svg);
    if ('erreur' in r) throw new Error(r.erreur);
    const peintures = new Set(r.dessin.formes.map(f => f.peintureRemplissage));
    expect(peintures.size).toBe(1);
    expect(verifierDessin(r.dessin)).toEqual([]);
    expect(ecrireDessin(r.dessin, 3).match(/<pattern /g)).toHaveLength(1);
  });
});

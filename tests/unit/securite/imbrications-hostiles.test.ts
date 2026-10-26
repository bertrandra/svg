// Les cas hostiles des imbrications (ADR-0012, etape 13c ; annexe 7 §5) lus en mode RICHE. Le corpus commun (corpus.test.ts) les fait
// passer par le chemin de la page en mode plat, qui refuse le SVG imbrique comme avant ; ici, la lecture qui les accepte : elle ne leve
// jamais, termine vite, refuse en nommant ce qu'elle doit refuser, et ce qu'elle ouvre s'ecrit propre et se relit en point fixe. Chaque
// cas passe par les deux chemins : le texte tel qu'un hote le donne, puis le texte nettoye comme la page le lit.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ecrireDessin, lireDessin, verifierDessin, MSG_GROUPES_PROFONDS, REFUS_IMBRICATIONS, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { violationsEcriture, violationsNettoyage } from './invariants.js';
import { BUDGET_MS } from './passage.js';

const DOSSIER = resolve(__dirname, '../../fixtures/hostile');

interface Cas {
  readonly fichier: string;
  /** Le texte brut, lu en riche : il s'ouvre (et ce qu'on y verifie), ou il est refuse (un morceau de la phrase). */
  readonly brut: { readonly ouvre: true; readonly verifier?: (d: DessinSvg) => void } | { readonly refus: string };
}

const CAS: readonly Cas[] = [
  { fichier: 'v2-imbrications-use-recursif.svg', brut: { refus: 'un cycle de clones <use> (« #boucle » se contient lui-même)' } },
  { fichier: 'v2-imbrications-use-croise.svg', brut: { refus: 'un cycle de clones <use>' } },
  {
    fichier: 'v2-imbrications-viewbox-nul.svg',
    brut: {
      ouvre: true,
      // Le carre de depart, le rectangle d'un viewBox negatif (ignore, comme un navigateur) et celui d'un viewBox illisible ; rien pour les
      // cadres nuls ni pour les viewBox vides.
      verifier: d => {
        expect(d.formes.map(f => f.remplissage)).toEqual(['#1f5fb0', '#2a8c4a', '#f2b705']);
        expect(Object.values(d.groupes ?? {}).every(g => g.decoupe?.contenu.formes.length === 1)).toBe(true);
      }
    }
  },
  { fichier: 'v2-imbrications-demesure.svg', brut: { refus: REFUS_IMBRICATIONS.demesure } },
  { fichier: 'v2-imbrications-unites.svg', brut: { refus: REFUS_IMBRICATIONS.longueur } },
  { fichier: 'v2-imbrications-profondeur.svg', brut: { refus: MSG_GROUPES_PROFONDS } }
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

describe('les imbrications hostiles, en lecture riche', () => {
  it('chaque fichier v2-imbrications-* du corpus hostile a son cas, et inversement', () => {
    const index = JSON.parse(readFileSync(resolve(DOSSIER, 'index.json'), 'utf8')) as { fichiers: Array<{ fichier: string }> };
    const fichiers = index.fichiers.map(l => l.fichier).filter(n => n.startsWith('v2-imbrications-')).sort();
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
      // Le mode plat refuse toujours, avec la phrase d'aujourd'hui.
      const plat = lireDessin(texte);
      expect('erreur' in plat ? plat.erreur : 'ouvert').toContain('un SVG imbriqué');
    });
  }

  it('une bombe de clones d un <svg> imbrique s arrete a la borne des clones, et termine vite', () => {
    let defs = '<svg id="s0" width="4" height="4"><rect width="1" height="1"/></svg>';
    for (let i = 1; i <= 6; i++) defs += '<svg id="s' + i + '" width="40" height="40">' + ('<use href="#s' + (i - 1) + '"/>').repeat(10) + '</svg>';
    const r = lireMesure('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>' + defs + '</defs><use href="#s6"/></svg>');
    expect('erreur' in r ? r.erreur : 'ouvert').toContain('des clones <use> trop nombreux');
  });
});

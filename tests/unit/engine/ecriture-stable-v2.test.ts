// L'ecriture du modele v2 est figee octet pour octet, comme celle du modele plat (ecriture-stable.test.ts), dans un dossier a part :
// les references v1 ne se reecrivent jamais ici (annexe 7 §2). Chaque cas lit son entree en mode RICHE (ou construit son dessin),
// lui applique son operation, l'ecrit comme « Enregistrer » (precision 3, puis le nettoyage), compare a
// `tests/fixtures/svg/v2/<nom>.attendu.svg`, et verifie le point fixe : relire ce qu'on a ecrit le reecrit a l'identique.
//
// Les cas viennent des fichiers `v2/cas-*.ts` (un par etape, voir v2/cas.ts). Reecrire les references v2 apres un changement voulu :
//
//   ACTUALISER_REFERENCES=1 npx vitest run tests/unit/engine/ecriture-stable-v2.test.ts
//
// Cela ne touche que `tests/fixtures/svg/v2/` ; relire le diff, fichier par fichier, avant de le committer.

import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ecrireDessin, lireDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import type { CasV2 } from './v2/cas.js';

const DOSSIER = resolve(__dirname, '../../fixtures/svg/v2');
const DOSSIER_CAS = resolve(__dirname, 'v2');
const ACTUALISER = process.env.ACTUALISER_REFERENCES === '1';

const fichiersCas = existsSync(DOSSIER_CAS) ? readdirSync(DOSSIER_CAS).filter(n => /^cas-[a-z0-9-]+\.ts$/.test(n)).sort() : [];
const CAS: CasV2[] = [];
for (const n of fichiersCas) {
  const m = (await import(pathToFileURL(join(DOSSIER_CAS, n)).href)) as { CAS?: readonly CasV2[] };
  CAS.push(...(m.CAS ?? []));
}

const lireRiche = (svg: string): DessinSvg => {
  const r = lireDessin(svg, { modele: 'riche' });
  if ('erreur' in r) throw new Error(r.erreur);
  return r.dessin;
};
const ecrireEnregistre = (d: DessinSvg): string => nettoyerSvg(ecrireDessin(d, 3))?.svg ?? '';

describe('l ecriture du modele v2 est figee octet pour octet', () => {
  it('les cas ont des noms uniques et chaque reference de v2/ a son cas', () => {
    const noms = CAS.map(c => c.nom);
    expect(new Set(noms).size).toBe(noms.length);
    const references = existsSync(DOSSIER) ? readdirSync(DOSSIER).filter(n => n.endsWith('.attendu.svg')).map(n => n.slice(0, -'.attendu.svg'.length)) : [];
    expect(references.filter(r => !noms.includes(r)), 'references orphelines').toEqual([]);
    for (const c of CAS) expect(Number(c.entree !== undefined) + Number(c.dessin !== undefined), c.nom + ' : une entree ou un dessin').toBe(1);
  });

  for (const c of CAS) {
    it('ecrit « ' + c.nom + ' » comme sa reference, et se relit en point fixe', () => {
      const depart = c.dessin ? c.dessin() : lireRiche(readFileSync(join(DOSSIER, (c.entree ?? '') + '.svg'), 'utf8'));
      const ecrit = ecrireEnregistre(c.operation ? c.operation(depart) : depart);
      const reference = join(DOSSIER, c.nom + '.attendu.svg');
      if (ACTUALISER) { mkdirSync(DOSSIER, { recursive: true }); writeFileSync(reference, ecrit); }
      expect(existsSync(reference), 'reference absente : ACTUALISER_REFERENCES=1 npx vitest run tests/unit/engine/ecriture-stable-v2.test.ts').toBe(true);
      expect(ecrit).toBe(readFileSync(reference, 'utf8').replace(/\r\n/g, '\n'));
      expect(ecrireEnregistre(lireRiche(ecrit)), 'point fixe').toBe(ecrit);
    });
  }
});

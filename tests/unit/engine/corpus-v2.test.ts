// Le corpus d'acceptation « s'ouvre fidelement » (ADR-0012, annexe 7 §7) : des fichiers reconstruits a la main d'apres les idiomes
// d'export connus (formes originales, l'idiome seul), dans `tests/fixtures/svg/corpus/`. Chacun s'ouvre en mode riche par le chemin
// de la page (nettoyage, puis lecture) sans refus, dit exactement les pertes declarees, s'ecrit comme sa reference et se relit en
// point fixe. Un dossier a part : il n'entre ni dans les references v1 gelees ni dans le corpus du fuzzing.
//
//   ACTUALISER_REFERENCES=1 npx vitest run tests/unit/engine/corpus-v2.test.ts     (reecrit les references du corpus ; les relire)

import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ecrireDessin, lireDessin, verifierDessin, type DessinSvg } from '../../../src/engine/editionSvg.js';
import { nettoyerSvg } from '../../../src/util/svg.js';
import { violationsEcriture } from '../securite/invariants.js';
import type { CasV2 } from './v2/cas.js';

const DOSSIER = resolve(__dirname, '../../fixtures/svg/corpus');

/** Les cas v2 de toutes les etapes : certains jouent un fichier du corpus (les degrades, etape 3). */
const CAS_V2: CasV2[] = [];
for (const n of readdirSync(resolve(__dirname, 'v2')).filter(x => /^cas-[a-z0-9-]+\.ts$/.test(x)).sort()) {
  CAS_V2.push(...(((await import('./v2/' + n.replace(/\.ts$/, '.js'))) as { CAS?: readonly CasV2[] }).CAS ?? []));
}
const ACTUALISER = process.env.ACTUALISER_REFERENCES === '1';

interface Entree {
  readonly fichier: string;
  /** L'etape a partir de laquelle le fichier s'ouvre (annexe 7 §7). */
  readonly etape: number;
  /** Ce que la lecture doit dire laisser tomber, exactement. */
  readonly ignores: readonly string[];
  /** Les noms de groupes que la lecture doit garder, dans l'ordre. */
  readonly noms: readonly string[];
}

const CORPUS: readonly Entree[] = [
  { fichier: 'inkscape-calques', etape: 1, ignores: [], noms: ['Fond', 'Motif', 'g2'] },
  { fichier: 'illustrator-calque', etape: 1, ignores: [], noms: ['Calque_1', 'Formes', 'Traits'] }
];

const lirePage = (svg: string): { dessin: DessinSvg; ignores: readonly string[] } => {
  const propre = nettoyerSvg(svg);
  if (!propre) throw new Error('le nettoyage refuse');
  const r = lireDessin(propre.svg, { modele: 'riche' });
  if ('erreur' in r) throw new Error(r.erreur);
  return r;
};
const ecrireEnregistre = (d: DessinSvg): string => nettoyerSvg(ecrireDessin(d, 3))?.svg ?? '';

describe('le corpus d acceptation du modele v2', () => {
  it('chaque fichier du dossier est joue : par une ligne d ici (et sa reference a cote), ou par un cas v2 (`entree: \'../corpus/…\'`)', () => {
    const sur = readdirSync(DOSSIER).filter(n => n.endsWith('.svg') && !n.endsWith('.attendu.svg')).map(n => n.slice(0, -4)).sort();
    const parCas = CAS_V2.flatMap(c => (c.entree?.startsWith('../corpus/') ? [c.entree.slice('../corpus/'.length)] : []));
    for (const c of CORPUS) expect(sur, c.fichier).toContain(c.fichier);
    expect(sur.filter(n => !CORPUS.some(c => c.fichier === n) && !parCas.includes(n)), 'fichiers du corpus que rien ne joue').toEqual([]);
    const references = readdirSync(DOSSIER).filter(n => n.endsWith('.attendu.svg')).map(n => n.slice(0, -'.attendu.svg'.length));
    expect(references.filter(r => !CORPUS.some(c => c.fichier === r)), 'references orphelines').toEqual([]);
  });

  for (const c of CORPUS) {
    it(c.fichier + ' s ouvre fidelement en mode riche', () => {
      const texte = readFileSync(join(DOSSIER, c.fichier + '.svg'), 'utf8');
      const { dessin, ignores } = lirePage(texte);
      expect(ignores).toEqual(c.ignores);
      expect(verifierDessin(dessin)).toEqual([]);
      expect(Object.values(dessin.groupes ?? {}).map(g => g.nom ?? '')).toEqual(c.noms);
      const ecrit = ecrireEnregistre(dessin);
      const reference = join(DOSSIER, c.fichier + '.attendu.svg');
      if (ACTUALISER) writeFileSync(reference, ecrit);
      expect(existsSync(reference), 'reference absente : ACTUALISER_REFERENCES=1 npx vitest run tests/unit/engine/corpus-v2.test.ts').toBe(true);
      expect(ecrit).toBe(readFileSync(reference, 'utf8').replace(/\r\n/g, '\n'));
      expect(violationsEcriture(ecrit)).toEqual([]);
      expect(ecrireEnregistre(lirePage(ecrit).dessin), 'point fixe').toBe(ecrit);
      // En mode plat, le meme fichier s'ouvre aussi : ses groupes se fondent, comme avant.
      expect('erreur' in lireDessin(nettoyerSvg(texte)?.svg ?? '')).toBe(false);
    });
  }
});

// Les references d'ecriture du modele plat sont gelees (ADR-0012, annexe 7 §2, porte G3). `ACTUALISER_REFERENCES=1` reste l'outil
// des decisions de version majeure, mais il ne suffit plus : une reference v1 reecrite ou retiree fait echouer ce test tant que le
// manifeste `tests/fixtures/svg/references-v1.sha256` n'est pas edite lui aussi, donc tant que l'ecart n'apparait pas en revue, avec
// sa phrase de CHANGELOG. Aucune etape du chantier v2 (0 a 13) ne le fait ; une reference AJOUTEE (un outil neuf, ADR-0015) ne gene
// pas, elle entre au manifeste quand on le regenere.
//
// Regenerer le manifeste apres une decision relue (et seulement alors) :
//
//   ACTUALISER_MANIFESTE_V1=1 npx vitest run tests/unit/engine/references-v1-gelees.test.ts

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const DOSSIER = resolve(__dirname, '../../fixtures/svg');
const MANIFESTE = join(DOSSIER, 'references-v1.sha256');
const COMMANDE = 'ACTUALISER_MANIFESTE_V1=1 npx vitest run tests/unit/engine/references-v1-gelees.test.ts';

/** L'empreinte d'un fichier de reference, lu en LF quoi qu'en ait fait le depot sous Windows (autocrlf). */
const empreinte = (nom: string): string => createHash('sha256').update(readFileSync(join(DOSSIER, nom), 'utf8').replace(/\r\n/g, '\n')).digest('hex');

/** Les fichiers geles : tout fichier du dossier (pas des sous-dossiers comme `v2/` ou `corpus/`), le manifeste excepte. */
const geles = (): string[] => readdirSync(DOSSIER).filter(n => n !== 'references-v1.sha256' && statSync(join(DOSSIER, n)).isFile()).sort();

const lireManifeste = (): Map<string, string> => new Map(readFileSync(MANIFESTE, 'utf8').split(/\r?\n/).filter(Boolean).map(l => {
  const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(l);
  if (!m) throw new Error('ligne de manifeste illisible : ' + l);
  return [m[2] ?? '', m[1] ?? ''] as const;
}));

describe('les references du modele plat sont gelees', () => {
  if (process.env.ACTUALISER_MANIFESTE_V1 === '1') {
    it('regenere le manifeste', () => {
      writeFileSync(MANIFESTE, geles().map(n => empreinte(n) + '  ' + n).join('\n') + '\n');
    });
    return;
  }

  it('le manifeste existe et couvre les references d ecriture et les empreintes de la bibliotheque', () => {
    expect(existsSync(MANIFESTE), 'manifeste absent : ' + COMMANDE).toBe(true);
    const noms = [...lireManifeste().keys()];
    expect(noms.filter(n => n.endsWith('.attendu.svg')).length).toBeGreaterThan(90);
    expect(noms).toContain('bibliotheque.empreintes.txt');
  });

  it('aucune reference gelee n a ete reecrite ni retiree', () => {
    const ecarts: string[] = [];
    for (const [nom, attendue] of lireManifeste()) {
      if (!existsSync(join(DOSSIER, nom))) ecarts.push(nom + ' : retiree');
      else if (empreinte(nom) !== attendue) ecarts.push(nom + ' : reecrite');
    }
    expect(ecarts, 'REFERENCE V1 CHANGEE : un SVG reecrit aujourd hui doit l etre a l identique demain. Un tel changement est un evenement de '
      + 'VERSION MAJEURE : l annoncer dans CHANGELOG.md, le faire relire, puis regenerer le manifeste (' + COMMANDE + ').').toEqual([]);
  });
});

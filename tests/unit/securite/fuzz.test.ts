// Fuzzing deterministe (docs/securite.md) : un melange de SVG sains (formes de la bibliotheque, references d'ecriture) et hostiles
// (corpus), muté par un generateur a graine. Pour chaque entree : aucune exception, aucun appel plus long que le budget, tous les
// invariants de sortie, et la relecture de sa propre ecriture redonne les memes octets (voir passage.ts).
//
//   FUZZ_ITERATIONS=20000 npx vitest run tests/unit/securite/fuzz.test.ts     (exploration longue)
//   FUZZ_GRAINES=7,8,9 …                                                       (d'autres graines)
//   FUZZ_ECRIRE=1 …                                                            (ecrit l'entree reduite d'un echec dans tests/fixtures/regressions)

import { describe, it, expect } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { passer } from './passage.js';
import { aleatoire, engendrer, muterPlusieurs, reduire } from './mutateur.js';

const RACINE = resolve(__dirname, '../../fixtures');
const ITERATIONS = Number(process.env.FUZZ_ITERATIONS ?? 12000);
const GRAINES = (process.env.FUZZ_GRAINES ?? '1,2,3,4').split(',').map(Number);

const lire = (chemin: string): string => new TextDecoder('utf-8').decode(readFileSync(chemin));

/** Les SVG de depart : des formes de la bibliotheque, les references d'ecriture (petites), le corpus hostile (petit). */
function graines(): string[] {
  const jeu = JSON.parse(readFileSync(resolve(__dirname, '../../../node_modules/@iconify-json/game-icons/icons.json'), 'utf8')) as { icons: Record<string, { body: string }> };
  const noms = Object.keys(jeu.icons).sort();
  const formes = Array.from({ length: 40 }, (_, k) => noms[Math.floor((k * noms.length) / 40)] ?? '').map(n => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${jeu.icons[n]?.body ?? ''}</svg>`);
  const fichiers = (dossier: string, filtre: (nom: string) => boolean): string[] => readdirSync(dossier).filter(filtre).sort().map(n => lire(resolve(dossier, n))).filter(t => t.length < 30_000);
  return [
    ...formes,
    ...fichiers(resolve(RACINE, 'svg'), n => n.endsWith('.svg') && !n.endsWith('.attendu.svg')),
    ...fichiers(resolve(RACINE, 'hostile'), n => n.endsWith('.svg'))
  ];
}

/** Le verdict d'une entree : une phrase qui dit ce qui ne va pas, ou null. */
function verdict(texte: string): string | null {
  const p = passer(texte);
  if (p.plantage) return 'exception : ' + p.plantage;
  return p.defauts.length ? p.defauts[0] ?? 'defaut' : null;
}

function echec(graine: number, rang: number, texte: string, raison: string): never {
  const reduit = reduire(texte, t => verdict(t) !== null);
  if (process.env.FUZZ_ECRIRE === '1') {
    const dossier = resolve(RACINE, 'regressions');
    mkdirSync(dossier, { recursive: true });
    writeFileSync(resolve(dossier, `fuzz-${graine}-${rang}.svg`), reduit);
  }
  throw new Error(`graine ${graine}, rang ${rang} : ${raison}\nentree reduite (${reduit.length} car.) :\n${reduit.slice(0, 600)}`);
}

describe('le fuzzing deterministe', () => {
  const depart = graines();

  it('dispose d\'un corpus de depart varie', () => {
    expect(depart.length).toBeGreaterThan(100);
  });

  for (const graine of GRAINES) {
    it(`graine ${graine} : ${Math.round(ITERATIONS / GRAINES.length)} entrees mutees ou engendrees ne cassent aucun invariant`, () => {
      const r = aleatoire(graine);
      const n = Math.round(ITERATIONS / GRAINES.length);
      for (let rang = 0; rang < n; rang++) {
        const texte = r() < 0.2 ? engendrer(r) : muterPlusieurs(depart[Math.floor(r() * depart.length)] ?? '', r);
        const raison = verdict(texte);
        if (raison !== null) echec(graine, rang, texte, raison);
      }
    }, 600_000);
  }

  it('rejoue le corpus de regressions : chaque entree que le fuzzer a un jour fait echouer reste inoffensive', () => {
    const dossier = resolve(RACINE, 'regressions');
    const fichiers = existsSync(dossier) ? readdirSync(dossier).filter(n => n.endsWith('.svg')).sort() : [];
    for (const nom of fichiers) {
      const raison = verdict(lire(resolve(dossier, nom)));
      expect(raison, nom).toBeNull();
    }
  });
});

// La fonte a trait unique (ADR-0022) : la vraie police SVG du paquet hersheytext, lue comme scripts/polices.mjs la lit,
// composee par le moteur en traces OUVERTS, sans remplissage, avec les lettres accentuees du francais.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sousChemins } from '../../../src/engine/editionSvg.js';
import { composerBloc } from '../../../src/engine/texte/bloc.js';
import { au } from '../../../src/util/tableaux.js';
import { glyphesTrait, validerTrait, type DonneesTrait } from '../../../src/io/policesTrait.js';
import { pathToFileURL } from 'node:url';

const RACINE = resolve(__dirname, '../../..');
interface Script { lirePoliceSvg: (texte: string) => unknown; POLICES_TRAIT: Array<[string, string, string, string]> }
const { lirePoliceSvg, POLICES_TRAIT } = (await import(pathToFileURL(resolve(RACINE, 'scripts/polices.mjs')).href)) as Script;
const [, , paquet, fichier] = au(POLICES_TRAIT, 0);
const donnees = lirePoliceSvg(readFileSync(resolve(RACINE, 'node_modules', paquet, fichier), 'utf8')) as DonneesTrait;

describe('la police a trait unique', () => {
  it('se lit : em de 1000, les lettres ASCII et celles du francais', () => {
    expect(validerTrait(donnees)).not.toBeNull();
    expect(donnees.unitesParEm).toBe(1000);
    const g = glyphesTrait(donnees);
    for (const c of 'AZaz09éèêëàâçîïôûùüÉÀÇ«»€?!') expect(g.possede?.(c), c).toBe(true);
    // L'apostrophe typographique s'ecrit avec l'apostrophe droite.
    expect(g.possede?.('’')).toBe(true);
  });

  it('se compose en traces ouverts : une ligne par trait de plume, Y vers le bas', () => {
    const g = glyphesTrait(donnees);
    const lettres = composerBloc({ texte: 'Lune', taille: 100, interlettrage: 0, interligne: 1.2, alignement: 'gauche', ligatures: false }, g);
    expect(lettres.map(l => l.caractere)).toEqual(['L', 'u', 'n', 'e']);
    // « L » : deux traits ouverts (la hampe et la barre), qui ne reviennent pas a leur depart.
    const L = lettres[0]?.d ?? [];
    expect(L.some(c => c.c === 'Z')).toBe(false);
    expect(sousChemins(L).length).toBeGreaterThanOrEqual(1);
    // Au-dessus de la ligne de base : des y negatifs (repere de composition, Y vers le bas).
    expect(Math.min(...L.flatMap(c => c.p.filter((_, i) => i % 2 === 1)))).toBeLessThan(-50);
  });

  it('refuse des donnees mal formees', () => {
    for (const v of [null, 3, { unitesParEm: 0, avance: 1, glyphes: [] }, { unitesParEm: 1000, avance: 1, glyphes: [['a', 'x', '']] }]) expect(validerTrait(v)).toBeNull();
  });

  it('un caractere absent avance sans rien dessiner', () => {
    const g = glyphesTrait(donnees);
    expect(g.contour('一', 0, 0, 10)).toEqual([]);
    expect(g.avance('一')).toBe(donnees.avance);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tracerNom } from '../../../src/engine/texte/apercuNom.js';
import { CADRE_APERCU, decoderApercu, encoderApercu } from '../../../src/model/apercusPolices.js';
import type { Glyphes } from '../../../src/engine/editionSvg.js';
import { lirePolice } from '../../../src/io/polices.js';
import { glyphesCarres } from './glyphesFactices.js';

// Le nom d'une famille dessine dans sa propre fonte (ADR-0026) : compose par le moteur au corps du cadre, en entiers, simplifie
// sans s'ecarter de plus d'un demi-pixel, coupe a la largeur du cadre ; null quand il ne se dessine pas.

const entiers = (t: ReturnType<typeof tracerNom>) => (t?.commandes ?? []).every(c => c.p.every(v => Number.isInteger(v)));

describe('le nom dessine dans sa fonte', () => {
  it('se compose au corps du cadre, commence en x = 0, en coordonnees entieres', () => {
    const t = tracerNom('AB', glyphesCarres);
    expect(t).not.toBeNull();
    // Deux carres de 16 x 22,4 unites (500 x 700 a 32/1000), le second a 19,2 : arrondis a l'unite.
    expect(t?.largeur).toBe(36);
    expect(t?.commandes).toEqual([
      { c: 'M', p: [0, 0] }, { c: 'L', p: [16, 0] }, { c: 'L', p: [16, -22] }, { c: 'L', p: [0, -22] }, { c: 'Z', p: [] },
      { c: 'M', p: [19, 0] }, { c: 'L', p: [35, 0] }, { c: 'L', p: [35, -22] }, { c: 'L', p: [19, -22] }, { c: 'Z', p: [] }
    ]);
    expect(entiers(t)).toBe(true);
    // Le code compact le rend a l'identique.
    expect(t && decoderApercu(encoderApercu(t))).toEqual(t);
  });

  it('ne dessine rien pour un nom vide ou une lettre que la fonte n a pas', () => {
    expect(tracerNom('  ', glyphesCarres)).toBeNull();
    const sansZ: Glyphes = { ...glyphesCarres, possede: c => c !== 'Z' };
    expect(tracerNom('Zilla', sansZ)).toBeNull();
    expect(tracerNom('Illa', sansZ)).not.toBeNull();
  });

  it('s arrete a la largeur du cadre : une ligne de la liste n en montre pas plus', () => {
    const t = tracerNom('W'.repeat(80), glyphesCarres);
    // Une lettre tous les 28,8 unites (900 a 32/1000) : celles qui commencent avant 400.
    expect(t?.commandes.filter(c => c.c === 'M')).toHaveLength(Math.ceil(CADRE_APERCU.largeurMax / 28.8));
    expect(t?.largeur).toBeLessThanOrEqual(CADRE_APERCU.largeurMax + 16);
  });

  it('simplifie ce que l oeil ne voit pas, garde ce qu il voit', () => {
    // Une lettre faite d'un trait decoupe en dix segments alignes, d'une courbe presque plate et d'une vraie courbe.
    const g: Glyphes = {
      unitesParEm: 32,
      contour: (_c, x, y) => [
        { type: 'M', x, y },
        ...Array.from({ length: 10 }, (_, i) => ({ type: 'L' as const, x: x + 2 * (i + 1), y: y + (i % 2 ? 0.2 : 0) })),
        { type: 'Q', x1: x + 25, y1: y + 0.3, x: x + 30, y },
        { type: 'Q', x1: x + 30, y1: y - 30, x: x, y: y - 20 },
        { type: 'Z' }
      ],
      avance: () => 32,
      crenage: () => 0
    };
    const t = tracerNom('a', g);
    expect(t?.commandes.map(c => c.c)).toEqual(['M', 'L', 'Q', 'Z']);
    expect(t?.commandes[1]).toEqual({ c: 'L', p: [30, 0] });
  });

  it('dessine une vraie fonte en quelques centaines de caracteres de code', () => {
    const octets = readFileSync(resolve(__dirname, '../../../node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'));
    const police = lirePolice('inter', 'Inter', octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength));
    expect(police).not.toBeNull();
    if (!police) return;
    const t = tracerNom('Roboto Slab', police.glyphes);
    expect(t).not.toBeNull();
    expect(entiers(t)).toBe(true);
    const code = t ? encoderApercu(t) : '';
    expect(code.length).toBeGreaterThan(100);
    expect(code.length).toBeLessThan(1500);
    // Toutes les lettres tiennent dans le cadre (ni capitale ni descendante d'Inter n'en sortent).
    const ys = t?.commandes.flatMap(c => c.p.filter((_, i) => i % 2 === 1)) ?? [];
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-CADRE_APERCU.haut);
    expect(Math.max(...ys)).toBeLessThanOrEqual(CADRE_APERCU.bas);
    // Le meme nom, la meme fonte : le meme trace (deterministe).
    expect(tracerNom('Roboto Slab', police.glyphes)).toEqual(t);
  });
});

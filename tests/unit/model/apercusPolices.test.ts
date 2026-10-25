import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validerCatalogue } from '../../../src/model/cataloguePolices.js';
import { CADRE_APERCU, LIMITES_APERCUS, cheminApercu, decoderApercu, encoderApercu, validerApercus, vueApercu, type TraceApercu } from '../../../src/model/apercusPolices.js';

// Le codage compact des apercus de polices (ADR-0026) : un aller-retour exact, des bornes, et une annexe qu'on ne croit pas
// sur parole (ADR-0014 : une valeur hostile est refusee, sans lever).

const TRACE: TraceApercu = {
  largeur: 120,
  commandes: [
    { c: 'M', p: [1, 2] }, { c: 'L', p: [5, 2] }, { c: 'L', p: [5, -20] }, { c: 'Q', p: [6, 7, 8, 9] }, { c: 'Q', p: [10, -20, 30, 9] }, { c: 'Z', p: [] },
    { c: 'M', p: [50, -3] }, { c: 'C', p: [51, -2, 53, -4, 55, 6] }, { c: 'C', p: [60, 0, 61, 1, 62, 2] }, { c: 'L', p: [119, -29] }, { c: 'Z', p: [] },
    // Un contour ouvert (une police a trait unique) et un depart apres une fermeture, loin du precedent.
    { c: 'M', p: [-700, 900] }, { c: 'L', p: [700, -900] }
  ]
};

describe('le codage compact des apercus', () => {
  it('fait un aller-retour exact, lettres de commande non repetees', () => {
    const code = encoderApercu(TRACE);
    expect(decoderApercu(code)).toEqual(TRACE);
    // Ni guillemet, ni barre oblique inverse, ni chevron : le code se pose tel quel dans du JSON et une balise <script>.
    expect(code).toMatch(/^[0-9a-zA-Z\-_+*~^!]+$/);
    // Apres un M, des points sans lettre sont des L ; un second Q ne redit pas sa lettre.
    expect(code.match(/L/g)?.length).toBe(1);
    expect(code.match(/Q/g)?.length).toBe(1);
  });

  it('code un petit ecart en un caractere, un grand en plusieurs', () => {
    const court = encoderApercu({ largeur: 0, commandes: [{ c: 'M', p: [15, -15] }] });
    expect(court).toHaveLength(1 + 1 + 2);
    const long = encoderApercu({ largeur: 4096, commandes: [{ c: 'M', p: [4096, -4096] }] });
    expect(decoderApercu(long)).toEqual({ largeur: 4096, commandes: [{ c: 'M', p: [4096, -4096] }] });
  });

  it('ecrit un chemin SVG absolu en entiers et une boite du cadre commun', () => {
    expect(cheminApercu({ largeur: 10, commandes: [{ c: 'M', p: [1, -2] }, { c: 'Q', p: [3, 4, -5, 6] }, { c: 'Z', p: [] }] })).toBe('M1-2Q3 4-5 6Z');
    expect(vueApercu({ largeur: 42, commandes: [] })).toBe('0 ' + -CADRE_APERCU.haut + ' 42 ' + (CADRE_APERCU.haut + CADRE_APERCU.bas));
  });

  it('refuse un code mal forme sans lever', () => {
    const bon = encoderApercu(TRACE);
    for (const mauvais of [
      '', 'M', bon + 'Q1', bon.slice(0, -1) + '"', '0L22', '0Z', '0M22Z2', '0M\\', '0M<', '0M!!!!!!!!!!', // tronque, pas de M en tete, nombre apres Z, caracteres interdits, nombre sans fin
      '0M' + 'o'.repeat(10), // continuation sans fin
      'x'.repeat(LIMITES_APERCUS.code + 1)
    ]) expect(() => decoderApercu(mauvais), mauvais).not.toThrow();
    for (const mauvais of ['', 'M', bon + 'Q1', '0L22', '0Z', '0M22Z2', '0M\\', '0M<', '0M!!!!!!!!!!', 'x'.repeat(LIMITES_APERCUS.code + 1)]) expect(decoderApercu(mauvais), mauvais).toBeNull();
    // Une coordonnee hors des bornes.
    expect(decoderApercu(encoderApercu({ largeur: 1, commandes: [{ c: 'M', p: [0, 0] }, { c: 'L', p: [LIMITES_APERCUS.coordonnee + 1, 0] }] }))).toBeNull();
    // Trop de commandes.
    const beaucoup = encoderApercu({ largeur: 1, commandes: [{ c: 'M', p: [0, 0] }, ...Array.from({ length: LIMITES_APERCUS.commandes }, (_, i) => ({ c: 'L' as const, p: [i % 2, 0] }))] });
    expect(decoderApercu(beaucoup)).toBeNull();
    expect(decoderApercu(42 as unknown as string)).toBeNull();
  });
});

describe('la validation de l annexe des apercus', () => {
  const code = encoderApercu(TRACE);
  const annexe = (apercus: unknown, autres: Record<string, unknown> = {}) => ({ format: 1, instantane: '2026-10-25', corps: CADRE_APERCU.corps, haut: CADRE_APERCU.haut, bas: CADRE_APERCU.bas, apercus, ...autres });

  it('lit une annexe valide en table de codes par cle de famille', () => {
    const a = validerApercus(annexe({ 'fontsource:roboto': code, 'velvetyne:basteleur': code }));
    expect('erreur' in a).toBe(false);
    if ('erreur' in a) return;
    expect(a.apercus.get('fontsource:roboto')).toBe(code);
    expect(a.apercus.size).toBe(2);
  });

  it('refuse une valeur hostile ou trop grosse, sans lever', () => {
    const grosCode = code.length > 0 ? code : '0';
    const nombreux = Object.fromEntries(Array.from({ length: LIMITES_APERCUS.entrees + 1 }, (_, i) => ['fontsource:f' + i, grosCode]));
    // Assez de codes valides pour depasser la taille totale, sans depasser le nombre d'entrees ni la longueur d'un code.
    const lourd = 'M' + '0'.repeat(LIMITES_APERCUS.code - 2);
    const total = Object.fromEntries(Array.from({ length: Math.ceil(LIMITES_APERCUS.total / lourd.length) + 1 }, (_, i) => ['fontsource:t' + i, '0' + lourd]));
    const piege = JSON.parse('{"__proto__": "0M00", "fontsource:a": "0M00"}') as unknown;
    const cas: unknown[] = [
      null, 42, 'texte', [], annexe([]), annexe(null), annexe({}, { format: 2 }), annexe({}, { instantane: 'hier' }), annexe({}, { corps: 64 }),
      annexe({ 'roboto': code }), annexe({ 'fontsource:../x': code }), annexe({ 'fontsource:roboto': 12 }), annexe({ 'fontsource:roboto': '' }),
      annexe({ 'fontsource:roboto': code + '"' }), annexe({ 'fontsource:roboto': 'x'.repeat(LIMITES_APERCUS.code + 1) }),
      annexe(nombreux), annexe(total), annexe(piege)
    ];
    for (const c of cas) {
      expect(() => validerApercus(c)).not.toThrow();
      expect('erreur' in validerApercus(c)).toBe(true);
    }
  });
});

describe('les apercus commis (data/apercus-polices.json)', () => {
  const lire = (f: string): unknown => JSON.parse(readFileSync(resolve(__dirname, '../../..', f), 'utf8'));
  const catalogue = validerCatalogue(lire('data/catalogue-polices.json'));
  const annexe = validerApercus(lire('data/apercus-polices.json'));

  it('passent la validation de la page, chacun pour une famille de l index, du meme instantane', () => {
    if ('erreur' in catalogue) throw new Error(catalogue.erreur);
    if ('erreur' in annexe) throw new Error(annexe.erreur);
    expect(annexe.instantane).toBe(catalogue.instantane);
    const cles = new Set(catalogue.familles.map(f => f.depot + ':' + f.id));
    expect([...annexe.apercus.keys()].filter(c => !cles.has(c))).toEqual([]);
    // Presque toutes les familles ont un apercu ; celles qui n'en ont pas sont dites par le script (ADR-0026).
    expect(annexe.apercus.size).toBeGreaterThan(0.97 * catalogue.familles.length);
  });

  it('se decodent tous, dans les bornes, a la largeur du cadre', () => {
    if ('erreur' in annexe) throw new Error(annexe.erreur);
    const illisibles: string[] = [];
    for (const [cle, code] of annexe.apercus) {
      const t = decoderApercu(code);
      if (!t || !t.commandes.length || t.commandes[0]?.c !== 'M' || t.largeur > CADRE_APERCU.largeurMax + 4 * CADRE_APERCU.corps) illisibles.push(cle);
    }
    expect(illisibles).toEqual([]);
  });
});

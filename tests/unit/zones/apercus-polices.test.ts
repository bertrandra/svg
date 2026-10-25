import { describe, expect, it } from 'vitest';
import { apercuDePolice, apercuPrepare, choisirApercu } from '../../../src/zones/apercusPolices.js';
import { CADRE_APERCU, encoderApercu, validerApercus, type AnnexeApercus } from '../../../src/model/apercusPolices.js';
import { ANNEXE_APERCUS, chargeurApercus } from '../../../src/io/apercusPolices.js';
import type { Glyphes } from '../../../src/engine/editionSvg.js';
import type { Police } from '../../../src/io/polices.js';
import { glyphesCarres } from '../engine/glyphesFactices.js';

// Ce que montre une ligne de « Toutes les polices » (ADR-0026) : la police deja chargee d'abord, puis l'apercu prepare, puis le
// nom ecrit ; et l'annexe qui les livre, lue comme une annexe d'inconnu (ADR-0014).

const police = (id: string, glyphes: Glyphes = glyphesCarres, nature: Police['nature'] = 'contour'): Police => ({ id, nom: id, glyphes, nature, version: '0123456789abcd' });
const CODE = encoderApercu({ largeur: 20, commandes: [{ c: 'M', p: [0, 0] }, { c: 'L', p: [20, 0] }, { c: 'L', p: [20, -20] }, { c: 'Z', p: [] }] });
const brute = (apercus: Record<string, string>) => ({ format: 1, instantane: '2026-10-25', corps: CADRE_APERCU.corps, haut: CADRE_APERCU.haut, bas: CADRE_APERCU.bas, apercus });
function annexe(apercus: Record<string, string>): AnnexeApercus {
  const a = validerApercus(brute(apercus));
  if ('erreur' in a) throw new Error(a.erreur);
  return a;
}

describe('le choix de l apercu d une ligne', () => {
  const a = annexe({ 'fontsource:roboto': CODE, 'fontsource:casse': 'M' });

  it('prefere la police disponible, puis l apercu prepare, puis le nom ecrit', () => {
    const p = police('inter');
    const disponible = choisirApercu('Roboto', p, 'fontsource:roboto', a);
    expect(disponible.source).toBe('disponible');
    expect(choisirApercu('Roboto', null, 'fontsource:roboto', a)).toMatchObject({ source: 'prepare', plein: true, trace: { largeur: 20 } });
    expect(choisirApercu('Roboto', null, 'fontsource:roboto', null)).toEqual({ source: 'nom' });
    expect(choisirApercu('Inconnue', null, 'fontsource:inconnue', a)).toEqual({ source: 'nom' });
    // Un code qui ne se decode pas laisse le nom ecrit, sans lever.
    expect(choisirApercu('Casse', null, 'fontsource:casse', a)).toEqual({ source: 'nom' });
    expect(choisirApercu('Inter', null, null, a)).toEqual({ source: 'nom' });
  });

  it('retombe sur l apercu prepare quand la police chargee ne sait pas dessiner le nom', () => {
    const sansR = police('deposee', { ...glyphesCarres, possede: c => c !== 'R' });
    expect(choisirApercu('Roboto', sansR, 'fontsource:roboto', a).source).toBe('prepare');
    expect(choisirApercu('Roboto', sansR, null, a)).toEqual({ source: 'nom' });
    // Une fonte etrange qui leve en composant ne casse pas la liste.
    const cassee = police('cassee', { ...glyphesCarres, contour: () => { throw new Error('fonte cassee'); } });
    expect(choisirApercu('Roboto', cassee, null, a)).toEqual({ source: 'nom' });
  });

  it('peint une police a trait unique au trait, sans fond', () => {
    expect(choisirApercu('EMS', police('ems-readability', glyphesCarres, 'trait'), null, null)).toMatchObject({ source: 'disponible', plein: false });
  });

  it('calcule chaque apercu une fois, par police et par annexe (ADR-0008)', () => {
    const p = police('inter');
    expect(apercuDePolice(p, 'Inter')).toBe(apercuDePolice(p, 'Inter'));
    expect(apercuDePolice(p, 'Inter')).not.toBe(apercuDePolice(p, 'Inter gras'));
    expect(apercuPrepare(a, 'fontsource:roboto')).toBe(apercuPrepare(a, 'fontsource:roboto'));
  });
});

describe('l annexe des apercus', () => {
  it('se nomme et se pose comme les autres annexes', () => {
    expect(ANNEXE_APERCUS.fichier).toBe('polices-apercus.js');
    expect(ANNEXE_APERCUS.globale).toBe('__apercusPolicesSvg');
  });

  it('refuse une globale malformee ou trop grosse sans lever, et le dit au chargement', async () => {
    const hostiles: unknown[] = [undefined, null, 'window.alert(1)', { format: 1 }, brute({ 'fontsource:x': 'x'.repeat(100_000) }), brute({ '<img>': CODE }), Object.create(null) as unknown];
    for (const h of hostiles) {
      expect(() => ANNEXE_APERCUS.valider(h)).not.toThrow();
      expect(ANNEXE_APERCUS.valider(h)).toBeUndefined();
    }
    // Le script arrive mais pose une valeur refusee : le chargement echoue en le disant (la liste ecrit alors les noms).
    const malforme = chargeurApercus({ injecter: () => Promise.resolve(true), lire: () => ({ format: 1, apercus: 'tout' }) });
    await expect(malforme.charger()).rejects.toThrow('Le fichier polices-apercus.js ne contient pas les aperçus des polices.');
    const absent = chargeurApercus({ injecter: () => Promise.resolve(false), lire: () => undefined });
    await expect(absent.charger()).rejects.toThrow('introuvable');
    // Une annexe valide se charge.
    let posee: unknown;
    const bon = chargeurApercus({ injecter: () => { posee = brute({ 'fontsource:roboto': CODE }); return Promise.resolve(true); }, lire: () => posee });
    expect((await bon.charger()).apercus.get('fontsource:roboto')).toBe(CODE);
  });
});

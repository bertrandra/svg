import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { FICHIER_BIBLIOTHEQUE, type Bibliotheque } from '../../../src/io/bibliotheque.js';
import { SOURCES_FORMES } from '../../../src/model/sourcesFormes.js';

const bibliotheque: Bibliotheque = { source: 'game-icons.net', licence: 'CC BY 3.0', url: 'https://game-icons.net', evenements: [], entrees: [] };

afterEach(() => vi.unstubAllGlobals());

// La promesse est memorisee dans le module : chaque test repart d'un module neuf.
beforeEach(() => vi.resetModules());
const module = () => import('../../../src/io/bibliotheque.js');

/** Une page dont la balise <script> « arrive » (en posant la bibliotheque) ou « manque », selon le test. */
function installerPage(arrivee: 'charge' | 'vide' | 'introuvable') {
  const w: { __bibliothequeSvg?: Bibliotheque } = {};
  const scripts: Array<{ src: string; remove: ReturnType<typeof vi.fn> }> = [];
  vi.stubGlobal('window', w);
  vi.stubGlobal('document', {
    createElement: () => {
      const s = { src: '', onload: null as (() => void) | null, onerror: null as (() => void) | null, remove: vi.fn() };
      scripts.push(s);
      return s;
    },
    head: {
      appendChild: (s: { onload: () => void; onerror: () => void }) => queueMicrotask(() => {
        if (arrivee === 'introuvable') { s.onerror(); return; }
        if (arrivee === 'charge') w.__bibliothequeSvg = bibliotheque;
        s.onload();
      })
    }
  });
  return { w, scripts };
}

describe('bibliothequeChargee', () => {
  it('dit si le script est deja arrive, sans le demander', async () => {
    vi.stubGlobal('window', {});
    const { bibliothequeChargee } = await module();
    expect(bibliothequeChargee()).toBe(false);
    vi.stubGlobal('window', { __bibliothequeSvg: bibliotheque });
    expect(bibliothequeChargee()).toBe(true);
  });
});

describe('chargerBibliotheque', () => {
  it('ajoute ' + FICHIER_BIBLIOTHEQUE + ' a la page une fois, le retire, et memorise le resultat', async () => {
    const { scripts } = installerPage('charge');
    const { chargerBibliotheque } = await module();
    const [a, b] = await Promise.all([chargerBibliotheque(), chargerBibliotheque()]);
    expect(a).toBe(bibliotheque);
    expect(b).toBe(bibliotheque);
    expect(await chargerBibliotheque()).toBe(bibliotheque);
    expect(scripts.length).toBe(1);
    expect(scripts[0]?.src).toBe(FICHIER_BIBLIOTHEQUE);
    expect(scripts[0]?.remove).toHaveBeenCalledTimes(1);
  });

  it('dit que le fichier manque a cote de la page, et le redemande a l appel suivant', async () => {
    const { scripts } = installerPage('introuvable');
    const { chargerBibliotheque } = await module();
    await expect(chargerBibliotheque()).rejects.toThrow('introuvable à côté de la page');
    await expect(chargerBibliotheque()).rejects.toThrow('npm run bibliotheque');
    expect(scripts.length).toBe(2);
    expect(scripts[0]?.remove).toHaveBeenCalledTimes(1);
  });

  it('dit que le fichier ne contient pas la bibliotheque quand il arrive sans elle', async () => {
    installerPage('vide');
    const { chargerBibliotheque } = await module();
    await expect(chargerBibliotheque()).rejects.toThrow('ne contient pas la bibliothèque');
  });
});

describe('les annexes des sources libres', () => {
  const lucide = SOURCES_FORMES.filter(s => s.id === 'lucide')[0];

  it('se normalisent : la source attendue seulement, des entrees completes, une nature connue, la source rendue a chaque entree', async () => {
    const { normaliserSource } = await module();
    if (!lucide) throw new Error('lucide absent du registre');
    const brut = { source: 'lucide', entrees: [{ id: 'a', nom: 'a', svg: '<svg/>', evenements: [], nature: 'ligne' }, { id: 'b', nom: 'b', svg: '<svg/>', evenements: ['noel'], nature: 'etrange' }, { id: 3 }] };
    expect(normaliserSource(lucide, brut)?.entrees).toEqual([
      { id: 'a', nom: 'a', svg: '<svg/>', evenements: [], source: 'lucide', nature: 'ligne' },
      { id: 'b', nom: 'b', svg: '<svg/>', evenements: ['noel'], source: 'lucide', nature: 'plein' }
    ]);
    expect(normaliserSource(lucide, { ...brut, source: 'mdi' })).toBeUndefined();
    expect(normaliserSource(lucide, null)).toBeUndefined();
  });

  it('se chargent a la demande par leur propre fichier, une source inconnue refusee en la nommant', async () => {
    const w: Record<string, unknown> = {};
    const scripts: string[] = [];
    vi.stubGlobal('window', w);
    vi.stubGlobal('document', {
      createElement: () => ({ src: '', onload: null as (() => void) | null, onerror: null as (() => void) | null, remove: vi.fn() }),
      head: { appendChild: (s: { src: string; onload: () => void }) => queueMicrotask(() => { scripts.push(s.src); w['__bibliothequeSvgLucide'] = { source: 'lucide', entrees: [] }; s.onload(); }) }
    });
    const { chargerSource, sourceChargee } = await module();
    expect(sourceChargee('lucide')).toBe(false);
    expect((await chargerSource('lucide')).source).toBe('lucide');
    expect(scripts).toEqual(['bibliotheque-lucide.js']);
    expect(sourceChargee('lucide')).toBe(true);
    await expect(chargerSource('inconnue')).rejects.toThrow('Source de formes inconnue : inconnue.');
  });
});

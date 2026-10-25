import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse, type Font } from 'opentype.js';
import { glyphesDe, lirePolice, policeDeposee, FICHIER_POLICES } from '../../../src/io/polices.js';
import { composer } from '../../../src/engine/texte.js';
import { boiteChemin } from '../../../src/engine/editionSvg.js';

const octetsInter = readFileSync(resolve(__dirname, '../../../node_modules/@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'));
const bufferInter = (): ArrayBuffer => octetsInter.buffer.slice(octetsInter.byteOffset, octetsInter.byteOffset + octetsInter.byteLength) as ArrayBuffer;
const base64Inter = octetsInter.toString('base64');
const illisible = (): ArrayBuffer => new TextEncoder().encode('ceci n est pas une fonte').buffer as ArrayBuffer;

afterEach(() => vi.unstubAllGlobals());

describe('glyphesDe, sur une vraie fonte', () => {
  const g = glyphesDe(parse(bufferInter()));

  it('donne les unites, l avance et le contour de chaque caractere', () => {
    expect(g.unitesParEm).toBeGreaterThan(0);
    expect(g.avance('M')).toBeGreaterThan(g.avance('i'));
    const o = g.contour('A', 10, 100, 50);
    expect(o[0]?.type).toBe('M');
    // Pose en (10, 100) a la taille 50 : la lettre monte au-dessus de la ligne de base.
    expect(Math.min(...o.map(c => c.y ?? Infinity))).toBeLessThan(100);
    expect(Math.min(...o.map(c => c.x ?? Infinity))).toBeGreaterThanOrEqual(10 - 1);
  });

  it('rend des contours qui reviennent a leur point de depart (opentype.js 2.0 n emet pas de Z)', () => {
    const o = g.contour('A', 0, 0, 50);
    const sousChemins: Array<{ debut: [number, number]; fin: [number, number] }> = [];
    for (const c of o) {
      const p: [number, number] = [c.x ?? NaN, c.y ?? NaN];
      if (c.type === 'M') sousChemins.push({ debut: p, fin: p });
      else if (c.type !== 'Z' && sousChemins.length) (sousChemins[sousChemins.length - 1] as { fin: [number, number] }).fin = p;
    }
    // Un A a deux contours : le dehors et le trou.
    expect(sousChemins.length).toBe(2);
    for (const s of sousChemins) expect(s.fin).toEqual(s.debut);
  });

  it('donne un crenage numerique : negatif sur la paire AV d Oswald, nul quand la fonte n en dit rien', () => {
    const octets = readFileSync(resolve(__dirname, '../../../node_modules/@expo-google-fonts/oswald/400Regular/Oswald_400Regular.ttf'));
    const oswald = glyphesDe(parse(octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength) as ArrayBuffer));
    expect(oswald.crenage('A', 'V')).toBeLessThan(0);
    expect(oswald.crenage('V', 'A')).toBeLessThan(0);
    expect(oswald.crenage('o', 'o')).toBe(0);
    expect(typeof g.crenage('x', 'y')).toBe('number');
  });

  it('compose le meme texte aux memes lettres, d une lecture a l autre', () => {
    const a = composer('Noël', g, { taille: 40, x: 0, y: 40 }), b = composer('Noël', glyphesDe(parse(bufferInter())), { taille: 40, x: 0, y: 40 });
    expect(a).toEqual(b);
    expect(a.length).toBe(4);
    expect(boiteChemin(a[0]?.d ?? [])?.h).toBeGreaterThan(20);
  });
});

// Les fontes embarquees (scripts/polices.mjs), lues telles quelles. opentype.js 2.0 ne lit pas les
// lookups d'extension (type 9) de la table GPOS : Inter et Playfair rendaient 0 pour A-V, Fredoka aussi.
describe('le crenage des fontes embarquees, lu dans la table GPOS', () => {
  const lire = (chemin: string) => {
    const o = readFileSync(resolve(__dirname, '../../../node_modules/@expo-google-fonts', chemin));
    const octets = o.buffer.slice(o.byteOffset, o.byteOffset + o.byteLength) as ArrayBuffer;
    return { octets, fonte: parse(octets) };
  };
  const LETTRES = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'];

  it.each([
    ['inter/400Regular/Inter_400Regular.ttf', 'Inter'], ['inter/700Bold/Inter_700Bold.ttf', 'Inter gras'],
    ['playfair-display/700Bold/PlayfairDisplay_700Bold.ttf', 'Playfair Display gras'], ['fredoka/600SemiBold/Fredoka_600SemiBold.ttf', 'Fredoka']
  ])('%s (%s) : A-V se resserre, ce que la bibliotheque seule ne voyait pas', chemin => {
    const { octets, fonte } = lire(chemin);
    expect(glyphesDe(fonte).crenage('A', 'V')).toBe(0);
    const g = glyphesDe(fonte, octets);
    expect(g.crenage('A', 'V')).toBeLessThan(0);
    expect(g.crenage('V', 'A')).toBeLessThan(0);
    // Une paire sans rapport reste a zero : le crenage n'est pas un decalage general.
    expect(g.crenage('o', 'o')).toBe(0);
  });

  it.each([
    ['oswald/500Medium/Oswald_500Medium.ttf', -36], ['bebas-neue/400Regular/BebasNeue_400Regular.ttf', -28], ['caveat/700Bold/Caveat_700Bold.ttf', -40]
  ])('%s : A-V ne bouge pas (%d), ni aucune paire de lettres que la bibliotheque lisait', (chemin, av) => {
    const { octets, fonte } = lire(chemin);
    const avant = glyphesDe(fonte), apres = glyphesDe(fonte, octets);
    expect(apres.crenage('A', 'V')).toBe(av);
    expect(avant.crenage('A', 'V')).toBe(av);
    const bougees = LETTRES.flatMap(a => LETTRES.filter(b => avant.crenage(a, b) !== 0 && avant.crenage(a, b) !== apres.crenage(a, b)).map(b => a + b));
    expect(bougees).toEqual([]);
  });

  it.each([
    ['lobster/400Regular/Lobster_400Regular.ttf'], ['pacifico/400Regular/Pacifico_400Regular.ttf']
  ])('%s : la fonte n a pas de paire A-V (0 est juste), et aucune paire de lettres ne change', chemin => {
    const { octets, fonte } = lire(chemin);
    const avant = glyphesDe(fonte), apres = glyphesDe(fonte, octets);
    expect(apres.crenage('A', 'V')).toBe(0);
    const bougees = LETTRES.flatMap(a => LETTRES.filter(b => avant.crenage(a, b) !== apres.crenage(a, b)).map(b => a + b));
    expect(bougees).toEqual([]);
  });

  it('lirePolice donne le crenage GPOS, et composer resserre A-V de ce crenage', () => {
    const { octets } = lire('inter/400Regular/Inter_400Regular.ttf');
    const g = lirePolice('inter', 'Inter', octets)?.glyphes;
    if (!g) throw new Error('Inter ne se lit pas');
    const pose = (glyphes: typeof g) => composer('AV', glyphes, { taille: 100, x: 0, y: 100 });
    const ecartDe = (l: ReturnType<typeof pose>) => (boiteChemin(l[1]?.d ?? [])?.x ?? 0) - (boiteChemin(l[0]?.d ?? [])?.x ?? 0);
    const ecart = ecartDe(pose(g)), ecart0 = ecartDe(pose({ ...g, crenage: () => 0 }));
    expect(ecart).toBeLessThan(ecart0);
    expect(ecart0 - ecart).toBeCloseTo(-g.crenage('A', 'V') * 100 / g.unitesParEm, 2);
  });
});

describe('glyphesDe, sur une fonte factice', () => {
  /** Une fonte dont tout est connu, y compris ses defaillances. */
  function fonteFausse(options: { avance?: number; crenageLeve?: boolean } = {}) {
    const lectures = vi.fn();
    const glyphe = { advanceWidth: options.avance, getPath: () => ({ commands: [] }) };
    const fonte = {
      unitsPerEm: 1000,
      ascender: 800,
      descender: -200,
      charToGlyph: (c: string) => { lectures(c); return glyphe; },
      getKerningValue: () => { if (options.crenageLeve) throw new Error('table kern absente'); return 0; }
    } as unknown as Font;
    return { fonte, lectures };
  }

  it('prend une demi-em quand la glyphe n a pas d avance', () => {
    expect(glyphesDe(fonteFausse().fonte).avance('x')).toBe(500);
    expect(glyphesDe(fonteFausse({ avance: 640 }).fonte).avance('x')).toBe(640);
  });

  it('rend un crenage nul plutot que de lever quand la fonte n en sait rien', () => {
    expect(glyphesDe(fonteFausse({ crenageLeve: true }).fonte).crenage('A', 'V')).toBe(0);
    expect(glyphesDe(fonteFausse().fonte).crenage('A', 'V')).toBe(0);
  });

  it('ne lit chaque glyphe qu une fois', () => {
    const { fonte, lectures } = fonteFausse();
    const g = glyphesDe(fonte);
    g.avance('a'); g.avance('a'); g.contour('a', 0, 0, 10); g.crenage('a', 'b'); g.crenage('a', 'b');
    expect(lectures.mock.calls.filter(c => c[0] === 'a').length).toBe(1);
    expect(lectures.mock.calls.filter(c => c[0] === 'b').length).toBe(1);
  });
});

describe('lirePolice', () => {
  it('lit une fonte TTF et rend ses glyphes sous l identifiant donne', () => {
    const p = lirePolice('inter', 'Inter', bufferInter());
    expect(p).toMatchObject({ id: 'inter', nom: 'Inter' });
    expect(p?.glyphes.unitesParEm).toBeGreaterThan(0);
  });

  it('rend null, sans lever, pour un fichier qui n est pas une fonte', () => {
    expect(lirePolice('x', 'X', illisible())).toBeNull();
    expect(lirePolice('x', 'X', new ArrayBuffer(0))).toBeNull();
  });
});

describe('policeDeposee', () => {
  const fichier = (nom: string, contenu: ArrayBuffer) => ({ name: nom, arrayBuffer: () => Promise.resolve(contenu) }) as unknown as File;

  // L'identifiant est l'empreinte des octets (`u-` et 14 chiffres hexadecimaux, ADR-0022) : un texte vivant l'ecrit dans le
  // SVG, jamais le fichier ni un nom libre. Il remplace l'ancien « deposee-<nom> », qu'aucun fichier ecrit ne portait.
  it('nomme la fonte d apres le fichier, sans son extension TTF ou OTF, majuscules comprises, et l identifie par son empreinte', async () => {
    const a = await policeDeposee(fichier('Ma Fonte.ttf', bufferInter()));
    expect(a).toMatchObject({ nom: 'Ma Fonte', nature: 'contour' });
    expect('id' in a && a.id).toMatch(/^u-[0-9a-f]{14}$/);
    const b = await policeDeposee(fichier('AUTRE.OTF', bufferInter()));
    expect(b).toMatchObject({ nom: 'AUTRE' });
    expect('id' in b && 'id' in a && b.id === a.id && 'version' in a && a.id === 'u-' + a.version).toBe(true);
  });

  it('dit quels formats se deposent quand la fonte ne se lit pas', async () => {
    const r = await policeDeposee(fichier('cassee.ttf', illisible()));
    expect('erreur' in r && r.erreur).toContain('TTF ou OTF');
  });
});

describe('chargerPolices', () => {
  // La promesse est memorisee dans le module : chaque test repart d'un module neuf.
  beforeEach(() => vi.resetModules());
  const charger = async () => (await import('../../../src/io/polices.js')).chargerPolices;

  /** Un document ou la balise <script> « arrive » ou « manque » selon le test. */
  function installerScript(arrivee: 'charge' | 'introuvable', pose?: (w: Record<string, unknown>) => void) {
    const w: Record<string, unknown> = {};
    const ajoutes: Array<{ src: string; remove: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal('window', w);
    vi.stubGlobal('document', {
      createElement: () => {
        const s = { src: '', onload: null as (() => void) | null, onerror: null as (() => void) | null, remove: vi.fn() };
        ajoutes.push(s);
        return s;
      },
      head: { appendChild: (s: { onload: () => void; onerror: () => void }) => queueMicrotask(() => { if (arrivee === 'charge') { pose?.(w); s.onload(); } else s.onerror(); }) }
    });
    return { w, ajoutes };
  }

  it('lit les fontes deja arrivees (base64), et laisse de cote celles qui ne se lisent pas', async () => {
    vi.stubGlobal('window', { __policesSvg: [{ id: 'inter', nom: 'Inter', base64: base64Inter }, { id: 'cassee', nom: 'Cassée', base64: Buffer.from('rien').toString('base64') }] });
    const polices = await (await charger())();
    expect(polices.map(p => p.id)).toEqual(['inter']);
    expect(polices[0]?.glyphes.avance('M')).toBeGreaterThan(0);
  });

  it('injecte ' + FICHIER_POLICES + ' une fois, le retire de la page, et memorise le resultat', async () => {
    const { ajoutes } = installerScript('charge', w => { w.__policesSvg = [{ id: 'inter', nom: 'Inter', base64: base64Inter }]; });
    const chargerPolices = await charger();
    const [a, b] = await Promise.all([chargerPolices(), chargerPolices()]);
    expect(a).toBe(b);
    expect(a.length).toBe(1);
    expect(ajoutes.length).toBe(1);
    expect(ajoutes[0]?.src).toBe(FICHIER_POLICES);
    expect(ajoutes[0]?.remove).toHaveBeenCalledTimes(1);
  });

  it('dit que le fichier manque, puis recommence a l appel suivant', async () => {
    const { ajoutes } = installerScript('introuvable');
    const chargerPolices = await charger();
    await expect(chargerPolices()).rejects.toThrow('introuvable à côté de la page');
    await expect(chargerPolices()).rejects.toThrow('introuvable');
    expect(ajoutes.length).toBe(2);
  });

  it('dit que le fichier ne contient pas les polices quand il arrive vide', async () => {
    installerScript('charge');
    await expect((await charger())()).rejects.toThrow('ne contient pas les polices');
  });
});

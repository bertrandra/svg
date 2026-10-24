import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { copier, pause, proposer, texteOctets } from '../../../src/io/fichiers.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('texteOctets', () => {
  it('encode en UTF-8, accents et caracteres hors plan de base compris', () => {
    expect(Array.from(texteOctets('abc'))).toEqual([97, 98, 99]);
    expect(Array.from(texteOctets('é'))).toEqual([0xc3, 0xa9]);
    expect(Array.from(texteOctets('€'))).toEqual([0xe2, 0x82, 0xac]);
    expect(Array.from(texteOctets('🎄'))).toEqual([0xf0, 0x9f, 0x8e, 0x84]);
    expect(texteOctets('').length).toBe(0);
  });

  it('rend des octets qui se relisent en texte, un SVG accentue compris', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><title>Noël à Pâques</title></svg>';
    expect(new TextDecoder().decode(texteOctets(svg))).toBe(svg);
  });
});

describe('pause', () => {
  it('rend la main apres un rendu du navigateur, puis un tour de boucle', async () => {
    const ordre: string[] = [];
    vi.stubGlobal('requestAnimationFrame', (f: () => void) => { ordre.push('image'); queueMicrotask(f); return 1; });
    await pause().then(() => ordre.push('fin'));
    expect(ordre).toEqual(['image', 'fin']);
  });
});

describe('copier', () => {
  it('copie dans le presse-papiers et le dit', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copier('<svg/>')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('<svg/>');
  });

  it('rend faux, sans lever, quand la page n a pas le droit', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('refuse')) } });
    expect(await copier('x')).toBe(false);
    vi.stubGlobal('navigator', {});
    expect(await copier('x')).toBe(false);
  });
});

describe('proposer, par la capacite « downloads » de la page hote', () => {
  const save = vi.fn();
  const hote = (use: () => Promise<unknown>) => vi.stubGlobal('window', { claude: { use } });
  beforeEach(() => save.mockReset());

  it('confie le fichier a l hote, en Blob, sous le nom donne', async () => {
    save.mockResolvedValue(undefined);
    const use = vi.fn().mockResolvedValue({ save });
    hote(use);
    const phrase = await proposer('logo.svg', texteOctets('<svg/>'));
    expect(use).toHaveBeenCalledWith('downloads');
    expect(phrase).toBe('Fichier proposé : logo.svg.');
    const arg = save.mock.calls[0]?.[0] as { filename: string; data: Blob };
    expect(arg.filename).toBe('logo.svg');
    expect(await arg.data.text()).toBe('<svg/>');
  });

  it('garde le Blob qu on lui donne', async () => {
    save.mockResolvedValue(undefined);
    hote(() => Promise.resolve({ save }));
    const blob = new Blob(['png'], { type: 'image/png' });
    await proposer('a.png', blob);
    expect((save.mock.calls[0]?.[0] as { data: Blob }).data).toBe(blob);
  });

  it('distingue un refus de la personne d un echec', async () => {
    hote(() => Promise.resolve({ save }));
    save.mockRejectedValueOnce({ code: 'declined' });
    expect(await proposer('a.svg', texteOctets('x'))).toBe('Téléchargement annulé.');
    save.mockRejectedValueOnce({ code: 'quota' });
    expect(await proposer('a.svg', texteOctets('x'))).toBe('Le téléchargement a échoué (quota).');
    save.mockRejectedValueOnce(new Error('sans code'));
    expect(await proposer('a.svg', texteOctets('x'))).toBe('Le téléchargement a échoué (inconnu).');
    save.mockRejectedValueOnce(null);
    expect(await proposer('a.svg', texteOctets('x'))).toBe('Le téléchargement a échoué (inconnu).');
  });
});

describe('proposer, par un lien de telechargement', () => {
  interface LienFaux { href: string; download: string; click: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }

  /** Un document a un seul element, le lien, et le journal de ce qu'on en fait. */
  function installerDocument(): { lien: LienFaux; journal: string[] } {
    const journal: string[] = [];
    const lien: LienFaux = { href: '', download: '', click: vi.fn(() => journal.push('clic')), remove: vi.fn(() => journal.push('retrait')) };
    vi.stubGlobal('document', {
      createElement: (balise: string) => { journal.push('cree ' + balise); return lien; },
      body: { appendChild: () => journal.push('ajout') }
    });
    return { lien, journal };
  }

  it('clique un lien ajoute a la page puis retire, sous le nom donne', async () => {
    vi.stubGlobal('window', {});
    const { lien, journal } = installerDocument();
    const phrase = await proposer('dessin.svg', texteOctets('<svg/>'));
    expect(phrase).toBe('Fichier enregistré : dessin.svg.');
    expect(lien.download).toBe('dessin.svg');
    expect(lien.href.startsWith('blob:')).toBe(true);
    expect(journal).toEqual(['cree a', 'ajout', 'clic', 'retrait']);
  });

  it('passe par le lien aussi quand l hote ne sait pas telecharger', async () => {
    vi.stubGlobal('window', { claude: { use: () => Promise.reject(new Error('pas de capacite')) } });
    const { lien } = installerDocument();
    expect(await proposer('a.svg', texteOctets('x'))).toBe('Fichier enregistré : a.svg.');
    expect(lien.click).toHaveBeenCalledTimes(1);
  });

  it('passe par le lien quand l hote n a pas de methode use', async () => {
    vi.stubGlobal('window', { claude: {} });
    const { lien } = installerDocument();
    await proposer('a.svg', texteOctets('x'));
    expect(lien.click).toHaveBeenCalledTimes(1);
  });

  it('libere l adresse du Blob au bout d une minute, pas avant', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {});
    installerDocument();
    const revoque = vi.spyOn(URL, 'revokeObjectURL');
    await proposer('a.svg', texteOctets('x'));
    vi.advanceTimersByTime(59999);
    expect(revoque).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(revoque).toHaveBeenCalledTimes(1);
    revoque.mockRestore();
  });
});
